import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

import {
  assertPe1b4PinnedApiUrl,
  assertPe1b4PinnedDbTarget,
  ensurePe1b4LocalSupabaseEnv,
  M6_PE1B4_PINNED_API_URL,
  M6_PE1B4_PINNED_DB_HOST,
  M6_PE1B4_PINNED_DB_PORT,
  pe1b4PsqlArgs,
} from "@/tests/support/m6-pe1b4-local-supabase";

const ROOT = process.cwd();
const LIVE_FILE =
  "tests/unit/m6-pe1b4-synthetic-lifecycle.live.test.ts";
const SUPPORT_FILE =
  "tests/support/m6-pe1b4-local-supabase.ts";

function source(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

describe("M6-PE1.b.4b synthetic lifecycle architecture", () => {
  it("pins fail-closed loopback API/DB endpoints and refuses remote markers", () => {
    expect(M6_PE1B4_PINNED_API_URL).toBe("http://127.0.0.1:55321");
    expect(M6_PE1B4_PINNED_DB_HOST).toBe("127.0.0.1");
    expect(M6_PE1B4_PINNED_DB_PORT).toBe("55322");
    expect(pe1b4PsqlArgs().slice(0, 4)).toEqual([
      "-h",
      "127.0.0.1",
      "-p",
      "55322",
    ]);
    assertPe1b4PinnedDbTarget();
    assertPe1b4PinnedApiUrl("http://127.0.0.1:55321");

    expect(() => assertPe1b4PinnedApiUrl("https://127.0.0.1:55321")).toThrow(
      /non-http|refuse/i,
    );
    expect(() => assertPe1b4PinnedApiUrl("http://localhost:55321")).toThrow(
      /127\.0\.0\.1/,
    );
    expect(() =>
      assertPe1b4PinnedApiUrl(
        "https://qlsqminsfdntpqdkhxjx.supabase.co",
      ),
    ).toThrow(/remote marker|refuse/i);
    expect(() => assertPe1b4PinnedApiUrl("http://127.0.0.1:54321")).toThrow(
      /55321/,
    );
  });

  it("keeps the live suite opt-in skipped by default", () => {
    const live = source(LIVE_FILE);
    expect(live).toContain('process.env.RUN_SUPABASE_LIVE === "1"');
    expect(live).toContain("describe.skip");
    expect(live).toMatch(
      /const describeLive = LIVE \? describe : describe\.skip/,
    );
  });

  it("requires pre-write collision proof before any fixture INSERT and forbids initial wipe", () => {
    const live = source(LIVE_FILE);
    expect(live).toContain("assertReservedNamespaceVacantOrFail");
    expect(live).toContain("pre-write collision");
    expect(live).toContain("refusing any write/cleanup");

    const beforeAllBody = live.slice(
      live.indexOf("beforeAll(async () => {"),
      live.indexOf("afterAll(async () => {"),
    );
    const collisionIdx = beforeAllBody.indexOf(
      "assertReservedNamespaceVacantOrFail",
    );
    const seedParentsIdx = beforeAllBody.indexOf("seedParentsFailClosed");
    const seedCommerceIdx = beforeAllBody.indexOf("seedCommerceAndEvidence");
    expect(collisionIdx).toBeGreaterThan(0);
    expect(seedParentsIdx).toBeGreaterThan(collisionIdx);
    expect(seedCommerceIdx).toBeGreaterThan(seedParentsIdx);

    expect(live).not.toContain("wipeSyntheticNamespace");
    expect(live).not.toContain("wipeSyntheticForecastAndCommerceOnly");
    expect(live).not.toMatch(/\btruncate\s+table\b/i);
    expect(beforeAllBody).not.toMatch(
      /delete from public\.(organizations|forecast_runs|sku_forecast)/i,
    );
  });

  it("includes reserved order and order-item UUIDs in pre-write collision checks", () => {
    const live = source(LIVE_FILE);
    expect(live).toContain("RESERVED_ORDER_IDS");
    expect(live).toContain("RESERVED_ORDER_ITEM_IDS");
    expect(live).toContain("RESERVED_ORDER_IDS_SQL");
    expect(live).toContain("RESERVED_ORDER_ITEM_IDS_SQL");

    const vacancyFn = live.slice(
      live.indexOf("async function assertReservedNamespaceVacantOrFail"),
      live.indexOf("async function seedParentsFailClosed"),
    );
    expect(vacancyFn).toContain("commercePkHits");
    expect(vacancyFn).toMatch(
      /select id from public\.orders where id in \$\{RESERVED_ORDER_IDS_SQL\}/,
    );
    expect(vacancyFn).toMatch(
      /select id from public\.order_items where id in \$\{RESERVED_ORDER_ITEM_IDS_SQL\}/,
    );
    expect(vacancyFn).toContain("reserved order/order_item UUID");

    const seedFn = live.slice(
      live.indexOf("async function seedCommerceAndEvidence"),
      live.indexOf("async function cleanupMutableRowsCreatedByThisRun"),
    );
    expect(seedFn).toContain("RESERVED_ORDER_IDS[index]");
    expect(seedFn).toContain("RESERVED_ORDER_ITEM_IDS[index]");
    expect(seedFn).not.toMatch(/uuidFromSuffix\(`1/);
    expect(seedFn).not.toMatch(/uuidFromSuffix\(`2/);
  });

  it("never disables immutability triggers and documents immutable retention", () => {
    const live = source(LIVE_FILE);
    expect(live).not.toMatch(/alter\s+table[\s\S]{0,80}disable\s+trigger/i);
    expect(live).not.toMatch(/alter\s+table[\s\S]{0,80}enable\s+trigger/i);
    expect(live).not.toMatch(/session_replication_role/i);
    expect(live).toContain("cleanupMutableRowsCreatedByThisRun");
    expect(live).toContain("immutableRetained");
    expect(live).toContain("Retention / cleanup plan");
    expect(live).toContain("assertImmutabilityTriggersStillEnabled");
    expect(live).toMatch(/tgenabled = 'D'/);
  });

  it("locks non-Env-A org identities via snapshot (zero protected orgs allowed)", () => {
    const live = source(LIVE_FILE);
    expect(live).toContain("snapshotNonEnvAOrganizations");
    expect(live).toContain("protectedOrgSnapshot");
    expect(live).toContain("assertProtectedOrganizationsIntact");
    expect(live).toContain(
      "Empty array is valid (fresh disposable DB).",
    );
    expect(live).toContain(
      "Never seeds artificial \"protected\" orgs merely to satisfy a count.",
    );
    expect(live).toMatch(
      /suiteState\.protectedOrgSnapshot = await snapshotNonEnvAOrganizations\(\)/,
    );
    expect(live).toMatch(/expect\(actual\)\.toEqual\(suiteState\.protectedOrgSnapshot\)/);
    expect(live).not.toMatch(
      /protectedOrgCount\)\.toBeGreaterThanOrEqual\(1\)/,
    );
    expect(live).not.toMatch(/countProtectedOrganizations/);
    expect(live).not.toContain("toBeGreaterThanOrEqual(1)");

    // Snapshot + vacancy must precede fixture writes.
    const beforeAll = live.slice(
      live.indexOf("beforeAll(async () => {"),
      live.indexOf("afterAll(async () => {"),
    );
    const snapIdx = beforeAll.indexOf("snapshotNonEnvAOrganizations");
    const vacantIdx = beforeAll.indexOf("assertReservedNamespaceVacantOrFail");
    const seedIdx = beforeAll.indexOf("seedParentsFailClosed");
    expect(snapIdx).toBeGreaterThan(-1);
    expect(vacantIdx).toBeGreaterThan(snapIdx);
    expect(seedIdx).toBeGreaterThan(vacantIdx);

    // afterAll must no-op when beforeAll aborts before fixtureWritesStarted.
    const afterAll = live.slice(live.indexOf("afterAll(async () => {"));
    expect(afterAll).toMatch(
      /if \(!ledger\.fixtureWritesStarted\) \{\s*return;/,
    );
  });

  it("scopes mutable cleanup to this-run ledger and synthetic orgs only", () => {
    const live = source(LIVE_FILE);
    expect(live).toContain("ledger.orderIds");
    expect(live).toContain("ledger.orderItemIds");
    expect(live).toContain("and organization_id in ${TENANTS_SQL}");
    expect(live).toContain("8100f400-0000-4000-8000-000000000001");
    expect(live).toContain("assertProtectedOrganizationsIntact");
    expect(live).toContain("retainedInventorySnapshotKeys");
    expect(live).toContain(
      "Do not issue DELETE against inventory_snapshots (trigger-blocked).",
    );
    expect(live).not.toMatch(
      /(?:await\s+)?pe1b4Psql\(\s*`[^`]*delete\s+from\s+public\.inventory_snapshots/i,
    );
    expect(live).not.toMatch(
      /delete from public\.organizations\s*;/i,
    );
    expect(live).not.toMatch(
      /delete from public\.forecast_runs\s*;/i,
    );
    expect(live).not.toMatch(
      /delete from public\.sku_forecast_publications\s*;/i,
    );

    const cleanupFn = live.slice(
      live.indexOf("async function cleanupMutableRowsCreatedByThisRun"),
      live.indexOf("async function assertImmutabilityTriggersStillEnabled"),
    );
    expect(cleanupFn).toContain("delete from public.order_items");
    expect(cleanupFn).toContain("delete from public.orders");
    expect(cleanupFn).toContain("delete from public.sku_forecast_current");
    expect(cleanupFn).not.toMatch(
      /delete from public\.inventory_snapshots/i,
    );
  });

  it("observes publication m7_eligible via publications.id (not publication_id)", () => {
    const live = source(LIVE_FILE);
    expect(live).toMatch(
      /from public\.sku_forecast_publications\s+where id = \$\{quoteSqlLiteral\(published\.publicationId\)\}/,
    );
    expect(live).not.toMatch(
      /sku_forecast_publications[\s\S]{0,120}where publication_id =/,
    );
  });

  it("forces an unpublished persist before stale-token publish (avoids replay short-circuit)", () => {
    const live = source(LIVE_FILE);
    expect(live).toContain("disposition=replayed BEFORE the post-lock stale-token check");
    expect(live).toContain(
      "freshPersist.forecastRunId).not.toBe(suiteState.happyPathRunId)",
    );
    expect(live).toContain('freshPersist.disposition).toBe("created")');
    expect(live).toContain("withhold_reason = 'STALE_SOURCE_TOKEN'");
    expect(live).not.toMatch(
      /delete from public\.forecast_coverage_correction_events[\s\S]{0,200}persistForecastSkuDemand\(baseLoadInput/,
    );
  });

  it("composes canonical calculate→persist→publish→fresh-read→PE1.a→PE1.b.1 path", () => {
    const live = source(LIVE_FILE);
    expect(live).toContain("persistForecastSkuDemand");
    expect(live).toContain("publishForecastSkuDemand");
    expect(live).toContain("readFreshPublishedSkuForecast");
    expect(live).toContain("bindPublishedForecastEvidence");
    expect(live).toContain("evaluateCanaryForecastEligibilityPolicy");
    expect(live).toContain("bindMetricToDecisionInput");
    expect(live).toContain('decisionState).toBe("ineligible_age_unapproved")');
    expect(live).toContain("m7Eligible).toBe(false)");
    expect(live).toContain("claimsPostCommitFreshness).toBe(false)");
    expect(live).toContain("AGE_POLICY_NOT_APPROVED");
    expect(live).toContain("ALGORITHM_PIN_MISS");
    expect(live).toContain("PRODUCTION_ATTESTATION_INACTIVE");
    expect(live).toContain("M6_PRODUCTION_FORECAST_ELIGIBILITY_APPROVED");
  });

  it("pins PB1 store/pinned timezone to America/New_York (not UTC)", () => {
    const live = source(LIVE_FILE);
    expect(live).toContain('STORE_TIME_ZONE = "America/New_York"');
    expect(live).toContain("storeTimeZone: STORE_TIME_ZONE");
    expect(live).toContain("pinnedTimeZone: STORE_TIME_ZONE");
    expect(live).toContain("quoteSqlLiteral(STORE_TIME_ZONE)");
    expect(live).not.toMatch(/storeTimeZone:\s*"UTC"/);
    expect(live).not.toMatch(/pinnedTimeZone:\s*"UTC"/);
    expect(Intl.supportedValuesOf("timeZone").includes("America/New_York")).toBe(
      true,
    );
  });

  it("includes required negative contract cases without activating production trust", () => {
    const live = source(LIVE_FILE);
    expect(live).toContain("ForecastPublishForeignGrainError");
    expect(live).toContain("ForecastPersistStaleTokenError");
    expect(live).toContain("ForecastPublishStaleTokenError");
    expect(live).toContain("CANARY_ALLOWLIST_MISS");
    expect(live).toContain("CANARY_ALLOWLIST_REVOKED");
    expect(live).toContain("AUTHENTICITY_CLASS_INSUFFICIENT");
    expect(live).toContain("db_rpc_fresh_reader_v1");
    expect(live).toContain("productionEligibilityAttestation: null");
    expect(live).toContain('forecastAgePolicy: "unapproved"');
    expect(live).toContain('algorithmPinPolicy: "unapproved"');
    expect(live).not.toContain("m7Eligible: true");
    expect(live).not.toContain('decisionState: "production_eligible"');
  });

  it("forbids hosted execution paths, CLI mutate ops, workers, and cron wiring", () => {
    const live = source(LIVE_FILE);
    const support = source(SUPPORT_FILE);

    for (const text of [live, support]) {
      expect(text).not.toMatch(/supabase\s+link\b/);
      expect(text).not.toMatch(/\bsupabase\s+db\s+push\b/);
      expect(text).not.toMatch(/\bsupabase\s+db\s+reset\b/);
      expect(text).not.toMatch(/\bsupabase\s+migration\b|\bdb migrate\b/);
      expect(text).not.toContain("qlsqminsfdntpqdkhxjx.supabase.co");
      expect(text).not.toContain("METRIC_RECOMPUTE_WORKER_ENABLED=1");
      expect(text).not.toContain("METRIC_ROLLOVER_WORKER_ENABLED=1");
      expect(text).not.toMatch(/npx\s+supabase\s+status/);
      expect(text).not.toMatch(/execFile(?:Async)?\(\s*["']npx["']/);
    }

    expect(support).toContain("Supabase CLI fallback is forbidden");
    expect(support).toContain("assertPe1b4PinnedApiUrl");
    expect(support).toContain("M56E4_HOSTED_SUPABASE_URL is NOT consumed");
    expect(support).not.toMatch(
      /throw new Error\(\s*["']PE1\.b\.4b refuses M56E4_HOSTED_SUPABASE_URL/,
    );
    // Client factory is the only createSupabaseAdminClient call site; every
    // live test invokes ensurePe1b4LocalSupabaseEnv() immediately before it.
    expect(live.match(/createSupabaseAdminClient\(/g)?.length).toBe(1);
    expect(live).toMatch(
      /ensurePe1b4LocalSupabaseEnv\(\);\s*\n\s*const client = adminClient\(\)/,
    );
    expect(fs.existsSync(path.join(ROOT, "vercel.json"))).toBe(false);
  });

  it("ignores unrelated M56E4_HOSTED_SUPABASE_URL when effective API/DB stay pinned local", () => {
    const support = source(SUPPORT_FILE);
    expect(support).toContain("Does not treat M56E4_HOSTED_SUPABASE_URL");
    expect(support).toContain("Never copy M56E4_HOSTED_* into these slots");

    const keys = [
      "M56E4_HOSTED_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "DATABASE_URL",
      "DIRECT_URL",
      "SUPABASE_URL",
    ] as const;
    const prior: Record<string, string | undefined> = {};
    for (const key of keys) {
      prior[key] = process.env[key];
    }

    try {
      process.env.M56E4_HOSTED_SUPABASE_URL =
        "https://qlsqminsfdntpqdkhxjx.supabase.co";
      process.env.NEXT_PUBLIC_SUPABASE_URL = M6_PE1B4_PINNED_API_URL;
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "pe1b4-test-publishable";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "pe1b4-test-service-role-key";
      delete process.env.DATABASE_URL;
      delete process.env.DIRECT_URL;
      delete process.env.SUPABASE_URL;

      expect(() => ensurePe1b4LocalSupabaseEnv()).not.toThrow();
      expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe(M6_PE1B4_PINNED_API_URL);
      expect(process.env.NEXT_PUBLIC_SUPABASE_URL).not.toContain("supabase.co");
    } finally {
      for (const key of keys) {
        const value = prior[key];
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  });

  it("still fails closed when the effective API URL is hosted", () => {
    expect(() =>
      assertPe1b4PinnedApiUrl("https://qlsqminsfdntpqdkhxjx.supabase.co"),
    ).toThrow(/remote marker|refuse/i);

    const keys = [
      "M56E4_HOSTED_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "DATABASE_URL",
      "DIRECT_URL",
      "SUPABASE_URL",
    ] as const;
    const prior: Record<string, string | undefined> = {};
    for (const key of keys) {
      prior[key] = process.env[key];
    }

    try {
      delete process.env.M56E4_HOSTED_SUPABASE_URL;
      process.env.NEXT_PUBLIC_SUPABASE_URL =
        "https://qlsqminsfdntpqdkhxjx.supabase.co";
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "pe1b4-test-publishable";
      process.env.SUPABASE_SERVICE_ROLE_KEY = "pe1b4-test-service-role-key";
      delete process.env.DATABASE_URL;
      delete process.env.DIRECT_URL;
      delete process.env.SUPABASE_URL;

      expect(() => ensurePe1b4LocalSupabaseEnv()).toThrow(/remote marker|refuse|127\.0\.0\.1/i);
    } finally {
      for (const key of keys) {
        const value = prior[key];
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  });

  it("observes m7_eligible column values without claiming CHECK-constraint proofs", () => {
    const live = source(LIVE_FILE);
    expect(live).toContain("select m7_eligible::text");
    expect(live).not.toMatch(
      /pg_constraint|conname|sku_forecast_publications_m7_eligible_false/,
    );
    expect(live).not.toMatch(/cross-tenant RPC/i);
  });
});
