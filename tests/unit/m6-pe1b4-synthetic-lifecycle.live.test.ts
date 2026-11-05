import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("server-only", () => ({}));

import {
  evaluateCanaryForecastEligibilityPolicy,
  M6_PE1B_CANARY_ELIGIBILITY_POLICY_VERSION_V1,
  M6_PE1B_CANARY_POLICY_ATTESTATION_V1,
  type Pe1bCanaryAllowlistEntryV1,
} from "@/lib/decision-engine/canary-forecast-eligibility-policy";
import {
  bindMetricToDecisionInput,
  M7_PB1_METRIC_BINDING_ATTESTATION_V1,
  M7_PB1_METRIC_DECISION_BINDING_VERSION_V1,
} from "@/lib/decision-engine/metric-decision-binding";
import {
  bindPublishedForecastEvidence,
  isPe1aTrustedPublishedForecastBindingSuccess,
  M6_PE1A_BINDING_ATTESTATION_V1,
  M6_PE1A_CHECK_TIME_FRESHNESS_LIMITATION_V1,
  M6_PE1A_PUBLISHED_FORECAST_BINDER_VERSION_V1,
  type Pe1aPublishedForecastBindingSuccess,
} from "@/lib/decision-engine/published-forecast-eligibility";
import { SKU_DAILY_METRIC_ALGORITHM_VERSION } from "@/lib/metrics/sku-daily-metric-record";
import {
  persistForecastSkuDemand,
  persistLoadedForecastSkuDemand,
  ForecastPersistStaleTokenError,
  type ForecastPersistClient,
} from "@/lib/persistence/persist-forecast-sku-demand";
import {
  loadForecastSkuDemand,
  type ForecastSkuDemandLoaderClient,
} from "@/lib/persistence/load-forecast-sku-demand";
import {
  ForecastPublishForeignGrainError,
  ForecastPublishStaleTokenError,
  publishForecastSkuDemand,
  type ForecastPublishClient,
} from "@/lib/persistence/publish-forecast-sku-demand";
import {
  readFreshPublishedSkuForecast,
  type FreshPublishedForecastClient,
} from "@/lib/persistence/read-fresh-published-sku-forecast";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { TenantContext } from "@/lib/tenancy/types";

import {
  assertPe1b4PinnedDbTarget,
  ensurePe1b4LocalSupabaseEnv,
  M6_PE1B4_PINNED_API_URL,
  pe1b4Psql,
  pe1b4PsqlArgs,
  quoteSqlLiteral,
} from "@/tests/support/m6-pe1b4-local-supabase";

/**
 * M6-PE1.b.4b — Env-A synthetic single-grain lifecycle (local Supabase ONLY).
 *
 * calculate → persist → publish → fresh-read → PE1.a → PE1.b.1
 *
 * Safety (normative):
 * - Pin API/DB loopback BEFORE any Supabase JS client.
 * - Collision-check reserved identities BEFORE any write or cleanup.
 * - Never bypass immutability, RLS, or CHECK protections (no trigger toggling).
 * - No initial wipe of pre-existing rows.
 * - Track only rows this run creates; mutable cleanup is reverse-dep + scoped.
 *
 * Retention / cleanup plan (immutable M6 tables):
 * - `forecast_runs`, `sku_forecasts`, `sku_forecast_publications`,
 *   day-evidence tables, parent identity rows, and `inventory_snapshots`
 *   are DELETE-blocked by immutability triggers (and/or ON DELETE RESTRICT).
 *   This suite does NOT delete them — no trigger bypass.
 * - Mutable cleanup only: `sku_forecast_current` (synthetic orgs),
 *   `forecast_coverage_correction_events`, `order_items`, `orders`
 *   created by this run.
 * - After a successful live run, reserved `8100f400-…` identities and immutable
 *   synthetic forecast/evidence/inventory_snapshot rows REMAIN. A later live
 *   run must fail closed on collision until an operator uses a disposable
 *   local DB reset (outside this suite) or otherwise vacates the reserved
 *   namespace. Never claim immutable cleanup succeeded.
 *
 * Opt-in: RUN_SUPABASE_LIVE=1. Skips by default.
 */

const LIVE = process.env.RUN_SUPABASE_LIVE === "1";
const describeLive = LIVE ? describe : describe.skip;

const ORG_A = "8100f400-0000-4000-8000-000000000001";
const ORG_B = "8100f400-0000-4000-8000-000000000011";
const STORE_A = "8100f400-0000-4000-8000-000000000002";
const STORE_B = "8100f400-0000-4000-8000-000000000012";
const LOCATION_A = "8100f400-0000-4000-8000-000000000003";
const LOCATION_B = "8100f400-0000-4000-8000-000000000013";
const PRODUCT_A = "8100f400-0000-4000-8000-000000000004";
const PRODUCT_B = "8100f400-0000-4000-8000-000000000014";
const VARIANT_A = "8100f400-0000-4000-8000-000000000005";
const VARIANT_B = "8100f400-0000-4000-8000-000000000015";
const USER_A = "8100f400-0000-4000-8000-000000000007";

const SYNTHETIC_ORG_IDS = [ORG_A, ORG_B] as const;
const SYNTHETIC_FIXTURE_IDS = [
  ORG_A,
  ORG_B,
  STORE_A,
  STORE_B,
  LOCATION_A,
  LOCATION_B,
  PRODUCT_A,
  PRODUCT_B,
  VARIANT_A,
  VARIANT_B,
  USER_A,
] as const;

const AS_OF = "2026-09-15";
const LOOKBACK = 14;
const EVIDENCE_PREFIX = "pe1b4-";
/** PB1 requires a zone listed by Intl.supportedValuesOf("timeZone"); "UTC" is rejected. */
const STORE_TIME_ZONE = "America/New_York";

function uuidFromSuffix(suffix: string): string {
  const padded = suffix.replace(/[^0-9a-f]/gi, "").padStart(12, "0").slice(-12);
  return `8100f400-0000-4000-8000-${padded}`;
}

