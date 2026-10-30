import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

const ROOT = process.cwd();
const MIGRATION =
  "supabase/migrations/20261030140000_m6_p3b_forecast_persistence.sql";
const SNAPSHOT_MIGRATION =
  "supabase/migrations/20261030130000_m6_p2c1_forecast_sku_demand_source_snapshot.sql";

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

function normalized(relative: string): string {
  return read(relative).replace(/\s+/g, " ").toLowerCase();
}

describe("M6 P3b forecast persistence architecture", () => {
  it("adds forecast_runs + sku_forecasts with completed-only and 1:1 grain", () => {
    const source = read(MIGRATION);
    const sql = normalized(MIGRATION);

    expect(source).toContain("create table public.forecast_runs");
    expect(source).toContain("create table public.sku_forecasts");
    expect(source).toContain("constraint forecast_runs_status_check");
    expect(sql).toContain("check (status = 'completed')");
    expect(source).toContain("forecast_run_id uuid not null");
    expect(source).toContain("unique,");
    expect(source).toContain("forecast_runs_idempotency_uidx");
    expect(source).toContain("source_token");
    expect(source).toContain("reproducibility_fingerprint");
    expect(source).toContain("classified_days");
    expect(source).toContain("daily_demand numeric null");
  });

  it("blocks historical mutation and denies direct client/service_role DML", () => {
    const source = read(MIGRATION);

    expect(source).toContain("prevent_forecast_persistence_mutation");
    expect(source).toContain("before update or delete on public.forecast_runs");
    expect(source).toContain("before update or delete on public.sku_forecasts");
    expect(source).toContain(
      "revoke all\non table public.forecast_runs\nfrom public, anon, authenticated, service_role",
    );
    expect(source).toContain(
      "revoke all\non table public.sku_forecasts\nfrom public, anon, authenticated, service_role",
    );
    expect(source).toContain("grant select\non table public.forecast_runs");
    expect(source).toContain("forecast_runs_select_member");
    expect(source).toContain("sku_forecasts_select_member");
  });

  it("defines SECURITY DEFINER service_role persist RPC with empty search_path", () => {
    const source = read(MIGRATION);
    const sql = normalized(MIGRATION);

    expect(source).toContain(
      "create or replace function public.persist_forecast_sku_demand_result(",
    );
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(source).toContain(
      "grant execute\non function public.persist_forecast_sku_demand_result",
    );
    expect(source).toContain("to service_role");
    expect(source).toContain("from public, anon, authenticated");
  });

  it("revalidates sourceToken inside the same persist transaction before insert", () => {
    const source = read(MIGRATION);
    const snapshot = read(SNAPSHOT_MIGRATION);

    expect(source).toContain("forecast_sku_demand_source_snapshot(");
    expect(source).toContain("STALE_SOURCE_TOKEN");
    expect(source).toContain("In-TX sourceToken revalidation");
    expect(source).toContain("same transaction as insert");
    expect(source).toContain("persistClaimsPostCommitFreshness");
    expect(source).toMatch(/do NOT prove permanent freshness|P3d publication/i);
    expect(source.toLowerCase()).not.toContain("lock table");
    expect(source.toLowerCase()).not.toContain("in share mode");
    expect(source.toLowerCase()).not.toContain("pg_advisory");
    expect(snapshot).toContain("forecast_sku_demand_source_snapshot");
    expect(source).toContain("rejects trustedCompleteDates");
    expect(source).not.toMatch(/jsonb_build_object\([^)]*trustedCompleteDates/);
    expect(normalized(MIGRATION)).not.toContain(
      "create table public.ci_forecast",
    );
  });

  it("validates org/store/location/variant independently and enforces idempotency", () => {
    const source = read(MIGRATION);

    expect(source).toContain("scope error: store");
    expect(source).toContain("scope error: location");
    expect(source).toContain("scope error: variant");
    expect(source).toContain("payload grain does not match authorized scope");
    expect(source).toContain("IDEMPOTENCY_BODY_CONFLICT");
    expect(source).toContain("'replayed'");
    expect(source).toContain("'created'");
    expect(source).toMatch(/Nullable\/withheld demand|never invented/i);
    expect(source).not.toMatch(/current_pointer|is_current|published_at/i);
    expect(source).not.toContain("create table public.forecast_publications");
  });
});
