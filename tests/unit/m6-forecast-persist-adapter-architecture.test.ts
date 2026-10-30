import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

const ROOT = process.cwd();
const FILE = "lib/persistence/persist-forecast-sku-demand.ts";
const LOADER = "lib/persistence/load-forecast-sku-demand.ts";

function source(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

describe("M6 P3c forecast persist adapter architecture", () => {
  it("is server-only and writes only through the persist RPC", () => {
    const text = source(FILE);

    expect(text.startsWith('import "server-only"')).toBe(true);
    expect(text).toContain('const RPC_NAME = "persist_forecast_sku_demand_result"');
    expect(text).toContain("client.rpc(RPC_NAME");
    expect(text).not.toMatch(/\.from\(/);
    expect(text).not.toMatch(/\.(select|insert|update|delete)\(/);
    expect(text).not.toContain("create table");
  });

  it("loads through loadForecastSkuDemand only and does not recalculate independently", () => {
    const text = source(FILE);
    const loader = source(LOADER);

    expect(text).toContain('from "@/lib/persistence/load-forecast-sku-demand"');
    expect(text).toContain("loadForecastSkuDemand(");
    expect(text).not.toContain("forecastSkuDemand(");
    expect(text).not.toContain("buildForecastSkuDemandInput");
    expect(loader).toContain("forecastSkuDemand");
    expect(text).toContain("persistLoadedForecastSkuDemand");
  });

  it("keeps results historical-only and fails closed on stale/conflict", () => {
    const text = source(FILE);

    expect(text).toContain("published: false");
    expect(text).toContain("m7Eligible: false");
    expect(text).toContain("persistClaimsPostCommitFreshness: false");
    expect(text).toContain("historicalOnly: true");
    expect(text).toContain("STALE_SOURCE_TOKEN");
    expect(text).toContain("IDEMPOTENCY_BODY_CONFLICT");
    expect(text).toContain("never silently retries a stale load");
    expect(text).toContain("FORBIDDEN_INPUT_KEYS");
    expect(text).toContain('"trustedCompleteDates"');
    expect(text).toContain('"confidenceIntervals"');
    expect(text).not.toContain("@/lib/decision-engine");
    expect(text).not.toContain("calculateSalesVelocity");
  });
});