function lookbackDates(): string[] {
  const end = new Date(`${AS_OF}T00:00:00.000Z`);
  const dates: string[] = [];
  for (let i = LOOKBACK - 1; i >= 0; i -= 1) {
    const day = new Date(end);
    day.setUTCDate(end.getUTCDate() - i);
    dates.push(day.toISOString().slice(0, 10));
  }
  return dates;
}

/**
 * Complete deterministic commerce UUID inventory (LOOKBACK days).
 * Must stay in lockstep with seedCommerceAndEvidence inserts and the
 * pre-write vacancy probe (PK checks on orders / order_items).
 */
const RESERVED_LOOKBACK_DATES = lookbackDates();
const RESERVED_ORDER_IDS = RESERVED_LOOKBACK_DATES.map((_, index) =>
  uuidFromSuffix(`1${String(index).padStart(11, "0")}`),
);
const RESERVED_ORDER_ITEM_IDS = RESERVED_LOOKBACK_DATES.map((_, index) =>
  uuidFromSuffix(`2${String(index).padStart(11, "0")}`),
);

const TENANTS_SQL = `(${SYNTHETIC_ORG_IDS.map((id) => `${quoteSqlLiteral(id)}::uuid`).join(", ")})`;
const FIXTURE_IDS_SQL = `(${SYNTHETIC_FIXTURE_IDS.map((id) => `${quoteSqlLiteral(id)}::uuid`).join(", ")})`;
const RESERVED_ORDER_IDS_SQL = `(${RESERVED_ORDER_IDS.map((id) => `${quoteSqlLiteral(id)}::uuid`).join(", ")})`;
const RESERVED_ORDER_ITEM_IDS_SQL = `(${RESERVED_ORDER_ITEM_IDS.map((id) => `${quoteSqlLiteral(id)}::uuid`).join(", ")})`;

const TENANT_A: TenantContext = {
  userId: USER_A,
  organizationId: ORG_A,
  role: "owner",
  storeId: STORE_A,
};

const TENANT_B: TenantContext = {
  userId: USER_A,
  organizationId: ORG_B,
  role: "owner",
  storeId: STORE_B,
};

/** Rows this run created. Mutable subset may be deleted without trigger bypass. */
type MutableLedger = {
  orderIds: string[];
  orderItemIds: string[];
  correctionEventMarkers: string[];
  /**
   * Immutable inventory_snapshots created by this run — retained (DELETE
   * blocked by prevent_inventory_snapshot_mutation). Tracked for honesty only.
   */
  retainedInventorySnapshotKeys: Array<{
    organizationId: string;
    storeId: string;
    locationId: string;
    variantId: string;
    observedAt: string;
  }>;
  /** Observed RPC outputs — retained (immutable); tracked for honesty only. */
  retainedForecastRunIds: string[];
  retainedPublicationIds: string[];
  retainedEvidenceIds: string[];
  parentsSeeded: boolean;
  commerceSeeded: boolean;
  fixtureWritesStarted: boolean;
};

const ledger: MutableLedger = {
  orderIds: [],
  orderItemIds: [],
  correctionEventMarkers: [],
  retainedInventorySnapshotKeys: [],
  retainedForecastRunIds: [],
  retainedPublicationIds: [],
  retainedEvidenceIds: [],
  parentsSeeded: false,
  commerceSeeded: false,
  fixtureWritesStarted: false,
};

const suiteState: {
  /**
   * Exact non-Env-A organization identity snapshot captured BEFORE any fixture
   * write. Empty is valid on a fresh disposable DB (zero protected orgs).
   * Format: `${id}|${name}` sorted by id.
   */
  protectedOrgSnapshot: string[];
  happyPathRunId: string | null;
} = {
  protectedOrgSnapshot: [],
  happyPathRunId: null,
};

function grainA() {
  return {
    organizationId: ORG_A,
    storeId: STORE_A,
    locationId: LOCATION_A,
    variantId: VARIANT_A,
  };
}

function allowlistEntry(
  overrides: Partial<Pe1bCanaryAllowlistEntryV1> = {},
): Pe1bCanaryAllowlistEntryV1 {
  return {
    organizationId: ORG_A,
    storeId: STORE_A,
    locationId: LOCATION_A,
    variantId: VARIANT_A,
    revokedAt: null,
    label: "pe1b4-env-a-synthetic-only",
    ...overrides,
  };
}

function adminClient(): ForecastPersistClient &
  ForecastPublishClient &
  ForecastSkuDemandLoaderClient &
  FreshPublishedForecastClient {
  return createSupabaseAdminClient() as unknown as ForecastPersistClient &
    ForecastPublishClient &
    ForecastSkuDemandLoaderClient &
    FreshPublishedForecastClient;
}

function pe1aEvidenceFromFresh(
  fresh: Awaited<ReturnType<typeof readFreshPublishedSkuForecast>>,
): Record<string, unknown> {
  return {
    disposition: fresh.disposition,
    m7NumericEligible: fresh.m7NumericEligible,
    dailyDemand: fresh.dailyDemand,
    claimsPostCommitFreshness: fresh.claimsPostCommitFreshness,
    freshnessLimitation: fresh.freshnessLimitation,
    grain: fresh.grain,
    publicationId: fresh.publicationId,
    forecastRunId: fresh.forecastRunId,
    skuForecastId: fresh.skuForecastId,
    sourceToken: fresh.sourceToken,
    forecastAsOf: fresh.forecastAsOf,
    lookbackDays: fresh.lookbackDays,
    confidence: fresh.confidence,
    mode: fresh.mode,
    dataSufficiency: fresh.dataSufficiency,
  };
}

function baseLoadInput() {
  return {
    tenant: TENANT_A,
    locationId: LOCATION_A,
    variantId: VARIANT_A,
    forecastAsOf: AS_OF,
    lookbackDays: LOOKBACK,
  };
}

