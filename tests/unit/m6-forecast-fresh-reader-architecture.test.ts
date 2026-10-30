import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

const ROOT = process.cwd();
const MIGRATION =
  "supabase/migrations/20261030160000_m6_p3d3_fresh_published_forecast_reader.sql";
const ADAPTER = "lib/persistence/read-fresh-published-sku-forecast.ts";
const PERSIST = "lib/persistence/persist-forecast-sku-demand.ts";
const PUBLISH = "lib/persistence/publish-forecast-sku-demand.ts";

function source(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

describe("M6 P3d.3 fresh published forecast reader architecture", () => {
  it("defines one SECURITY DEFINER service_role reader RPC with timeouts", () => {
    const sql = source(MIGRATION);

    expect(sql).toContain(
      "create or replace function public.read_fresh_published_sku_forecast(",
    );
    expect(sql.toLowerCase()).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("statement_timeout");
    expect(sql).toContain("lock_timeout");
    expect(sql).toContain("for share");
    expect(sql.toLowerCase()).not.toContain("lock table");
    expect(sql.toLowerCase()).not.toContain("in share mode");
    expect(sql).toContain("forecast_sku_demand_source_snapshot(");
    expect(sql).toContain("grant execute");
    expect(sql).toContain("to service_role");
    expect(sql).toContain("from public, anon, authenticated");
  });

  it("encodes typed miss/eligible dispositions and freshness limits", () => {
    const sql = source(MIGRATION);

    expect(sql).toContain("'ABSENT'");
    expect(sql).toContain("'STALE'");
    expect(sql).toContain("'PENDING_CORRECTION'");
    expect(sql).toContain("'FORECAST_UNAVAILABLE'");
    expect(sql).toContain("'FORECAST_CONFIDENCE_LOW'");
    expect(sql).toContain("'eligible'");
    expect(sql).toContain("'m7NumericEligible'");
    expect(sql).toContain("claimsPostCommitFreshness");
    expect(sql).toMatch(/forecast age/i);
    expect(sql).toContain("Never falls back");
  });

  it("keeps the TS adapter server-only, RPC-only, and detached from M7/persist/publish", () => {
    const text = source(ADAPTER);
    const persist = source(PERSIST);
    const publish = source(PUBLISH);

    expect(text.startsWith('import "server-only"')).toBe(true);
    expect(text).toContain(
      'const RPC_NAME = "read_fresh_published_sku_forecast"',
    );
    expect(text).toContain("client.rpc(RPC_NAME");
    expect(text).not.toMatch(/\.insert\(/);
    expect(text).not.toMatch(/\.update\(/);
    expect(text).not.toMatch(/\.delete\(/);
    expect(text).not.toContain("publishForecastSkuDemand");
    expect(text).not.toContain("persistForecastSkuDemand");
    expect(text).not.toContain("@/lib/decision-engine");
    expect(text).toContain("FORBIDDEN_INPUT_KEYS");
    expect(text).toContain('"forecastExpectedDemandUnits"');
    expect(persist).not.toContain("readFreshPublishedSkuForecast");
    expect(publish).not.toContain("readFreshPublishedSkuForecast");
  });
});
