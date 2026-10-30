import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

const ROOT = process.cwd();
const MIGRATION =
  "supabase/migrations/20261030130000_m6_p2c1_forecast_sku_demand_source_snapshot.sql";
const M5_SNAPSHOT =
  "supabase/migrations/20261015130000_m5_5_source_snapshot_consistency.sql";

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

function normalized(relative: string): string {
  return read(relative).replace(/\s+/g, " ").toLowerCase();
}

describe("M6 P2c.1 forecast sku demand snapshot architecture", () => {
  it("defines one SECURITY DEFINER service_role RPC with empty search_path", () => {
    const source = read(MIGRATION);
    const sql = normalized(MIGRATION);

    expect(source).toContain(
      "create or replace function public.forecast_sku_demand_source_snapshot(",
    );
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(source).toContain(
      "grant execute\non function public.forecast_sku_demand_source_snapshot",
    );
    expect(source).toContain("to service_role");
    expect(source).toContain(
      "from public, anon, authenticated",
    );
  });

  it("bounds runtime without global SHARE locks; keeps single-statement assembly", () => {
    const source = read(MIGRATION);
    const m5 = read(M5_SNAPSHOT);

    expect(source).toContain("statement_timeout");
    expect(source).toContain("'15s'");
    expect(source).toContain("lock_timeout");
    expect(source).toContain("'2s'");
    expect(source.toLowerCase()).not.toContain("lock table");
    expect(source.toLowerCase()).not.toContain("in share mode");
    expect(source.toLowerCase()).not.toContain("pg_advisory");
    expect(source).toMatch(/One SQL statement|one SQL statement/i);
    expect(source).toMatch(/Publication freshness boundary/i);
    expect(m5).toContain("sku_daily_metric_source_snapshot");
    expect(source).not.toContain("create or replace function public.sku_daily_metric");
  });

  it("fences completeness with pending corrections and rejects trustedCompleteDates", () => {
    const source = read(MIGRATION);

    expect(source).toContain("forecast_coverage_has_pending_corrections");
    expect(source).toContain("pendingCorrection");
    expect(source).toContain("pendingCorrections");
    expect(source).toContain("sourceToken");
    expect(source).not.toMatch(/['"]trustedCompleteDates['"]/);
    expect(source).toMatch(/No trustedCompleteDates/i);
    expect(source).toMatch(/does NOT prove freshness|outside the token/i);
    expect(source).toContain("invalid_iana_timezone");
    expect(source).toContain("lookbackDays must be an integer from 1 to 365");
  });

  it("fails closed when outbox/fence capability is missing", () => {
    const source = read(MIGRATION);

    expect(source).toContain("forecast_coverage_correction_events");
    expect(source).toContain("to_regclass");
    expect(source).toContain(
      "requires correction outbox and fence helpers",
    );
  });
});