function evaluatePolicy(
  binding: Pe1aPublishedForecastBindingSuccess,
  overrides: {
    canaryAllowlist?: Pe1bCanaryAllowlistEntryV1[];
    evidenceAuthenticity?:
      | "fresh_reader_shaped_structural_only"
      | "db_rpc_fresh_reader_v1";
  } = {},
) {
  return evaluateCanaryForecastEligibilityPolicy({
    policyVersion: M6_PE1B_CANARY_ELIGIBILITY_POLICY_VERSION_V1,
    policyAttestation: M6_PE1B_CANARY_POLICY_ATTESTATION_V1,
    trustedGrain: grainA(),
    binding,
    evidenceAuthenticity:
      overrides.evidenceAuthenticity ?? "fresh_reader_shaped_structural_only",
    canaryAllowlist: overrides.canaryAllowlist ?? [allowlistEntry()],
    claimsMerchantFacing: false,
    claimsProductionForecastApproval: false,
    claimsM7ProductionEligibility: false,
    algorithmApproved: false,
    forecastAgePolicy: "unapproved",
    algorithmPinPolicy: "unapproved",
    productionEligibilityAttestation: null,
  });
}

/**
 * READ-ONLY identity snapshot of every organization outside the reserved
 * Env-A synthetic tenant set. Empty array is valid (fresh disposable DB).
 * Never seeds artificial "protected" orgs merely to satisfy a count.
 */
