/**
 * Deterministic M5.6E.4 canary fixture constants and SQL helpers.
 * Shared by local live tests and the hardened runbook.
 */

export const M56E4_CANARY_ORG =
  "e46e4000-0000-4000-8000-000000000001";
export const M56E4_CANARY_STORE =
  "e46e4000-0000-4000-8000-000000000002";
export const M56E4_CANARY_LOCATION =
  "e46e4000-0000-4000-8000-000000000003";
export const M56E4_CANARY_PRODUCT =
  "e46e4000-0000-4000-8000-000000000004";
export const M56E4_CANARY_VARIANT =
  "e46e4000-0000-4000-8000-000000000005";

/** Frozen rollover / snapshot clock for both enqueue calls. */
export const M56E4_CANARY_AS_OF =
  "2026-06-15T12:00:00+00";

/** Store-local metric date under UTC for M56E4_CANARY_AS_OF. */
export const M56E4_CANARY_METRIC_DATE =
  "2026-06-15";

export const M56E4_ALGORITHM =
  "m5-derived-metrics-v1";

/** Local wrapper: teardown (LOCAL ONLY) + hosted-safe create. */
export const M56E4_FIXTURE_SQL_PATH =
  "scripts/m5-6e4/canary-fixture.sql";

/** INSERT-only create — the only fixture SQL allowed on hosted. */
export const M56E4_HOSTED_CREATE_SQL_PATH =
  "scripts/m5-6e4/canary-fixture-hosted-create.sql";

/** LOCAL ONLY teardown (may disable table-wide snapshot delete trigger). */
export const M56E4_LOCAL_TEARDOWN_SQL_PATH =
  "scripts/m5-6e4/canary-fixture-local-teardown.sql";

export function quoteSql(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/** Fingerprint of non-canary durable metric-pipeline rows. */
export function foreignPipelineFingerprintSql(
  canaryOrgId: string,
): string {
  const org = `${quoteSql(canaryOrgId)}::uuid`;

  return `
    select pg_catalog.md5(
      pg_catalog.concat_ws(
        '|',
        (
          select coalesce(pg_catalog.string_agg(
            pg_catalog.concat_ws(
              ':',
              request.organization_id::text,
              request.store_id::text,
              request.location_id::text,
              request.variant_id::text,
              request.metric_date::text,
              request.status,
              request.dirty_generation::text,
              request.claimed_generation::text,
              request.applied_generation::text,
              coalesce(request.lease_claim_token, ''),
              coalesce(request.failed_reason, '')
            ),
            ',' order by
              request.organization_id,
              request.store_id,
              request.location_id,
              request.variant_id,
              request.metric_date
          ), '')
          from public.sku_daily_metric_recompute_requests as request
          where request.organization_id is distinct from ${org}
        ),
        (
          select coalesce(pg_catalog.string_agg(
            pg_catalog.concat_ws(
              ':',
              metric.organization_id::text,
              metric.store_id::text,
              metric.location_id::text,
              metric.variant_id::text,
              metric.metric_date::text,
              metric.algorithm_version,
              coalesce(metric.units_sold::text, ''),
              coalesce(metric.net_units_sold::text, '')
            ),
            ',' order by
              metric.organization_id,
              metric.store_id,
              metric.location_id,
              metric.variant_id,
              metric.metric_date
          ), '')
          from public.sku_daily_metrics as metric
          where metric.organization_id is distinct from ${org}
        ),
        (
          select coalesce(pg_catalog.string_agg(
            pg_catalog.concat_ws(
              ':',
              run.organization_id::text,
              run.store_id::text,
              run.metric_date::text,
              run.status,
              run.enqueued_count::text,
              coalesce(run.fail_reason, '')
            ),
            ',' order by
              run.organization_id,
              run.store_id,
              run.metric_date
          ), '')
          from public.sku_daily_metric_rollover_runs as run
          where run.organization_id is distinct from ${org}
        ),
        (
          select coalesce(pg_catalog.string_agg(
            pg_catalog.concat_ws(
              ':',
              enrolled.organization_id::text,
              enrolled.store_id::text,
              enrolled.location_id::text,
              enrolled.variant_id::text,
              enrolled.metric_date::text
            ),
            ',' order by
              enrolled.organization_id,
              enrolled.store_id,
              enrolled.location_id,
              enrolled.variant_id,
              enrolled.metric_date
          ), '')
          from public.sku_daily_metric_rollover_enqueues as enrolled
          where enrolled.organization_id is distinct from ${org}
        ),
        (
          select coalesce(pg_catalog.string_agg(
            pg_catalog.concat_ws(
              ':',
              event.organization_id::text,
              event.event_id::text,
              event.source_date::text,
              coalesce(event.consumed_at::text, '')
            ),
            ',' order by event.organization_id, event.event_id
          ), '')
          from public.sku_daily_metric_source_events as event
          where event.organization_id is distinct from ${org}
        )
      )
    )
  `;
}
