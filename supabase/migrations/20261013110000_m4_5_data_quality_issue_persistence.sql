-- StoreAgent M4.5
-- Atomic durable data-quality issue persistence.
--
-- One OPEN row per (organization_id, issue_key).
-- Callers competing for that identity take a transaction-scoped advisory
-- lock before reading, because a missing row cannot be locked with
-- SELECT ... FOR UPDATE.
--
-- Hash collisions may serialize extra callers. They cannot merge issue
-- keys because the partial unique index remains authoritative.
--
-- Open reconciliation:
--   preserve id and detected_at
--   last_detected_at = max(existing, incoming)
--   occurrence_count increments by exactly one
--   status stays open and resolved_at stays null
--   message, remediation, and source context refresh from the candidate
--   severity is monotonic: critical > high > medium > low > info
--
-- Resolved history stays immutable. A later detection inserts a new open row.
-- Ignored and superseded history is not reopened and does not gain a new
-- open row. M4.5 does not own merchant lifecycle policy, so those states
-- fail closed.
--
-- Tenant ownership comes only from trusted ids. source_context is bounded
-- provenance and never establishes tenancy.

create or replace function public.data_quality_json_string(
  p_value text
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  character_text text;
  code integer;
  shifted integer;
  encoded text := '"';
begin
  if p_value is null then
    return 'null';
  end if;

  for character_index in 1..pg_catalog.length(p_value) loop
    character_text :=
      pg_catalog.substring(p_value, character_index, 1);
    code := pg_catalog.ascii(character_text);

    if code = 34 then
      encoded := encoded || pg_catalog.chr(92) || character_text;
    elsif code = 92 then
      encoded := encoded || pg_catalog.chr(92) || character_text;
    elsif code = 8 then
      encoded := encoded || pg_catalog.chr(92) || 'b';
    elsif code = 12 then
      encoded := encoded || pg_catalog.chr(92) || 'f';
    elsif code = 10 then
      encoded := encoded || pg_catalog.chr(92) || 'n';
    elsif code = 13 then
      encoded := encoded || pg_catalog.chr(92) || 'r';
    elsif code = 9 then
      encoded := encoded || pg_catalog.chr(92) || 't';
    elsif code < 32 then
      encoded :=
        encoded
        || pg_catalog.chr(92)
        || 'u'
        || pg_catalog.lpad(pg_catalog.to_hex(code), 4, '0');
    elsif code > 65535 then
      shifted := code - 65536;
      encoded :=
        encoded
        || pg_catalog.chr(92)
        || 'u'
        || pg_catalog.lpad(
          pg_catalog.to_hex(55296 + (shifted / 1024)),
          4,
          '0'
        )
        || pg_catalog.chr(92)
        || 'u'
        || pg_catalog.lpad(
          pg_catalog.to_hex(56320 + (shifted % 1024)),
          4,
          '0'
        );
    else
      encoded := encoded || character_text;
    end if;
  end loop;

  return encoded || '"';
end;
$$;

create or replace function public.data_quality_severity_rank(
  p_severity text
)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
begin
  case p_severity
    when 'critical' then
      return 5;
    when 'high' then
      return 4;
    when 'medium' then
      return 3;
    when 'low' then
      return 2;
    when 'info' then
      return 1;
    else
      raise exception
        'data quality issue severity is not supported';
  end case;
end;
$$;

revoke all
on function public.data_quality_json_string(text)
from public, anon, authenticated;

revoke all
on function public.data_quality_severity_rank(text)
from public, anon, authenticated;

create or replace function public.persist_data_quality_issue(
  p_organization_id uuid,
  p_store_id uuid,
  p_location_id uuid,
  p_variant_id uuid,
  p_issue_code text,
  p_issue_key text,
  p_severity text,
  p_message text,
  p_remediation_hint text,
  p_source_context jsonb,
  p_detected_at timestamptz,
  p_subject_kind text,
  p_subject_store_id text,
  p_subject_location_id text,
  p_subject_variant_id text,
  p_integration_id text,
  p_provider text,
  p_resource_type text,
  p_external_id text
)
returns table (
  disposition text,
  issue_id uuid,
  issue_key text,
  occurrence_count integer,
  severity text,
  detected_at timestamptz,
  last_detected_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  issue_code text;
  subject_kind text;
  subject_store_id text;
  subject_location_id text;
  subject_variant_id text;
  integration_id text;
  provider text;
  resource_type text;
  external_id text;
  canonical_key text;
  issue_message text;
  issue_remediation_hint text;
  issue_source_context jsonb;
  existing public.data_quality_issues%rowtype;
  next_severity text;
  next_last_detected_at timestamptz;
  created public.data_quality_issues%rowtype;
  context_keys text[];
  context_provenance text;
begin
  if p_organization_id is null then
    raise exception
      'data quality issue organization is required';
  end if;

  if p_detected_at is null then
    raise exception
      'data quality issue detected_at is required';
  end if;

  if not exists (
    select 1
    from public.organizations organization
    where organization.id = p_organization_id
  ) then
    raise exception
      'data quality issue canonical ownership is invalid';
  end if;

  if p_location_id is not null and p_store_id is null then
    raise exception
      'data quality issue canonical scope is invalid';
  end if;

  if p_variant_id is not null and p_store_id is null then
    raise exception
      'data quality issue canonical scope is invalid';
  end if;

  if p_store_id is not null and not exists (
    select 1
    from public.stores store
    where
      store.organization_id = p_organization_id
      and store.id = p_store_id
  ) then
    raise exception
      'data quality issue canonical ownership is invalid';
  end if;

  if p_location_id is not null and not exists (
    select 1
    from public.locations location
    where
      location.organization_id = p_organization_id
      and location.store_id = p_store_id
      and location.id = p_location_id
  ) then
    raise exception
      'data quality issue canonical ownership is invalid';
  end if;

  if p_variant_id is not null and not exists (
    select 1
    from public.product_variants variant
    where
      variant.organization_id = p_organization_id
      and variant.store_id = p_store_id
      and variant.id = p_variant_id
  ) then
    raise exception
      'data quality issue canonical ownership is invalid';
  end if;

  issue_code := pg_catalog.btrim(p_issue_code);
  subject_kind := p_subject_kind;

  if issue_code is null or pg_catalog.length(issue_code) = 0 then
    raise exception
      'data quality issue code must not be blank';
  end if;

  if subject_kind is null or subject_kind not in (
    'organization',
    'store',
    'location',
    'variant',
    'location_variant',
    'provider'
  ) then
    raise exception
      'data quality issue identity scope is invalid';
  end if;

  if p_severity is null or p_severity not in (
    'critical',
    'high',
    'medium',
    'low',
    'info'
  ) then
    raise exception
      'data quality issue severity is not supported';
  end if;

  issue_message := pg_catalog.btrim(p_message);

  if issue_message is null or pg_catalog.length(issue_message) = 0 then
    raise exception
      'data quality issue message must not be blank';
  end if;

  if p_remediation_hint is null then
    issue_remediation_hint := null;
  else
    issue_remediation_hint := pg_catalog.btrim(p_remediation_hint);

    if pg_catalog.length(issue_remediation_hint) = 0 then
      raise exception
        'data quality issue remediation hint must not be blank';
    end if;
  end if;

  subject_store_id :=
    case
      when p_subject_store_id is null then null
      else pg_catalog.btrim(p_subject_store_id)
    end;
  subject_location_id :=
    case
      when p_subject_location_id is null then null
      else pg_catalog.btrim(p_subject_location_id)
    end;
  subject_variant_id :=
    case
      when p_subject_variant_id is null then null
      else pg_catalog.btrim(p_subject_variant_id)
    end;
  integration_id :=
    case
      when p_integration_id is null then null
      else pg_catalog.btrim(p_integration_id)
    end;
  external_id :=
    case
      when p_external_id is null then null
      else pg_catalog.btrim(p_external_id)
    end;
  provider := p_provider;
  resource_type := p_resource_type;

  if subject_kind = 'organization' then
    if
      p_store_id is not null
      or p_location_id is not null
      or p_variant_id is not null
      or subject_store_id is not null
      or subject_location_id is not null
      or subject_variant_id is not null
      or integration_id is not null
      or provider is not null
      or resource_type is not null
      or external_id is not null
    then
      raise exception
        'data quality issue canonical scope is invalid';
    end if;

    canonical_key :=
      '['
      || public.data_quality_json_string('dq-v1')
      || ','
      || public.data_quality_json_string(issue_code)
      || ','
      || public.data_quality_json_string('organization')
      || ']';
  elsif subject_kind = 'store' then
    if
      p_store_id is null
      or p_location_id is not null
      or p_variant_id is not null
      or subject_store_id is null
      or subject_location_id is not null
      or subject_variant_id is not null
      or integration_id is not null
      or provider is not null
      or resource_type is not null
      or external_id is not null
      or p_store_id is distinct from subject_store_id::uuid
    then
      raise exception
        'data quality issue canonical scope is invalid';
    end if;

    canonical_key :=
      '['
      || public.data_quality_json_string('dq-v1')
      || ','
      || public.data_quality_json_string(issue_code)
      || ','
      || public.data_quality_json_string('store')
      || ','
      || public.data_quality_json_string(subject_store_id)
      || ']';
  elsif subject_kind = 'location' then
    if
      p_store_id is null
      or p_location_id is null
      or p_variant_id is not null
      or subject_store_id is not null
      or subject_location_id is null
      or subject_variant_id is not null
      or integration_id is not null
      or provider is not null
      or resource_type is not null
      or external_id is not null
      or p_location_id is distinct from subject_location_id::uuid
    then
      raise exception
        'data quality issue canonical scope is invalid';
    end if;

    canonical_key :=
      '['
      || public.data_quality_json_string('dq-v1')
      || ','
      || public.data_quality_json_string(issue_code)
      || ','
      || public.data_quality_json_string('location')
      || ','
      || public.data_quality_json_string(subject_location_id)
      || ']';
  elsif subject_kind = 'variant' then
    if
      p_store_id is null
      or p_location_id is not null
      or p_variant_id is null
      or subject_store_id is not null
      or subject_location_id is not null
      or subject_variant_id is null
      or integration_id is not null
      or provider is not null
      or resource_type is not null
      or external_id is not null
      or p_variant_id is distinct from subject_variant_id::uuid
    then
      raise exception
        'data quality issue canonical scope is invalid';
    end if;

    canonical_key :=
      '['
      || public.data_quality_json_string('dq-v1')
      || ','
      || public.data_quality_json_string(issue_code)
      || ','
      || public.data_quality_json_string('variant')
      || ','
      || public.data_quality_json_string(subject_variant_id)
      || ']';
  elsif subject_kind = 'location_variant' then
    if
      p_store_id is null
      or p_location_id is null
      or p_variant_id is null
      or subject_store_id is not null
      or subject_location_id is null
      or subject_variant_id is null
      or integration_id is not null
      or provider is not null
      or resource_type is not null
      or external_id is not null
      or p_location_id is distinct from subject_location_id::uuid
      or p_variant_id is distinct from subject_variant_id::uuid
    then
      raise exception
        'data quality issue canonical scope is invalid';
    end if;

    canonical_key :=
      '['
      || public.data_quality_json_string('dq-v1')
      || ','
      || public.data_quality_json_string(issue_code)
      || ','
      || public.data_quality_json_string('location_variant')
      || ','
      || public.data_quality_json_string(subject_location_id)
      || ','
      || public.data_quality_json_string(subject_variant_id)
      || ']';
  else
    if
      p_store_id is not null
      or p_location_id is not null
      or p_variant_id is not null
      or subject_store_id is not null
      or subject_location_id is not null
      or subject_variant_id is not null
      or integration_id is null
      or pg_catalog.length(integration_id) = 0
      or provider is null
      or provider not in (
        'csv',
        'shopify',
        'woocommerce',
        'square',
        'lightspeed',
        'other'
      )
      or resource_type is null
      or resource_type not in (
        'store',
        'location',
        'product',
        'product_variant',
        'order',
        'order_item',
        'return_refund',
        'supplier',
        'purchase_order',
        'purchase_order_item'
      )
      or external_id is null
      or pg_catalog.length(external_id) = 0
    then
      raise exception
        'data quality issue canonical scope is invalid';
    end if;

    canonical_key :=
      '['
      || public.data_quality_json_string('dq-v1')
      || ','
      || public.data_quality_json_string(issue_code)
      || ','
      || public.data_quality_json_string('provider')
      || ','
      || public.data_quality_json_string(integration_id)
      || ','
      || public.data_quality_json_string(provider)
      || ','
      || public.data_quality_json_string(resource_type)
      || ','
      || public.data_quality_json_string(external_id)
      || ']';
  end if;

  if p_issue_key is distinct from canonical_key then
    raise exception
      'data quality issue key does not match the canonical subject';
  end if;

  if
    p_source_context is null
    or pg_catalog.jsonb_typeof(p_source_context) <> 'object'
  then
    raise exception
      'data quality issue source context is invalid';
  end if;

  select pg_catalog.array_agg(context_key order by context_key)
  into context_keys
  from pg_catalog.jsonb_object_keys(p_source_context) as context_key;

  context_provenance := p_source_context ->> 'provenance';

  if context_provenance = 'provider_reconciliation' then
    if context_keys is distinct from array[
      'adapterVersion',
      'externalParentId',
      'issueCodes',
      'provenance',
      'reasonCode'
    ]::text[] then
      raise exception
        'data quality issue source context is invalid';
    end if;

    if
      pg_catalog.jsonb_typeof(p_source_context -> 'adapterVersion') <> 'string'
      or pg_catalog.length(
        pg_catalog.btrim(p_source_context ->> 'adapterVersion')
      ) = 0
      or (p_source_context ->> 'adapterVersion')
        is distinct from pg_catalog.btrim(p_source_context ->> 'adapterVersion')
      or pg_catalog.jsonb_typeof(p_source_context -> 'reasonCode') <> 'string'
      or (p_source_context ->> 'reasonCode') not in (
        'NORMALIZATION_QUARANTINED',
        'DUPLICATE_CONFLICT',
        'HISTORY_CONFLICT',
        'BINDING_CONFLICT',
        'IDENTITY_AMBIGUOUS',
        'RELATIONSHIP_UNRESOLVED',
        'PROVIDER_INCONSISTENCY'
      )
      or pg_catalog.jsonb_typeof(p_source_context -> 'issueCodes') <> 'array'
      or (
        pg_catalog.jsonb_typeof(p_source_context -> 'externalParentId')
          <> 'null'
        and (
          pg_catalog.jsonb_typeof(p_source_context -> 'externalParentId')
            <> 'string'
          or pg_catalog.length(
            pg_catalog.btrim(p_source_context ->> 'externalParentId')
          ) = 0
          or (p_source_context ->> 'externalParentId')
            is distinct from pg_catalog.btrim(
              p_source_context ->> 'externalParentId'
            )
        )
      )
    then
      raise exception
        'data quality issue source context is invalid';
    end if;

    if exists (
      select 1
      from pg_catalog.jsonb_array_elements(
        p_source_context -> 'issueCodes'
      ) as issue_code_element
      where
        pg_catalog.jsonb_typeof(issue_code_element) <> 'string'
        or (issue_code_element #>> '{}') not in (
          'EXTERNAL_ID_MISSING',
          'EXTERNAL_ID_INVALID',
          'REQUIRED_FIELD_MISSING',
          'INVALID_TIMESTAMP',
          'AMBIGUOUS_TIMESTAMP',
          'INVALID_QUANTITY',
          'INVALID_MONEY',
          'INVALID_CURRENCY',
          'UNSUPPORTED_CURRENCY',
          'UNSUPPORTED_STATUS',
          'AMBIGUOUS_INVENTORY_SEMANTICS',
          'RELATIONSHIP_UNRESOLVED',
          'UNSUPPORTED_RESOURCE'
        )
    ) then
      raise exception
        'data quality issue source context is invalid';
    end if;

    issue_source_context := pg_catalog.jsonb_build_object(
      'provenance',
      'provider_reconciliation',
      'adapterVersion',
      p_source_context ->> 'adapterVersion',
      'reasonCode',
      p_source_context ->> 'reasonCode',
      'issueCodes',
      p_source_context -> 'issueCodes',
      'externalParentId',
      p_source_context -> 'externalParentId'
    );
  elsif context_provenance = 'negative_inventory_observation' then
    if context_keys is distinct from array[
      'observedQuantity',
      'provenance',
      'quantityField'
    ]::text[] then
      raise exception
        'data quality issue source context is invalid';
    end if;

    if
      pg_catalog.jsonb_typeof(p_source_context -> 'quantityField') <> 'string'
      or (p_source_context ->> 'quantityField') not in (
        'on_hand',
        'available',
        'committed',
        'incoming'
      )
      or pg_catalog.jsonb_typeof(p_source_context -> 'observedQuantity')
        <> 'number'
      or (p_source_context ->> 'observedQuantity') !~ '^-?[0-9]+$'
      or (p_source_context ->> 'observedQuantity')::numeric >= 0
      or (p_source_context ->> 'observedQuantity')::numeric
        < -9007199254740991
    then
      raise exception
        'data quality issue source context is invalid';
    end if;

    issue_source_context := pg_catalog.jsonb_build_object(
      'provenance',
      'negative_inventory_observation',
      'quantityField',
      p_source_context ->> 'quantityField',
      'observedQuantity',
      (p_source_context ->> 'observedQuantity')::numeric
    );
  else
    raise exception
      'data quality issue source context is invalid';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_organization_id::text || ':' || canonical_key,
      0
    )
  );

  select issue.*
  into existing
  from public.data_quality_issues issue
  where
    issue.organization_id = p_organization_id
    and issue.issue_key = canonical_key
    and issue.status = 'open'
  for update;

  if found then
    if public.data_quality_severity_rank(p_severity)
      > public.data_quality_severity_rank(existing.severity)
    then
      next_severity := p_severity;
    else
      next_severity := existing.severity;
    end if;

    if p_detected_at > existing.last_detected_at then
      next_last_detected_at := p_detected_at;
    else
      next_last_detected_at := existing.last_detected_at;
    end if;

    update public.data_quality_issues issue
    set
      severity = next_severity,
      message = issue_message,
      remediation_hint = issue_remediation_hint,
      source_context = issue_source_context,
      last_detected_at = next_last_detected_at,
      occurrence_count = existing.occurrence_count + 1
    where issue.id = existing.id
    returning issue.*
    into existing;

    return query
    select
      'reconciled'::text,
      existing.id,
      existing.issue_key,
      existing.occurrence_count,
      existing.severity,
      existing.detected_at,
      existing.last_detected_at;

    return;
  end if;

  if exists (
    select 1
    from public.data_quality_issues issue
    where
      issue.organization_id = p_organization_id
      and issue.issue_key = canonical_key
      and issue.status = 'ignored'
  ) then
    raise exception
      using
        errcode = 'SA003',
        message =
          'data quality issue ignored history blocks a new open issue';
  end if;

  if exists (
    select 1
    from public.data_quality_issues issue
    where
      issue.organization_id = p_organization_id
      and issue.issue_key = canonical_key
      and issue.status = 'superseded'
  ) then
    raise exception
      using
        errcode = 'SA004',
        message =
          'data quality issue superseded history blocks a new open issue';
  end if;

  insert into public.data_quality_issues (
    organization_id,
    store_id,
    location_id,
    variant_id,
    issue_code,
    issue_key,
    severity,
    status,
    message,
    remediation_hint,
    source_context,
    detected_at,
    last_detected_at,
    occurrence_count,
    resolved_at
  )
  values (
    p_organization_id,
    p_store_id,
    p_location_id,
    p_variant_id,
    issue_code,
    canonical_key,
    p_severity,
    'open',
    issue_message,
    issue_remediation_hint,
    issue_source_context,
    p_detected_at,
    p_detected_at,
    1,
    null
  )
  returning *
  into created;

  return query
  select
    'created'::text,
    created.id,
    created.issue_key,
    created.occurrence_count,
    created.severity,
    created.detected_at,
    created.last_detected_at;
end;
$$;

revoke all
on function public.persist_data_quality_issue(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  timestamptz,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
)
from public, anon, authenticated;

grant execute
on function public.persist_data_quality_issue(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  timestamptz,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
)
to service_role;
