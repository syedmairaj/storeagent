import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import { buildDataQualityIssueKey } from "@/lib/data-quality/identity";

const execFileAsync = promisify(execFile);
const LIVE = process.env.RUN_SUPABASE_LIVE === "1";
const describeLive = LIVE ? describe : describe.skip;

const ORG_A = "a4710000-0000-4000-8000-000000000001";
const ORG_B = "b4710000-0000-4000-8000-000000000001";
const STORE_A = "a4710000-0000-4000-8000-000000000002";
const STORE_B = "b4710000-0000-4000-8000-000000000012";
const LOCATION_A = "a4710000-0000-4000-8000-000000000003";
const LOCATION_B = "b4710000-0000-4000-8000-000000000013";
const PRODUCT_A = "a4710000-0000-4000-8000-000000000004";
const PRODUCT_B = "b4710000-0000-4000-8000-000000000014";
const VARIANT_A = "a4710000-0000-4000-8000-000000000005";
const VARIANT_B = "b4710000-0000-4000-8000-000000000015";
const USER_A = "a4710000-0000-4000-8000-0000000000a1";
const USER_B = "b4710000-0000-4000-8000-0000000000b1";
const USER_OUTSIDER = "c4710000-0000-4000-8000-0000000000c1";

const NEGATIVE_CONTEXT =
  '{"provenance":"negative_inventory_observation","quantityField":"on_hand","observedQuantity":-3}';

const PERSIST_SIGNATURE =
  "public.persist_data_quality_issue(uuid,uuid,uuid,uuid,text,text,text,text,text,jsonb,timestamptz,text,text,text,text,text,text,text,text)";
const TRANSITION_SIGNATURE =
  "public.transition_data_quality_issue(uuid,uuid,text,timestamptz)";

type SubjectKind =
  | "organization"
  | "store"
  | "location"
  | "variant"
  | "location_variant"
  | "provider";

type PersistInput = {
  organizationId?: string;
  storeId?: string | null;
  locationId?: string | null;
  variantId?: string | null;
  issueCode: string;
  issueKey: string;
  severity?: string;
  message?: string;
  remediationHint?: string | null;
  sourceContext?: string;
  detectedAt?: string;
  subjectKind: SubjectKind;
  subjectStoreId?: string | null;
  subjectLocationId?: string | null;
  subjectVariantId?: string | null;
  integrationId?: string | null;
  provider?: string | null;
  resourceType?: string | null;
  externalId?: string | null;
};

type PersistRow = {
  disposition: string;
  issueId: string;
  occurrenceCount: number;
  severity: string;
  detectedAt: string;
  lastDetectedAt: string;
};

let seedIssueA = "";
let seedIssueB = "";

async function psql(sql: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "psql",
    [
      "-h",
      "127.0.0.1",
      "-p",
      "55322",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-t",
      "-A",
      "-c",
      sql,
    ],
    {
      env: {
        ...process.env,
        PGPASSWORD: "postgres",
      },
    },
  );

  return stdout.trim();
}

function taggedLine(stdout: string, tag: string): string {
  const line = stdout
    .split("\n")
    .map((row) => row.trim())
    .find((row) => row.startsWith(`${tag}|`));

  if (line === undefined) {
    throw new Error(`missing ${tag} result`);
  }

  return line;
}

function sqlText(value: string | null | undefined): string {
  if (value === undefined || value === null) {
    return "null";
  }

  return `$dq$${value}$dq$`;
}

function sqlUuid(value: string | null | undefined): string {
  if (value === undefined || value === null) {
    return "null";
  }

  return `'${value}'::uuid`;
}

function variantKey(
  issueCode: string,
  variantId = VARIANT_A,
): string {
  return buildDataQualityIssueKey({
    issueCode,
    subject: {
      kind: "variant",
      variantId,
    },
  });
}

function organizationKey(issueCode: string): string {
  return buildDataQualityIssueKey({
    issueCode,
    subject: {
      kind: "organization",
    },
  });
}

function providerKey(input: {
  issueCode: string;
  integrationId: string;
  externalId: string;
  provider?: "shopify";
  resourceType?: "product_variant";
}): string {
  return buildDataQualityIssueKey({
    issueCode: input.issueCode,
    subject: {
      kind: "provider",
      integrationId: input.integrationId,
      provider: input.provider ?? "shopify",
      resourceType: input.resourceType ?? "product_variant",
      externalId: input.externalId,
    },
  });
}

function providerContext(
  externalParentId: string | null,
  issueCode = "RELATIONSHIP_UNRESOLVED",
  reasonCode = "BINDING_CONFLICT",
): string {
  return JSON.stringify({
    adapterVersion: "csv-v1",
    externalParentId,
    issueCodes: [issueCode],
    provenance: "provider_reconciliation",
    reasonCode,
  });
}