async function snapshotNonEnvAOrganizations(): Promise<string[]> {
  assertPe1b4PinnedDbTarget();
  const raw = await pe1b4Psql(`
    select id::text || '|' || coalesce(name, '')
    from public.organizations
    where id not in ${TENANTS_SQL}
    order by id
  `);
  if (!raw) {
    return [];
  }
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Fail closed if any non-Env-A organization identity was added, removed, or
 * renamed relative to the pre-write snapshot (including the empty snapshot).
 */
async function assertProtectedOrganizationsIntact(): Promise<void> {
  const actual = await snapshotNonEnvAOrganizations();
  expect(actual).toEqual(suiteState.protectedOrgSnapshot);
}

/**
 * READ-ONLY pre-write collision probe. Must run before any INSERT/UPDATE/DELETE/RPC.
 * Fail closed ⇒ zero fixture writes.
 *
 * Covers every deterministic fixture UUID, including reserved order and
 * order-item primary keys (not only org-scoped commerce rows).
 */
async function assertReservedNamespaceVacantOrFail(): Promise<void> {
  assertPe1b4PinnedDbTarget();

  if (
    RESERVED_ORDER_IDS.length !== LOOKBACK ||
    RESERVED_ORDER_ITEM_IDS.length !== LOOKBACK
  ) {
    throw new Error(
      "PE1.b.4b internal error: reserved commerce UUID inventory length mismatch.",
    );
  }

  const identityHits = await pe1b4Psql(`
    select count(*)::text from (
      select id from public.organizations where id in ${FIXTURE_IDS_SQL}
      union all
      select id from public.stores where id in ${FIXTURE_IDS_SQL}
      union all
      select id from public.locations where id in ${FIXTURE_IDS_SQL}
      union all
      select id from public.products where id in ${FIXTURE_IDS_SQL}
      union all
      select id from public.product_variants where id in ${FIXTURE_IDS_SQL}
      union all
      select id from auth.users where id in ${FIXTURE_IDS_SQL}
    ) as identity_hits
  `);
  if (identityHits !== "0") {
    throw new Error(
      `PE1.b.4b fail-closed pre-write collision: ${identityHits} reserved identity row(s) already exist under 8100f400; refusing any write/cleanup.`,
    );
  }

  const commercePkHits = await pe1b4Psql(`
    select count(*)::text from (
      select id from public.orders where id in ${RESERVED_ORDER_IDS_SQL}
      union all
      select id from public.order_items where id in ${RESERVED_ORDER_ITEM_IDS_SQL}
    ) as commerce_pk_hits
  `);
  if (commercePkHits !== "0") {
    throw new Error(
      `PE1.b.4b fail-closed pre-write collision: ${commercePkHits} reserved order/order_item UUID(s) already exist; refusing any write/cleanup.`,
    );
  }

  const ownedHits = await pe1b4Psql(`
    select count(*)::text from (
      select organization_id as id from public.forecast_runs
        where organization_id in ${TENANTS_SQL}
      union all
      select organization_id from public.sku_forecasts
        where organization_id in ${TENANTS_SQL}
      union all
      select organization_id from public.sku_forecast_publications
        where organization_id in ${TENANTS_SQL}
      union all
      select organization_id from public.sku_forecast_current
        where organization_id in ${TENANTS_SQL}
      union all
      select organization_id from public.forecast_day_coverage_evidence
        where organization_id in ${TENANTS_SQL}
           or evidence_id like ${quoteSqlLiteral(`${EVIDENCE_PREFIX}%`)}
      union all
      select organization_id from public.forecast_day_promotion_evidence
        where organization_id in ${TENANTS_SQL}
           or evidence_id like ${quoteSqlLiteral(`${EVIDENCE_PREFIX}%`)}
      union all
      select organization_id from public.forecast_coverage_correction_events
        where organization_id in ${TENANTS_SQL}
      union all
      select organization_id from public.orders
        where organization_id in ${TENANTS_SQL}
      union all
      select organization_id from public.order_items
        where organization_id in ${TENANTS_SQL}
      union all
      select organization_id from public.inventory_snapshots
        where organization_id in ${TENANTS_SQL}
    ) as owned_hits
  `);
  if (ownedHits !== "0") {
    throw new Error(
      `PE1.b.4b fail-closed pre-write collision: ${ownedHits} owned fixture/forecast row(s) already exist for reserved Env-A namespace; refusing any write/cleanup. Use a disposable local DB reset outside this suite.`,
    );
  }
}

async function seedParentsFailClosed(): Promise<void> {
  if (ledger.fixtureWritesStarted) {
    throw new Error("PE1.b.4b internal error: fixture writes already started.");
  }
  ledger.fixtureWritesStarted = true;

  await pe1b4Psql(`
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data
    ) values (
      ${quoteSqlLiteral(USER_A)}::uuid,
      '00000000-0000-0000-0000-000000000000'::uuid,
      'authenticated', 'authenticated', 'm6-pe1b4@example.invalid', '',
      now(), now(), now(), '{}'::jsonb, '{}'::jsonb
    );

    insert into public.organizations (id, name, default_currency, timezone) values
      (${quoteSqlLiteral(ORG_A)}::uuid, 'PE1.b.4b Env-A A', 'USD', ${quoteSqlLiteral(STORE_TIME_ZONE)}),
      (${quoteSqlLiteral(ORG_B)}::uuid, 'PE1.b.4b Env-A B', 'USD', ${quoteSqlLiteral(STORE_TIME_ZONE)});

    insert into public.organization_members (organization_id, user_id, role)
    values (${quoteSqlLiteral(ORG_A)}::uuid, ${quoteSqlLiteral(USER_A)}::uuid, 'owner');

    insert into public.stores (id, organization_id, name, status, currency, timezone) values
      (${quoteSqlLiteral(STORE_A)}::uuid, ${quoteSqlLiteral(ORG_A)}::uuid, 'A', 'active', 'USD', ${quoteSqlLiteral(STORE_TIME_ZONE)}),
      (${quoteSqlLiteral(STORE_B)}::uuid, ${quoteSqlLiteral(ORG_B)}::uuid, 'B', 'active', 'USD', ${quoteSqlLiteral(STORE_TIME_ZONE)});

    insert into public.locations (id, organization_id, store_id, name, status) values
      (${quoteSqlLiteral(LOCATION_A)}::uuid, ${quoteSqlLiteral(ORG_A)}::uuid, ${quoteSqlLiteral(STORE_A)}::uuid, 'A', 'active'),
      (${quoteSqlLiteral(LOCATION_B)}::uuid, ${quoteSqlLiteral(ORG_B)}::uuid, ${quoteSqlLiteral(STORE_B)}::uuid, 'B', 'active');

    insert into public.products (id, organization_id, store_id, title, status) values
      (${quoteSqlLiteral(PRODUCT_A)}::uuid, ${quoteSqlLiteral(ORG_A)}::uuid, ${quoteSqlLiteral(STORE_A)}::uuid, 'A', 'active'),
      (${quoteSqlLiteral(PRODUCT_B)}::uuid, ${quoteSqlLiteral(ORG_B)}::uuid, ${quoteSqlLiteral(STORE_B)}::uuid, 'B', 'active');

    insert into public.product_variants (id, organization_id, store_id, product_id, sku, status) values
      (${quoteSqlLiteral(VARIANT_A)}::uuid, ${quoteSqlLiteral(ORG_A)}::uuid, ${quoteSqlLiteral(STORE_A)}::uuid, ${quoteSqlLiteral(PRODUCT_A)}::uuid, 'PE1B4-A1', 'active'),
      (${quoteSqlLiteral(VARIANT_B)}::uuid, ${quoteSqlLiteral(ORG_B)}::uuid, ${quoteSqlLiteral(STORE_B)}::uuid, ${quoteSqlLiteral(PRODUCT_B)}::uuid, 'PE1B4-B1', 'active');
  `);
  ledger.parentsSeeded = true;
}

async function seedCommerceAndEvidence(): Promise<void> {
  const dates = RESERVED_LOOKBACK_DATES;
  const orderSql: string[] = [];
  const itemSql: string[] = [];
  const invSql: string[] = [];
  const covSql: string[] = [];
  const promoSql: string[] = [];

  dates.forEach((localDate, index) => {
    const orderId = RESERVED_ORDER_IDS[index];
    const itemId = RESERVED_ORDER_ITEM_IDS[index];
    ledger.orderIds.push(orderId);
    ledger.orderItemIds.push(itemId);
    ledger.retainedInventorySnapshotKeys.push({
      organizationId: ORG_A,
      storeId: STORE_A,
      locationId: LOCATION_A,
      variantId: VARIANT_A,
      observedAt: `${localDate}T18:00:00Z`,
    });

    orderSql.push(`(
      ${quoteSqlLiteral(orderId)}::uuid,
      ${quoteSqlLiteral(ORG_A)}::uuid,
      ${quoteSqlLiteral(STORE_A)}::uuid,
      'completed',
      ${quoteSqlLiteral(`${localDate}T12:00:00Z`)}::timestamptz,
      'USD', 'csv'
    )`);
    itemSql.push(`(
      ${quoteSqlLiteral(itemId)}::uuid,
      ${quoteSqlLiteral(ORG_A)}::uuid,
      ${quoteSqlLiteral(STORE_A)}::uuid,
      ${quoteSqlLiteral(orderId)}::uuid,
      ${quoteSqlLiteral(VARIANT_A)}::uuid,
      ${quoteSqlLiteral(LOCATION_A)}::uuid,
      4
    )`);
    invSql.push(`(
      ${quoteSqlLiteral(ORG_A)}::uuid,
      ${quoteSqlLiteral(STORE_A)}::uuid,
      ${quoteSqlLiteral(LOCATION_A)}::uuid,
      ${quoteSqlLiteral(VARIANT_A)}::uuid,
      ${quoteSqlLiteral(`${localDate}T18:00:00Z`)}::timestamptz,
      12, 'csv'
    )`);

    const ordersEv = `${EVIDENCE_PREFIX}orders-${localDate}`;
    const returnsEv = `${EVIDENCE_PREFIX}returns-${localDate}`;
    const promoEv = `${EVIDENCE_PREFIX}promo-${localDate}`;
    ledger.retainedEvidenceIds.push(ordersEv, returnsEv, promoEv);

    covSql.push(`(
      ${quoteSqlLiteral(ordersEv)},
      ${quoteSqlLiteral(ORG_A)}::uuid, ${quoteSqlLiteral(STORE_A)}::uuid,
      null, null,
      ${quoteSqlLiteral(localDate)}::date, 'orders', 'complete',
      'verified_merchant_attestation', 'merchant:attestation',
      '2026-09-16T00:00:00Z'::timestamptz,
      '2026-09-16T00:00:00Z'::timestamptz,
      1, null, null,
      ${quoteSqlLiteral(`${EVIDENCE_PREFIX}idem-orders-${localDate}`)},
      null, ${quoteSqlLiteral(USER_A)}::uuid, null,
      ${quoteSqlLiteral(`merchant_day_stream_closure:${ordersEv}`)}
    )`);
    covSql.push(`(
      ${quoteSqlLiteral(returnsEv)},
      ${quoteSqlLiteral(ORG_A)}::uuid, ${quoteSqlLiteral(STORE_A)}::uuid,
      ${quoteSqlLiteral(LOCATION_A)}::uuid, ${quoteSqlLiteral(VARIANT_A)}::uuid,
      ${quoteSqlLiteral(localDate)}::date, 'returns', 'complete',
      'verified_merchant_attestation', 'merchant:attestation',
      '2026-09-16T00:00:00Z'::timestamptz,
      '2026-09-16T00:00:00Z'::timestamptz,
      1, null, null,
      ${quoteSqlLiteral(`${EVIDENCE_PREFIX}idem-returns-${localDate}`)},
      null, ${quoteSqlLiteral(USER_A)}::uuid, null,
      ${quoteSqlLiteral(`merchant_day_stream_closure:${returnsEv}`)}
    )`);
    promoSql.push(`(
      ${quoteSqlLiteral(promoEv)},
      ${quoteSqlLiteral(ORG_A)}::uuid, ${quoteSqlLiteral(STORE_A)}::uuid,
      null, null,
      ${quoteSqlLiteral(localDate)}::date, 'none',
      'verified_merchant_attestation', 'merchant:attestation',
      '2026-09-16T00:00:00Z'::timestamptz, 1,
      null, null,
      ${quoteSqlLiteral(`${EVIDENCE_PREFIX}idem-promo-${localDate}`)},
      null, ${quoteSqlLiteral(USER_A)}::uuid, null
    )`);
  });

  await pe1b4Psql(`
    insert into public.orders (
      id, organization_id, store_id, status, ordered_at, currency, source
    ) values ${orderSql.join(",\n")};

    insert into public.order_items (
      id, organization_id, store_id, order_id, variant_id, location_id, quantity
    ) values ${itemSql.join(",\n")};

    insert into public.inventory_snapshots (
      organization_id, store_id, location_id, variant_id,
      observed_at, available_quantity, source
    ) values ${invSql.join(",\n")};

    insert into public.forecast_day_coverage_evidence (
      evidence_id, organization_id, store_id, location_id, variant_id,
      local_date, stream, coverage, trust, source,
      as_of, observed_at, version, invalidated_at, supersedes_evidence_id,
      idempotency_key, integration_id, actor_user_id, provider, closure_id
    ) values ${covSql.join(",\n")};

    insert into public.forecast_day_promotion_evidence (
      evidence_id, organization_id, store_id, location_id, variant_id,
      local_date, state, trust, source, observed_at, version,
      invalidated_at, supersedes_evidence_id, idempotency_key,
      integration_id, actor_user_id, provider
    ) values ${promoSql.join(",\n")};
  `);

  // Capture triggers may enqueue corrections; remove only synthetic-org events
  // created as a side effect of OUR inserts (org vacant before this run).
  await pe1b4Psql(`
    delete from public.forecast_coverage_correction_events
    where organization_id in ${TENANTS_SQL};
  `);

  ledger.commerceSeeded = true;
}

/**
 * Mutable-only cleanup for rows this run created.
 * Does not delete immutable forecast/evidence/identity/inventory_snapshot rows.
 * Does not disable triggers.
 */
async function cleanupMutableRowsCreatedByThisRun(): Promise<{
  mutableCleanupAttempted: true;
  immutableRetained: true;
}> {
  assertPe1b4PinnedDbTarget();

  if (ledger.orderItemIds.length > 0) {
    const ids = ledger.orderItemIds
      .map((id) => `${quoteSqlLiteral(id)}::uuid`)
      .join(", ");
    await pe1b4Psql(`
      delete from public.order_items
      where id in (${ids})
        and organization_id in ${TENANTS_SQL};
    `);
  }

  if (ledger.orderIds.length > 0) {
    const ids = ledger.orderIds
      .map((id) => `${quoteSqlLiteral(id)}::uuid`)
      .join(", ");
    await pe1b4Psql(`
      delete from public.orders
      where id in (${ids})
        and organization_id in ${TENANTS_SQL};
    `);
  }

  // inventory_snapshots are immutable historical evidence — retain only.
  // Do not issue DELETE against inventory_snapshots (trigger-blocked).

  await pe1b4Psql(`
    delete from public.forecast_coverage_correction_events
    where organization_id in ${TENANTS_SQL};
  `);

  // Mutable pointer only. Publications/runs/snapshots remain (immutable).
  await pe1b4Psql(`
    delete from public.sku_forecast_current
    where organization_id in ${TENANTS_SQL};
  `);

  return { mutableCleanupAttempted: true, immutableRetained: true };
}

async function assertImmutabilityTriggersStillEnabled(): Promise<void> {
  const disabled = await pe1b4Psql(`
    select count(*)::text
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in (
        'forecast_runs',
        'sku_forecasts',
        'sku_forecast_publications',
        'forecast_day_coverage_evidence',
        'forecast_day_promotion_evidence'
      )
      and t.tgname in (
        'forecast_runs_immutable',
        'sku_forecasts_immutable',
        'sku_forecast_publications_immutable',
        'forecast_day_coverage_evidence_immutable_body',
        'forecast_day_promotion_evidence_immutable_body'
      )
      and t.tgenabled = 'D'
  `);
  expect(disabled).toBe("0");
}

describeLive("M6-PE1.b.4b synthetic Env-A forecast lifecycle (live, local only)", () => {
  beforeAll(async () => {
    // 1) Pin targets before any client or fixture write.
    expect(pe1b4PsqlArgs().slice(0, 4)).toEqual([
      "-h",
      "127.0.0.1",
      "-p",
      "55322",
    ]);
    assertPe1b4PinnedDbTarget();
    ensurePe1b4LocalSupabaseEnv();
    expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe(M6_PE1B4_PINNED_API_URL);

    await pe1b4Psql("select 1");
    await assertImmutabilityTriggersStillEnabled();

    expect(
      await pe1b4Psql(`
        select to_regprocedure(
          'public.forecast_sku_demand_source_snapshot(uuid,uuid,uuid,uuid,date,integer)'
        )::text
      `),
    ).toContain("forecast_sku_demand_source_snapshot");
    expect(
      await pe1b4Psql(`
        select to_regprocedure(
          'public.persist_forecast_sku_demand_result(uuid,uuid,uuid,uuid,date,integer,text,jsonb)'
        )::text
      `),
    ).toContain("persist_forecast_sku_demand_result");
    expect(
      await pe1b4Psql(
        `select to_regprocedure('public.publish_sku_forecast(uuid)')::text`,
      ),
    ).toContain("publish_sku_forecast");
    expect(
      await pe1b4Psql(`
        select to_regprocedure(
          'public.read_fresh_published_sku_forecast(uuid,uuid,uuid,uuid)'
        )::text
      `),
    ).toContain("read_fresh_published_sku_forecast");

    // 2) Snapshot non-Env-A orgs BEFORE any write. Zero orgs is valid.
    suiteState.protectedOrgSnapshot = await snapshotNonEnvAOrganizations();
    // Identity lock only — do not require count >= 1 on disposable DBs.

    // 3) Pre-write collision (no wipe). Failure ⇒ zero fixture writes.
    await assertReservedNamespaceVacantOrFail();

    // 4) Seed only after vacancy proven.
    await seedParentsFailClosed();
    await seedCommerceAndEvidence();
    await assertProtectedOrganizationsIntact();
    await assertImmutabilityTriggersStillEnabled();
  }, 180000);

  afterAll(async () => {
    // beforeAll abort before seedParentsFailClosed ⇒ fixtureWritesStarted
    // remains false ⇒ no cleanup mutations.
    if (!ledger.fixtureWritesStarted) {
      return;
    }

    const cleanup = await cleanupMutableRowsCreatedByThisRun();
    expect(cleanup.mutableCleanupAttempted).toBe(true);
    expect(cleanup.immutableRetained).toBe(true);

    // Honest retention: immutable synthetic forecast/evidence/parents/snapshots remain.
    if (ledger.retainedForecastRunIds.length > 0) {
      const retained = await pe1b4Psql(`
        select count(*)::text from public.forecast_runs
        where id in (${ledger.retainedForecastRunIds
          .map((id) => `${quoteSqlLiteral(id)}::uuid`)
          .join(", ")})
          and organization_id in ${TENANTS_SQL}
      `);
      expect(Number(retained)).toBeGreaterThan(0);
    }

    if (ledger.retainedInventorySnapshotKeys.length > 0) {
      const retainedSnaps = await pe1b4Psql(`
        select count(*)::text from public.inventory_snapshots
        where organization_id in ${TENANTS_SQL}
          and variant_id = ${quoteSqlLiteral(VARIANT_A)}::uuid
      `);
      expect(Number(retainedSnaps)).toBeGreaterThan(0);
    }

    await assertProtectedOrganizationsIntact();
    await assertImmutabilityTriggersStillEnabled();
  }, 180000);

  it("runs calculate → persist → publish → fresh-read → PE1.a → PE1.b.1 under hard-false gates", async () => {
    ensurePe1b4LocalSupabaseEnv();
    const client = adminClient();

    const persisted = await persistForecastSkuDemand(baseLoadInput(), client);
    ledger.retainedForecastRunIds.push(persisted.forecastRunId);
    suiteState.happyPathRunId = persisted.forecastRunId;

    expect(persisted.published).toBe(false);
    expect(persisted.m7Eligible).toBe(false);
    expect(persisted.persistClaimsPostCommitFreshness).toBe(false);
    expect(persisted.forecast.dailyDemand).not.toBeNull();
    expect(["medium", "high"]).toContain(persisted.forecast.confidence);
    expect(["standard", "limited_history"]).toContain(persisted.forecast.mode);

    const published = await publishForecastSkuDemand(
      {
        tenant: TENANT_A,
        locationId: LOCATION_A,
        variantId: VARIANT_A,
        forecastRunId: persisted.forecastRunId,
      },
      client,
    );
    ledger.retainedPublicationIds.push(published.publicationId);
    expect(published.disposition).toBe("published");
    expect(published.m7Eligible).toBe(false);
    expect(published.publicationClaimsPostCommitFreshness).toBe(false);
    expect(published.published).toBe(true);

    // PK column is `id` (adapter field publicationId maps to publications.id).
    const m7Flag = await pe1b4Psql(`
      select m7_eligible::text
      from public.sku_forecast_publications
      where id = ${quoteSqlLiteral(published.publicationId)}::uuid
        and organization_id = ${quoteSqlLiteral(ORG_A)}::uuid
    `);
    expect(m7Flag).toBe("false");

    const fresh = await readFreshPublishedSkuForecast(
      {
        tenant: TENANT_A,
        locationId: LOCATION_A,
        variantId: VARIANT_A,
      },
      client,
    );
    expect(fresh.claimsPostCommitFreshness).toBe(false);
    expect(fresh.freshnessLimitation).toBe(
      M6_PE1A_CHECK_TIME_FRESHNESS_LIMITATION_V1,
    );
    expect(fresh.disposition).toBe("eligible");
    if (fresh.disposition !== "eligible") {
      throw new Error("expected eligible fresh-read for Age-D happy path");
    }
    expect(fresh.m7NumericEligible).toBe(true);

    const pe1a = bindPublishedForecastEvidence({
      binderVersion: M6_PE1A_PUBLISHED_FORECAST_BINDER_VERSION_V1,
      bindingAttestation: M6_PE1A_BINDING_ATTESTATION_V1,
      trustedGrain: grainA(),
      evidence: pe1aEvidenceFromFresh(fresh),
      claimsMerchantFacing: false,
      claimsProductionForecastApproval: false,
      claimsM7ProductionEligibility: false,
      algorithmApproved: false,
    });
    expect(pe1a.ok).toBe(true);
    if (!pe1a.ok) {
      return;
    }
    expect(isPe1aTrustedPublishedForecastBindingSuccess(pe1a)).toBe(true);
    expect(pe1a.forecastEligibility).toBe("ineligible");
    expect(pe1a.forecastExpectedDemandUnits).toBeNull();
    expect(pe1a.provenance.m7Eligible).toBe(false);
    expect(pe1a.productionCreateBlockedUntil).toContain(
      "M6_PRODUCTION_FORECAST_ELIGIBILITY_APPROVED",
    );

    const pe1b = evaluatePolicy(pe1a);
    expect(pe1b.ok).toBe(true);
    if (!pe1b.ok) {
      return;
    }
    expect(pe1b.decisionState).toBe("ineligible_age_unapproved");
    expect(pe1b.decisionState).not.toBe("production_eligible");
    expect(pe1b.forecastEligibility).toBe("ineligible");
    expect(pe1b.forecastExpectedDemandUnits).toBeNull();
    expect(pe1b.technicalNumericEligible).toBe(true);
    expect(pe1b.mappingNotes).toContain("AGE_POLICY_NOT_APPROVED");
    expect(pe1b.mappingNotes).toContain("ALGORITHM_PIN_MISS");
    expect(pe1b.mappingNotes).toContain("PRODUCTION_ATTESTATION_INACTIVE");
    expect(pe1b.productionCreateBlockedUntil).toContain(
      "M6_PRODUCTION_FORECAST_ELIGIBILITY_APPROVED",
    );

    const pb1Ok = bindMetricToDecisionInput({
      bindingVersion: M7_PB1_METRIC_DECISION_BINDING_VERSION_V1,
      bindingAttestation: M7_PB1_METRIC_BINDING_ATTESTATION_V1,
      trustedScope: {
        organizationId: ORG_A,
        storeId: STORE_A,
        storeTimeZone: STORE_TIME_ZONE,
      },
      grain: {
        organizationId: ORG_A,
        storeId: STORE_A,
        locationId: LOCATION_A,
        variantId: VARIANT_A,
      },
      metric: {
        organizationId: ORG_A,
        storeId: STORE_A,
        locationId: LOCATION_A,
        variantId: VARIANT_A,
        metricDate: AS_OF,
        algorithmVersion: SKU_DAILY_METRIC_ALGORITHM_VERSION,
        updatedAt: "2026-09-15T20:00:00.000Z",
        availableQuantity: 40,
        eligibleIncomingQuantity: null,
        eligibleIncomingReasonCode: "incoming_state_unknown",
        salesVelocity30d: 2.5,
        daysOfStock: 16,
        safetyStock: 8,
        reorderPoint: 25,
        targetStock: 50,
        inventoryAgeDays: null,
        demandTrend: "stable",
      },
      pinnedTimeZone: STORE_TIME_ZONE,
      forecastEligibility: pe1b.forecastEligibility,
      claimsMerchantFacing: false,
      claimsProductionForecastApproval: false,
      claimsM7ProductionEligibility: false,
      algorithmApproved: false,
    });
    expect(pb1Ok.ok).toBe(true);
    if (pb1Ok.ok) {
      expect(pb1Ok.provenance.forecastEligibility).toBe("ineligible");
      expect(pb1Ok.decisionInput.forecastExpectedDemandUnits).toBeNull();
      expect(pb1Ok.productionCreateBlockedUntil).toContain(
        "M6_PRODUCTION_FORECAST_ELIGIBILITY_APPROVED",
      );
    }

    const pb1Reject = bindMetricToDecisionInput({
      bindingVersion: M7_PB1_METRIC_DECISION_BINDING_VERSION_V1,
      bindingAttestation: M7_PB1_METRIC_BINDING_ATTESTATION_V1,
      trustedScope: {
        organizationId: ORG_A,
        storeId: STORE_A,
        storeTimeZone: STORE_TIME_ZONE,
      },
      grain: {
        organizationId: ORG_A,
        storeId: STORE_A,
        locationId: LOCATION_A,
        variantId: VARIANT_A,
      },
      metric: {
        organizationId: ORG_A,
        storeId: STORE_A,
        locationId: LOCATION_A,
        variantId: VARIANT_A,
        metricDate: AS_OF,
        algorithmVersion: SKU_DAILY_METRIC_ALGORITHM_VERSION,
        updatedAt: "2026-09-15T20:00:00.000Z",
        availableQuantity: 40,
        eligibleIncomingQuantity: null,
        eligibleIncomingReasonCode: "incoming_state_unknown",
        salesVelocity30d: 2.5,
        daysOfStock: 16,
        safetyStock: 8,
        reorderPoint: 25,
        targetStock: 50,
        inventoryAgeDays: null,
        demandTrend: "stable",
      },
      pinnedTimeZone: STORE_TIME_ZONE,
      forecastEligibility: "eligible" as unknown as "ineligible",
      claimsMerchantFacing: false,
      claimsProductionForecastApproval: false,
      claimsM7ProductionEligibility: false,
      algorithmApproved: false,
    });
    expect(pb1Reject.ok).toBe(false);
    if (!pb1Reject.ok) {
      expect(pb1Reject.code).toBe("FORECAST_ELIGIBILITY_INVALID");
    }

    await assertProtectedOrganizationsIntact();
  }, 180000);

  it("keeps PE1.b.1 fail-closed for empty/revoked allowlist and forged DB authenticity", async () => {
    ensurePe1b4LocalSupabaseEnv();
    const client = adminClient();

    // Reuse current pointer from happy path while source token is still fresh.
    const fresh = await readFreshPublishedSkuForecast(
      {
        tenant: TENANT_A,
        locationId: LOCATION_A,
        variantId: VARIANT_A,
      },
      client,
    );
    expect(fresh.disposition).toBe("eligible");

    const pe1a = bindPublishedForecastEvidence({
      binderVersion: M6_PE1A_PUBLISHED_FORECAST_BINDER_VERSION_V1,
      bindingAttestation: M6_PE1A_BINDING_ATTESTATION_V1,
      trustedGrain: grainA(),
      evidence: pe1aEvidenceFromFresh(fresh),
      claimsMerchantFacing: false,
      claimsProductionForecastApproval: false,
      claimsM7ProductionEligibility: false,
      algorithmApproved: false,
    });
    expect(pe1a.ok).toBe(true);
    if (!pe1a.ok) {
      return;
    }

    const empty = evaluatePolicy(pe1a, { canaryAllowlist: [] });
    expect(empty.ok).toBe(true);
    if (empty.ok) {
      expect(empty.decisionState).toBe("ineligible_allowlist");
      expect(empty.mappingNotes).toContain("CANARY_ALLOWLIST_MISS");
      expect(empty.mappingNotes).toContain("AGE_POLICY_NOT_APPROVED");
      expect(empty.forecastEligibility).toBe("ineligible");
    }

    const revoked = evaluatePolicy(pe1a, {
      canaryAllowlist: [
        allowlistEntry({ revokedAt: "2026-11-01T00:00:00.000Z" }),
      ],
    });
    expect(revoked.ok).toBe(true);
    if (revoked.ok) {
      expect(revoked.decisionState).toBe("ineligible_allowlist");
      expect(revoked.mappingNotes).toContain("CANARY_ALLOWLIST_REVOKED");
    }

    const forged = evaluatePolicy(pe1a, {
      evidenceAuthenticity: "db_rpc_fresh_reader_v1",
    });
    expect(forged.ok).toBe(false);
    if (!forged.ok) {
      expect(forged.code).toBe("AUTHENTICITY_CLASS_INSUFFICIENT");
    }

    await assertProtectedOrganizationsIntact();
  }, 120000);

  it("rejects cross-org publish of another tenant's forecastRunId", async () => {
    ensurePe1b4LocalSupabaseEnv();
    const client = adminClient();
    const runId = suiteState.happyPathRunId;
    expect(runId).toBeTruthy();
    if (!runId) {
      throw new Error("happy-path forecastRunId missing");
    }

    await expect(
      publishForecastSkuDemand(
        {
          tenant: TENANT_B,
          locationId: LOCATION_B,
          variantId: VARIANT_B,
          forecastRunId: runId,
        },
        client,
      ),
    ).rejects.toBeInstanceOf(ForecastPublishForeignGrainError);

    await assertProtectedOrganizationsIntact();
  }, 120000);

  it("fails closed on stale sourceToken for persist-loaded and publish paths", async () => {
    ensurePe1b4LocalSupabaseEnv();
    const client = adminClient();
    const loaded = await loadForecastSkuDemand(baseLoadInput(), client);

    await pe1b4Psql(`
      insert into public.forecast_coverage_correction_events (
        organization_id, store_id, stream, local_date,
        location_id, variant_id, business_at, arrived_at,
        source_table, source_op
      ) values (
        ${quoteSqlLiteral(ORG_A)}::uuid, ${quoteSqlLiteral(STORE_A)}::uuid,
        'orders', ${quoteSqlLiteral(AS_OF)}::date,
        null, null,
        '2026-09-15T08:00:00Z'::timestamptz,
        '2026-09-16T01:00:00Z'::timestamptz,
        'order_items', 'update'
      );
    `);
    ledger.correctionEventMarkers.push("stale-persist");

    await expect(
      persistLoadedForecastSkuDemand(loaded, client),
    ).rejects.toBeInstanceOf(ForecastPersistStaleTokenError);

    // Keep the correction so the next persist creates an unpublished run with
    // a NEW sourceToken. Clearing it would replay the already-published
    // happy-path run, and publish_sku_forecast would short-circuit to
    // disposition=replayed BEFORE the post-lock stale-token check.
    const freshPersist = await persistForecastSkuDemand(baseLoadInput(), client);
    ledger.retainedForecastRunIds.push(freshPersist.forecastRunId);
    expect(freshPersist.forecastRunId).not.toBe(suiteState.happyPathRunId);
    expect(freshPersist.disposition).toBe("created");

    await pe1b4Psql(`
      insert into public.forecast_coverage_correction_events (
        organization_id, store_id, stream, local_date,
        location_id, variant_id, business_at, arrived_at,
        source_table, source_op
      ) values (
        ${quoteSqlLiteral(ORG_A)}::uuid, ${quoteSqlLiteral(STORE_A)}::uuid,
        'orders', ${quoteSqlLiteral(AS_OF)}::date,
        null, null,
        '2026-09-15T09:00:00Z'::timestamptz,
        '2026-09-16T02:00:00Z'::timestamptz,
        'order_items', 'update'
      );
    `);
    ledger.correctionEventMarkers.push("stale-publish");

    await expect(
      publishForecastSkuDemand(
        {
          tenant: TENANT_A,
          locationId: LOCATION_A,
          variantId: VARIANT_A,
          forecastRunId: freshPersist.forecastRunId,
        },
        client,
      ),
    ).rejects.toBeInstanceOf(ForecastPublishStaleTokenError);

    const withheldStale = await pe1b4Psql(`
      select count(*)::text from public.sku_forecast_publications
      where forecast_run_id = ${quoteSqlLiteral(freshPersist.forecastRunId)}::uuid
        and organization_id = ${quoteSqlLiteral(ORG_A)}::uuid
        and outcome = 'withheld'
        and withhold_reason = 'STALE_SOURCE_TOKEN'
    `);
    expect(withheldStale).toBe("1");

    await assertProtectedOrganizationsIntact();
    await assertImmutabilityTriggersStillEnabled();
  }, 180000);
});