function persistSql(input: PersistInput): string {
  const remediation =
    input.remediationHint === undefined
      ? sqlText(
          "Correct the observed inventory quantity before using it for recommendations.",
        )
      : sqlText(input.remediationHint);

  return `
    select
      disposition || '|' ||
      issue_id::text || '|' ||
      occurrence_count::text || '|' ||
      severity || '|' ||
      detected_at::text || '|' ||
      last_detected_at::text
    from public.persist_data_quality_issue(
      ${sqlUuid(input.organizationId ?? ORG_A)},
      ${sqlUuid(input.storeId)},
      ${sqlUuid(input.locationId)},
      ${sqlUuid(input.variantId)},
      ${sqlText(input.issueCode)},
      $issue_key$${input.issueKey}$issue_key$,
      ${sqlText(input.severity ?? "high")},
      ${sqlText(input.message ?? "Observed inventory quantity is negative.")},
      ${remediation},
      $ctx$${input.sourceContext ?? NEGATIVE_CONTEXT}$ctx$::jsonb,
      ${sqlText(input.detectedAt ?? "2026-10-13T08:00:00Z")}::timestamptz,
      ${sqlText(input.subjectKind)},
      ${sqlText(input.subjectStoreId)},
      ${sqlText(input.subjectLocationId)},
      ${sqlText(input.subjectVariantId)},
      ${sqlText(input.integrationId)},
      ${sqlText(input.provider)},
      ${sqlText(input.resourceType)},
      ${sqlText(input.externalId)}
    );
  `;
}

function parsePersist(value: string): PersistRow {
  const [
    disposition,
    issueId,
    occurrenceCount,
    severity,
    detectedAt,
    lastDetectedAt,
  ] = value.split("|");

  return {
    disposition: disposition ?? "",
    issueId: issueId ?? "",
    occurrenceCount: Number(occurrenceCount),
    severity: severity ?? "",
    detectedAt: detectedAt ?? "",
    lastDetectedAt: lastDetectedAt ?? "",
  };
}

async function persist(input: PersistInput): Promise<PersistRow> {
  return parsePersist(await psql(persistSql(input)));
}

function variantPersist(
  issueCode: string,
  overrides: Partial<PersistInput> = {},
): PersistInput {
  const variantId = overrides.variantId ?? VARIANT_A;

  return {
    organizationId: ORG_A,
    storeId: STORE_A,
    locationId: null,
    variantId,
    issueCode,
    issueKey:
      overrides.issueKey ??
      variantKey(issueCode, variantId ?? VARIANT_A),
    subjectKind: "variant",
    subjectVariantId: variantId,
    ...overrides,
  };
}

function transitionSql(
  issueId: string,
  transition: "resolve" | "ignore" | "supersede",
  occurredAt: string,
  organizationId = ORG_A,
): string {
  return `
    select
      issue_id::text || '|' ||
      previous_status || '|' ||
      status || '|' ||
      coalesce(resolved_at::text, 'null')
    from public.transition_data_quality_issue(
      '${organizationId}'::uuid,
      '${issueId}'::uuid,
      '${transition}',
      '${occurredAt}'::timestamptz
    );
  `;
}

async function issueCount(
  organizationId: string,
  issueCode: string,
): Promise<number> {
  return Number(
    await psql(`
      select count(*)
      from public.data_quality_issues
      where organization_id = '${organizationId}'
        and issue_code = '${issueCode}';
    `),
  );
}

async function identity(issueId: string): Promise<string> {
  return psql(`
    select
      organization_id::text || '|' ||
      coalesce(store_id::text, 'null') || '|' ||
      coalesce(location_id::text, 'null') || '|' ||
      coalesce(variant_id::text, 'null') || '|' ||
      issue_code || '|' ||
      issue_key || '|' ||
      detected_at::text
    from public.data_quality_issues
    where id = '${issueId}';
  `);
}

async function rejectWithoutRow(
  issueCode: string,
  input: PersistInput,
  pattern: RegExp,
): Promise<void> {
  const before = await issueCount(
    input.organizationId ?? ORG_A,
    issueCode,
  );

  await expect(psql(persistSql(input))).rejects.toThrow(pattern);
  expect(
    await issueCount(input.organizationId ?? ORG_A, issueCode),
  ).toBe(before);
}

describeLive("M4.7 data quality adversarial verification", () => {
  beforeAll(async () => {
    await psql(`
      delete from public.data_quality_issues
      where organization_id in ('${ORG_A}', '${ORG_B}');
      delete from public.product_variants
      where organization_id in ('${ORG_A}', '${ORG_B}');
      delete from public.products
      where organization_id in ('${ORG_A}', '${ORG_B}');
      delete from public.locations
      where organization_id in ('${ORG_A}', '${ORG_B}');
      delete from public.stores
      where organization_id in ('${ORG_A}', '${ORG_B}');
      delete from public.organization_members
      where organization_id in ('${ORG_A}', '${ORG_B}');
      delete from public.organizations
      where id in ('${ORG_A}', '${ORG_B}');
      delete from auth.users
      where id in ('${USER_A}', '${USER_B}', '${USER_OUTSIDER}');

      insert into auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at
      ) values
        (
          '${USER_A}',
          '00000000-0000-0000-0000-000000000000',
          'authenticated',
          'authenticated',
          'm47-a@example.test',
          '',
          pg_catalog.now(),
          pg_catalog.now(),
          pg_catalog.now()
        ),
        (
          '${USER_B}',
          '00000000-0000-0000-0000-000000000000',
          'authenticated',
          'authenticated',
          'm47-b@example.test',
          '',
          pg_catalog.now(),
          pg_catalog.now(),
          pg_catalog.now()
        ),
        (
          '${USER_OUTSIDER}',
          '00000000-0000-0000-0000-000000000000',
          'authenticated',
          'authenticated',
          'm47-outsider@example.test',
          '',
          pg_catalog.now(),
          pg_catalog.now(),
          pg_catalog.now()
        );

      insert into public.organizations (
        id, name, default_currency, timezone
      ) values
        ('${ORG_A}', 'M4.7 Org A', 'USD', 'UTC'),
        ('${ORG_B}', 'M4.7 Org B', 'USD', 'UTC');

      insert into public.organization_members (
        organization_id, user_id, role
      ) values
        ('${ORG_A}', '${USER_A}', 'owner'),
        ('${ORG_B}', '${USER_B}', 'owner');

      insert into public.stores (
        id, organization_id, name, status, currency, timezone
      ) values
        ('${STORE_A}', '${ORG_A}', 'Store A', 'active', 'USD', 'UTC'),
        ('${STORE_B}', '${ORG_B}', 'Store B', 'active', 'USD', 'UTC');

      insert into public.locations (
        id, organization_id, store_id, name, status
      ) values
        ('${LOCATION_A}', '${ORG_A}', '${STORE_A}', 'Location A', 'active'),
        ('${LOCATION_B}', '${ORG_B}', '${STORE_B}', 'Location B', 'active');

      insert into public.products (
        id, organization_id, store_id, title, status
      ) values
        ('${PRODUCT_A}', '${ORG_A}', '${STORE_A}', 'Product A', 'active'),
        ('${PRODUCT_B}', '${ORG_B}', '${STORE_B}', 'Product B', 'active');

      insert into public.product_variants (
        id, organization_id, store_id, product_id, sku, status
      ) values
        (
          '${VARIANT_A}', '${ORG_A}', '${STORE_A}', '${PRODUCT_A}',
          'SKU-A', 'active'
        ),
        (
          '${VARIANT_B}', '${ORG_B}', '${STORE_B}', '${PRODUCT_B}',
          'SKU-B', 'active'
        );
    `);

    seedIssueA = (
      await persist(
        variantPersist("RLS_SEED_A", {
          organizationId: ORG_A,
          storeId: STORE_A,
          variantId: VARIANT_A,
          subjectVariantId: VARIANT_A,
        }),
      )
    ).issueId;
    seedIssueB = (
      await persist(
        variantPersist("RLS_SEED_B", {
          organizationId: ORG_B,
          storeId: STORE_B,
          variantId: VARIANT_B,
          subjectVariantId: VARIANT_B,
          issueKey: variantKey("RLS_SEED_B", VARIANT_B),
        }),
      )
    ).issueId;
  });

  afterAll(async () => {
    await psql(`
      delete from public.data_quality_issues
      where organization_id in ('${ORG_A}', '${ORG_B}');
      delete from public.product_variants
      where organization_id in ('${ORG_A}', '${ORG_B}');
      delete from public.products
      where organization_id in ('${ORG_A}', '${ORG_B}');
      delete from public.locations
      where organization_id in ('${ORG_A}', '${ORG_B}');
      delete from public.stores
      where organization_id in ('${ORG_A}', '${ORG_B}');
      delete from public.organization_members
      where organization_id in ('${ORG_A}', '${ORG_B}');
      delete from public.organizations
      where id in ('${ORG_A}', '${ORG_B}');
      delete from auth.users
      where id in ('${USER_A}', '${USER_B}', '${USER_OUTSIDER}');
    `);
  });

  it("isolates issue reads by membership", async () => {
    const member = await psql(`
      begin;
      set local role authenticated;
      select set_config('request.jwt.claim.sub', '${USER_A}', true);
      select set_config('request.jwt.claim.role', 'authenticated', true);
      select 'MEMBER|' ||
        (select count(*) from public.data_quality_issues
          where organization_id = '${ORG_A}')::text || '|' ||
        (select count(*) from public.data_quality_issues
          where organization_id = '${ORG_B}')::text || '|' ||
        (select count(*) from public.data_quality_issues
          where id = '${seedIssueB}')::text;
      rollback;
    `);
    const memberLine = taggedLine(member, "MEMBER").split("|");

    expect(Number(memberLine[1])).toBeGreaterThan(0);
    expect(memberLine[2]).toBe("0");
    expect(memberLine[3]).toBe("0");

    const outsider = await psql(`
      begin;
      set local role authenticated;
      select set_config('request.jwt.claim.sub', '${USER_OUTSIDER}', true);
      select set_config('request.jwt.claim.role', 'authenticated', true);
      select 'NONE|' || count(*)::text
      from public.data_quality_issues;
      rollback;
    `);

    expect(taggedLine(outsider, "NONE")).toBe("NONE|0");

    let anonError = "";
    let anonStdout = "";

    try {
      anonStdout = await psql(`
        begin;
        set local role anon;
        select 'ANON|' || count(*)::text
        from public.data_quality_issues;
        rollback;
      `);
    } catch (error) {
      anonError = String(error);
    }

    if (anonError.length > 0) {
      expect(anonError).toMatch(/permission denied/i);
    } else {
      expect(taggedLine(anonStdout, "ANON")).toBe("ANON|0");
    }
  });

  it("keeps persistence and lifecycle RPCs on the service-role boundary", async () => {
    expect(
      await psql(
        `select has_function_privilege('anon', '${PERSIST_SIGNATURE}', 'execute')::text;`,
      ),
    ).toBe("false");
    expect(
      await psql(
        `select has_function_privilege('authenticated', '${PERSIST_SIGNATURE}', 'execute')::text;`,
      ),
    ).toBe("false");
    expect(
      await psql(
        `select has_function_privilege('service_role', '${PERSIST_SIGNATURE}', 'execute')::text;`,
      ),
    ).toBe("true");
    expect(
      await psql(
        `select has_function_privilege('anon', '${TRANSITION_SIGNATURE}', 'execute')::text;`,
      ),
    ).toBe("false");
    expect(
      await psql(
        `select has_function_privilege('authenticated', '${TRANSITION_SIGNATURE}', 'execute')::text;`,
      ),
    ).toBe("false");
    expect(
      await psql(
        `select has_function_privilege('service_role', '${TRANSITION_SIGNATURE}', 'execute')::text;`,
      ),
    ).toBe("true");

    const deniedPersist = variantPersist("ROLE_DENY");

    await expect(
      psql(`
        begin;
        set local role anon;
        ${persistSql(deniedPersist)}
        rollback;
      `),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      psql(`
        begin;
        set local role authenticated;
        ${persistSql(deniedPersist)}
        rollback;
      `),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      psql(`
        begin;
        set local role anon;
        ${transitionSql(seedIssueA, "resolve", "2026-10-13T08:00:00Z")}
        rollback;
      `),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      psql(`
        begin;
        set local role authenticated;
        ${transitionSql(seedIssueA, "ignore", "2026-10-13T08:00:00Z")}
        rollback;
      `),
    ).rejects.toThrow(/permission denied/i);

    const service = await psql(`
      begin;
      set local role service_role;
      select 'SR|' || disposition
      from public.persist_data_quality_issue(
        '${ORG_A}'::uuid,
        '${STORE_A}'::uuid,
        null,
        '${VARIANT_A}'::uuid,
        'SERVICE_ROLE_EXEC',
        $issue_key$${variantKey("SERVICE_ROLE_EXEC")}$issue_key$,
        'high',
        'Observed inventory quantity is negative.',
        'Correct the observed inventory quantity before using it for recommendations.',
        '${NEGATIVE_CONTEXT}'::jsonb,
        '2026-10-13T08:00:00Z'::timestamptz,
        'variant',
        null,
        null,
        '${VARIANT_A}',
        null,
        null,
        null,
        null
      );
      rollback;
    `);

    expect(taggedLine(service, "SR")).toBe("SR|created");
    expect(await issueCount(ORG_A, "SERVICE_ROLE_EXEC")).toBe(0);
    expect(await issueCount(ORG_A, "ROLE_DENY")).toBe(0);
  });

  it("rejects cross-tenant store, location, variant, and subject ids", async () => {
    const attacks: PersistInput[] = [
      variantPersist("XTENANT_STORE", {
        storeId: STORE_B,
        variantId: null,
        subjectKind: "store",
        subjectStoreId: STORE_B,
        subjectVariantId: null,
        issueKey: buildDataQualityIssueKey({
          issueCode: "XTENANT_STORE",
          subject: { kind: "store", storeId: STORE_B },
        }),
      }),
      variantPersist("XTENANT_LOCATION", {
        storeId: STORE_A,
        locationId: LOCATION_B,
        variantId: null,
        subjectKind: "location",
        subjectLocationId: LOCATION_B,
        subjectVariantId: null,
        issueKey: buildDataQualityIssueKey({
          issueCode: "XTENANT_LOCATION",
          subject: { kind: "location", locationId: LOCATION_B },
        }),
      }),
      variantPersist("XTENANT_VARIANT", {
        variantId: VARIANT_B,
        subjectVariantId: VARIANT_B,
        issueKey: variantKey("XTENANT_VARIANT", VARIANT_B),
      }),
      variantPersist("XTENANT_SUBJECT_STORE", {
        storeId: STORE_A,
        variantId: null,
        subjectKind: "store",
        subjectStoreId: STORE_B,
        subjectVariantId: null,
        issueKey: buildDataQualityIssueKey({
          issueCode: "XTENANT_SUBJECT_STORE",
          subject: { kind: "store", storeId: STORE_A },
        }),
      }),
      variantPersist("XTENANT_SUBJECT_LOCATION", {
        locationId: LOCATION_A,
        variantId: null,
        subjectKind: "location",
        subjectLocationId: LOCATION_B,
        subjectVariantId: null,
        issueKey: buildDataQualityIssueKey({
          issueCode: "XTENANT_SUBJECT_LOCATION",
          subject: { kind: "location", locationId: LOCATION_A },
        }),
      }),
      variantPersist("XTENANT_SUBJECT_VARIANT", {
        subjectVariantId: VARIANT_B,
        issueKey: variantKey("XTENANT_SUBJECT_VARIANT", VARIANT_A),
      }),
    ];

    for (const attack of attacks) {
      await rejectWithoutRow(
        attack.issueCode,
        attack,
        /canonical (ownership|scope) is invalid|key does not match/,
      );
    }
  });

  it("rejects forged issue keys", async () => {
    await rejectWithoutRow(
      "FORGED_CODE",
      variantPersist("FORGED_CODE", {
        issueKey: variantKey("OTHER_CODE"),
      }),
      /key does not match/,
    );
    await rejectWithoutRow(
      "FORGED_SUBJECT",
      variantPersist("FORGED_SUBJECT", {
        issueKey: variantKey("FORGED_SUBJECT", VARIANT_B),
      }),
      /key does not match/,
    );
    await rejectWithoutRow(
      "FORGED_INTEGRATION",
      {
        issueCode: "FORGED_INTEGRATION",
        issueKey: providerKey({
          issueCode: "FORGED_INTEGRATION",
          integrationId: "integration-a",
          externalId: "ext-1",
        }),
        subjectKind: "provider",
        integrationId: "integration-b",
        provider: "shopify",
        resourceType: "product_variant",
        externalId: "ext-1",
        sourceContext: providerContext(null),
      },
      /key does not match/,
    );
    await rejectWithoutRow(
      "FORGED_EXTERNAL",
      {
        issueCode: "FORGED_EXTERNAL",
        issueKey: providerKey({
          issueCode: "FORGED_EXTERNAL",
          integrationId: "integration-a",
          externalId: "ext-1",
        }),
        subjectKind: "provider",
        integrationId: "integration-a",
        provider: "shopify",
        resourceType: "product_variant",
        externalId: "ext-2",
        sourceContext: providerContext(null),
      },
      /key does not match/,
    );
  });

  it("rejects provider subject abuse without letting parent ids change identity", async () => {
    const validKey = providerKey({
      issueCode: "PROVIDER_ABUSE",
      integrationId: "integration-a",
      externalId: "ext-1",
    });
    const attacks: PersistInput[] = [
      {
        issueCode: "PROVIDER_BLANK_INTEGRATION",
        issueKey: validKey,
        subjectKind: "provider",
        integrationId: "   ",
        provider: "shopify",
        resourceType: "product_variant",
        externalId: "ext-1",
        sourceContext: providerContext(null),
      },
      {
        issueCode: "PROVIDER_BLANK_EXTERNAL",
        issueKey: validKey,
        subjectKind: "provider",
        integrationId: "integration-a",
        provider: "shopify",
        resourceType: "product_variant",
        externalId: "   ",
        sourceContext: providerContext(null),
      },
      {
        issueCode: "PROVIDER_BAD_PROVIDER",
        issueKey: validKey,
        subjectKind: "provider",
        integrationId: "integration-a",
        provider: "Shopify",
        resourceType: "product_variant",
        externalId: "ext-1",
        sourceContext: providerContext(null),
      },
      {
        issueCode: "PROVIDER_BAD_RESOURCE",
        issueKey: validKey,
        subjectKind: "provider",
        integrationId: "integration-a",
        provider: "shopify",
        resourceType: "sku",
        externalId: "ext-1",
        sourceContext: providerContext(null),
      },
      {
        issueCode: "PROVIDER_CANONICAL_IDS",
        issueKey: providerKey({
          issueCode: "PROVIDER_CANONICAL_IDS",
          integrationId: "integration-a",
          externalId: "ext-1",
        }),
        storeId: STORE_A,
        locationId: LOCATION_A,
        variantId: VARIANT_A,
        subjectKind: "provider",
        integrationId: "integration-a",
        provider: "shopify",
        resourceType: "product_variant",
        externalId: "ext-1",
        sourceContext: providerContext("parent-should-not-matter"),
      },
    ];

    for (const attack of attacks) {
      await rejectWithoutRow(
        attack.issueCode,
        attack,
        /canonical scope is invalid/,
      );
    }

    const issueCode = "PARENT_NOT_IDENTITY";
    const key = providerKey({
      issueCode,
      integrationId: "integration-a",
      externalId: "ext-1",
    });
    const first = await persist({
      issueCode,
      issueKey: key,
      subjectKind: "provider",
      integrationId: "integration-a",
      provider: "shopify",
      resourceType: "product_variant",
      externalId: "ext-1",
      sourceContext: providerContext("parent-aaa"),
    });
    const second = await persist({
      issueCode,
      issueKey: key,
      subjectKind: "provider",
      integrationId: "  integration-a  ",
      provider: "shopify",
      resourceType: "product_variant",
      externalId: "  ext-1  ",
      sourceContext: providerContext("parent-bbb"),
      message: "Parent evidence changed.",
    });

    expect(key.includes("parent-aaa")).toBe(false);
    expect(key.includes("parent-bbb")).toBe(false);
    expect(second.issueId).toBe(first.issueId);
    expect(second.occurrenceCount).toBe(2);
    expect(
      await psql(`
        select issue_key = $issue_key$${key}$issue_key$
        from public.data_quality_issues
        where id = '${first.issueId}';
      `),
    ).toBe("t");
  });

  it("rejects abusive source context and persists none of it", async () => {
    const base = {
      provenance: "negative_inventory_observation",
      quantityField: "on_hand",
      observedQuantity: -3,
    };
    const attacks: Array<{ code: string; context: string }> = [
      {
        code: "CTX_EXTRA",
        context: JSON.stringify({ ...base, note: "extra" }),
      },
      {
        code: "CTX_PAYLOAD",
        context: JSON.stringify({ ...base, payload: "secret-body" }),
      },
      {
        code: "CTX_TOKEN",
        context: JSON.stringify({ ...base, token: "secret-token" }),
      },
      {
        code: "CTX_HEADER",
        context: JSON.stringify({ ...base, header: "secret-header" }),
      },
      {
        code: "CTX_CREDENTIAL",
        context: JSON.stringify({
          ...base,
          credential: "secret-credential",
        }),
      },
      {
        code: "CTX_PROVENANCE",
        context: JSON.stringify({
          ...base,
          provenance: "operator_note",
        }),
      },
      {
        code: "CTX_REASON",
        context: providerContext(null, "RELATIONSHIP_UNRESOLVED", "MADE_UP"),
      },
      {
        code: "CTX_ISSUE_CODE",
        context: providerContext(null, "MADE_UP"),
      },
      {
        code: "CTX_REASON_TYPE",
        context: JSON.stringify({
          adapterVersion: "csv-v1",
          externalParentId: null,
          issueCodes: ["RELATIONSHIP_UNRESOLVED"],
          provenance: "provider_reconciliation",
          reasonCode: 12,
        }),
      },
      {
        code: "CTX_NONEG",
        context: JSON.stringify({ ...base, observedQuantity: 0 }),
      },
      {
        code: "CTX_POSITIVE",
        context: JSON.stringify({ ...base, observedQuantity: 4 }),
      },
      {
        code: "CTX_FRACTION",
        context: JSON.stringify({ ...base, observedQuantity: -1.5 }),
      },
    ];

    for (const attack of attacks) {
      await rejectWithoutRow(
        attack.code,
        variantPersist(attack.code, {
          sourceContext: attack.context,
        }),
        /source context is invalid/,
      );
    }
  });

  it("keeps identity stable across whitespace, case, and tenants", async () => {
    const padded = "  CASE_CODE  ";
    const normalized = buildDataQualityIssueKey({
      issueCode: "CASE_CODE",
      subject: {
        kind: "variant",
        variantId: VARIANT_A,
      },
    });
    const again = buildDataQualityIssueKey({
      issueCode: "CASE_CODE",
      subject: {
        kind: "variant",
        variantId: VARIANT_A,
      },
    });
    const differentCase = buildDataQualityIssueKey({
      issueCode: "case_code",
      subject: {
        kind: "variant",
        variantId: VARIANT_A,
      },
    });
    const differentVariant = variantKey("CASE_CODE", VARIANT_B);

    expect(again).toBe(normalized);
    expect(differentCase).not.toBe(normalized);
    expect(differentVariant).not.toBe(normalized);
    expect(
      providerKey({
        issueCode: "CASE_CODE",
        integrationId: "  integration-a  ",
        externalId: "  Ext-1  ",
      }),
    ).toBe(
      providerKey({
        issueCode: "CASE_CODE",
        integrationId: "integration-a",
        externalId: "Ext-1",
      }),
    );
    expect(
      providerKey({
        issueCode: "CASE_CODE",
        integrationId: "integration-a",
        externalId: "Ext-1",
      }),
    ).not.toBe(
      providerKey({
        issueCode: "CASE_CODE",
        integrationId: "integration-a",
        externalId: "ext-1",
      }),
    );

    const stored = await persist(
      variantPersist(padded, {
        issueKey: normalized,
      }),
    );

    expect(
      await psql(`
        select issue_code || '|' || (issue_key = $issue_key$${normalized}$issue_key$)::text
        from public.data_quality_issues
        where id = '${stored.issueId}';
      `),
    ).toBe("CASE_CODE|true");

    const lower = await persist(
      variantPersist("case_code", {
        issueKey: differentCase,
      }),
    );

    expect(lower.issueId).not.toBe(stored.issueId);

    const shared = organizationKey("SHARED_ORG_KEY");
    const orgA = await persist({
      organizationId: ORG_A,
      issueCode: "SHARED_ORG_KEY",
      issueKey: shared,
      subjectKind: "organization",
    });
    const orgB = await persist({
      organizationId: ORG_B,
      issueCode: "SHARED_ORG_KEY",
      issueKey: shared,
      subjectKind: "organization",
    });

    expect(orgA.issueId).not.toBe(orgB.issueId);
    expect(
      await psql(`
        select count(*)
        from public.data_quality_issues
        where issue_key = $issue_key$${shared}$issue_key$
          and status = 'open';
      `),
    ).toBe("2");
  });

  it("reconciles an open issue without rewriting identity or moving history backward", async () => {
    const issueCode = "RECONCILE_HISTORY";
    const created = await persist(
      variantPersist(issueCode, {
        severity: "medium",
        message: "First observation.",
        remediationHint: "First hint.",
        detectedAt: "2026-10-10T00:00:00Z",
        sourceContext:
          '{"provenance":"negative_inventory_observation","quantityField":"on_hand","observedQuantity":-3}',
      }),
    );
    const before = await identity(created.issueId);
    const replay = await persist(
      variantPersist(issueCode, {
        severity: "low",
        message: "Later message.",
        remediationHint: "Later hint.",
        detectedAt: "2026-10-09T00:00:00Z",
        sourceContext:
          '{"provenance":"negative_inventory_observation","quantityField":"available","observedQuantity":-4}',
      }),
    );

    expect(replay.issueId).toBe(created.issueId);
    expect(replay.disposition).toBe("reconciled");
    expect(replay.occurrenceCount).toBe(2);
    expect(replay.severity).toBe("medium");
    expect(await identity(created.issueId)).toBe(before);
    expect(
      await psql(`
        select (
          detected_at = '2026-10-10T00:00:00Z'::timestamptz
          and last_detected_at = '2026-10-10T00:00:00Z'::timestamptz
          and message = 'Later message.'
          and remediation_hint = 'Later hint.'
          and source_context = '{"observedQuantity":-4,"provenance":"negative_inventory_observation","quantityField":"available"}'::jsonb
        )::text
        from public.data_quality_issues
        where id = '${created.issueId}';
      `),
    ).toBe("true");

    const upgraded = await persist(
      variantPersist(issueCode, {
        severity: "critical",
        message: "Upgraded observation.",
        remediationHint: "Upgraded hint.",
        detectedAt: "2026-10-11T00:00:00Z",
        sourceContext:
          '{"provenance":"negative_inventory_observation","quantityField":"on_hand","observedQuantity":-8}',
      }),
    );

    expect(upgraded.issueId).toBe(created.issueId);
    expect(upgraded.occurrenceCount).toBe(3);
    expect(upgraded.severity).toBe("critical");
    expect(await identity(created.issueId)).toBe(before);
    expect(
      await psql(`
        select (
          last_detected_at = '2026-10-11T00:00:00Z'::timestamptz
          and severity = 'critical'
        )::text
        from public.data_quality_issues
        where id = '${created.issueId}';
      `),
    ).toBe("true");
  });

  it("enforces lifecycle chronology and terminal history", async () => {
    const chronology = await persist(
      variantPersist("LIFE_CHRONOLOGY", {
        detectedAt: "2026-10-13T10:00:00Z",
      }),
    );
    const beforeEarly = await identity(chronology.issueId);

    await expect(
      psql(
        transitionSql(
          chronology.issueId,
          "resolve",
          "2026-10-12T10:00:00Z",
        ),
      ),
    ).rejects.toThrow(/SA007|lifecycle timestamp precedes/);
    expect(await identity(chronology.issueId)).toBe(beforeEarly);
    expect(
      await psql(`
        select status || '|' || (resolved_at is null)::text
        from public.data_quality_issues
        where id = '${chronology.issueId}';
      `),
    ).toBe("open|true");

    await psql(
      transitionSql(
        chronology.issueId,
        "resolve",
        "2026-10-13T10:00:00Z",
      ),
    );
    expect(
      await psql(`
        select (resolved_at = detected_at)::text
        from public.data_quality_issues
        where id = '${chronology.issueId}';
      `),
    ).toBe("true");
    await expect(
      psql(
        transitionSql(
          chronology.issueId,
          "ignore",
          "2026-10-14T00:00:00Z",
        ),
      ),
    ).rejects.toThrow(/SA005|lifecycle transition is illegal/);

    const wrongOrg = await persist(variantPersist("LIFE_WRONG_ORG"));
    const beforeWrongOrg = await identity(wrongOrg.issueId);

    await expect(
      psql(
        transitionSql(
          wrongOrg.issueId,
          "resolve",
          "2026-10-13T08:00:00Z",
          ORG_B,
        ),
      ),
    ).rejects.toThrow(/SA006|not in the trusted organization/);
    expect(await identity(wrongOrg.issueId)).toBe(beforeWrongOrg);

    const ignored = await persist(variantPersist("LIFE_IGNORED"));
    await psql(
      transitionSql(ignored.issueId, "ignore", "2026-10-13T08:00:00Z"),
    );
    await expect(
      psql(
        transitionSql(
          ignored.issueId,
          "resolve",
          "2026-10-14T00:00:00Z",
        ),
      ),
    ).rejects.toThrow(/SA005|lifecycle transition is illegal/);
    await expect(
      psql(persistSql(variantPersist("LIFE_IGNORED"))),
    ).rejects.toThrow(/SA003|ignored history/);
    expect(
      await psql(`
        select status || '|' || (resolved_at is null)::text
        from public.data_quality_issues
        where id = '${ignored.issueId}';
      `),
    ).toBe("ignored|true");

    const superseded = await persist(variantPersist("LIFE_SUPERSEDED"));
    await psql(
      transitionSql(
        superseded.issueId,
        "supersede",
        "2026-10-13T08:00:00Z",
      ),
    );
    await expect(
      psql(
        transitionSql(
          superseded.issueId,
          "resolve",
          "2026-10-14T00:00:00Z",
        ),
      ),
    ).rejects.toThrow(/SA005|lifecycle transition is illegal/);
    await expect(
      psql(persistSql(variantPersist("LIFE_SUPERSEDED"))),
    ).rejects.toThrow(/SA004|superseded history/);

    const resolved = await persist(
      variantPersist("LIFE_RECUR", {
        detectedAt: "2026-10-13T08:00:00Z",
      }),
    );
    const resolvedIdentity = await identity(resolved.issueId);

    await psql(
      transitionSql(
        resolved.issueId,
        "resolve",
        "2026-10-13T09:00:00Z",
      ),
    );
    const recurrence = await persist(
      variantPersist("LIFE_RECUR", {
        detectedAt: "2026-10-20T00:00:00Z",
        message: "Recurred after resolution.",
      }),
    );

    expect(recurrence.issueId).not.toBe(resolved.issueId);
    expect(recurrence.disposition).toBe("created");
    expect(recurrence.occurrenceCount).toBe(1);
    expect(await identity(resolved.issueId)).toBe(resolvedIdentity);
    expect(
      await psql(`
        select status
        from public.data_quality_issues
        where id = '${resolved.issueId}';
      `),
    ).toBe("resolved");
    expect(
      await psql(`
        select status
        from public.data_quality_issues
        where id = '${recurrence.issueId}';
      `),
    ).toBe("open");
  });

  it("serializes persistence, lifecycle, and cross-tenant races", async () => {
    const persistCode = "RACE_PERSIST";
    const persistCalls = await Promise.all(
      Array.from({ length: 20 }, () =>
        persist(
          variantPersist(persistCode, {
            detectedAt: "2026-10-13T08:00:00Z",
          }),
        ),
      ),
    );
    const persistIds = new Set(
      persistCalls.map((row) => row.issueId),
    );

    expect(persistIds.size).toBe(1);
    expect(
      persistCalls.filter((row) => row.disposition === "created"),
    ).toHaveLength(1);
    expect(
      persistCalls.filter((row) => row.disposition === "reconciled"),
    ).toHaveLength(19);
    expect(
      await psql(`
        select count(*)::text || '|' || max(occurrence_count)::text
        from public.data_quality_issues
        where organization_id = '${ORG_A}'
          and issue_code = '${persistCode}'
          and status = 'open';
      `),
    ).toBe("1|20");

    const raceCode = "RACE_MIXED";
    const raced = await persist(
      variantPersist(raceCode, {
        detectedAt: "2026-10-13T08:00:00Z",
      }),
    );
    const racedIdentity = await identity(raced.issueId);
    const mixed = await Promise.allSettled([
      psql(
        transitionSql(
          raced.issueId,
          "resolve",
          "2026-10-13T09:00:00Z",
        ),
      ),
      ...Array.from({ length: 12 }, (_unused, index) =>
        persist(
          variantPersist(raceCode, {
            detectedAt: `2026-10-14T00:00:${String(index).padStart(2, "0")}Z`,
            message: `Race observation ${index}.`,
          }),
        ),
      ),
    ]);

    expect(mixed.filter((call) => call.status === "rejected")).toHaveLength(
      0,
    );
    expect(await identity(raced.issueId)).toBe(racedIdentity);
    expect(
      await psql(`
        select
          count(*) filter (where status = 'open')::text || '|' ||
          count(*)::text || '|' ||
          coalesce(sum(occurrence_count), 0)::text || '|' ||
          coalesce(bool_and(
            id <> '${raced.issueId}' or status = 'resolved'
          ), true)::text
        from public.data_quality_issues
        where organization_id = '${ORG_A}'
          and issue_code = '${raceCode}';
      `),
    ).toMatch(/^(0|1)\|(1|2)\|13\|true$/);

    const lifeCode = "RACE_LIFECYCLE";
    const life = await persist(variantPersist(lifeCode));
    const lifeIdentity = await identity(life.issueId);
    const transitions = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        psql(
          transitionSql(
            life.issueId,
            "resolve",
            "2026-10-13T08:00:00Z",
          ),
        ),
      ),
    );

    expect(
      transitions.filter((call) => call.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      transitions.filter((call) => call.status === "rejected"),
    ).toHaveLength(9);
    for (const call of transitions) {
      if (call.status === "rejected") {
        expect(String(call.reason)).toMatch(
          /SA005|lifecycle transition is illegal/,
        );
      }
    }
    expect(await identity(life.issueId)).toBe(lifeIdentity);
    expect(
      await psql(`
        select status || '|' || occurrence_count::text || '|' ||
          (resolved_at = '2026-10-13T08:00:00Z'::timestamptz)::text
        from public.data_quality_issues
        where id = '${life.issueId}';
      `),
    ).toBe("resolved|1|true");

    const sharedCode = "RACE_SHARED_KEY";
    const sharedKey = organizationKey(sharedCode);
    await Promise.all([
      ...Array.from({ length: 8 }, () =>
        persist({
          organizationId: ORG_A,
          issueCode: sharedCode,
          issueKey: sharedKey,
          subjectKind: "organization",
        }),
      ),
      ...Array.from({ length: 8 }, () =>
        persist({
          organizationId: ORG_B,
          issueCode: sharedCode,
          issueKey: sharedKey,
          subjectKind: "organization",
        }),
      ),
    ]);

    expect(
      await psql(`
        select organization_id::text || '|' || count(*)::text || '|' ||
          max(occurrence_count)::text
        from public.data_quality_issues
        where issue_code = '${sharedCode}'
        group by organization_id
        order by organization_id;
      `),
    ).toBe(`${ORG_A}|1|8\n${ORG_B}|1|8`);
  });

  it("rejects direct reassignment of identity and history columns", async () => {
    const created = await persist(
      variantPersist("IMMUTABLE_IDENTITY", {
        detectedAt: "2026-10-13T08:00:00Z",
      }),
    );
    const before = await identity(created.issueId);
    const assignments = [
      `organization_id = '${ORG_B}'`,
      `store_id = '${STORE_B}'`,
      `location_id = '${LOCATION_B}'`,
      `variant_id = '${VARIANT_B}'`,
      `issue_code = 'REPLACED_CODE'`,
      `issue_key = 'forged-key'`,
      `detected_at = '2026-10-20T00:00:00Z'`,
    ];

    for (const assignment of assignments) {
      await expect(
        psql(`
          update public.data_quality_issues
          set ${assignment}
          where id = '${created.issueId}';
        `),
      ).rejects.toThrow(/cannot be reassigned/);
    }

    expect(await identity(created.issueId)).toBe(before);
  });
});
