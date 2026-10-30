import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

const ROOT = process.cwd();
const FILE = "lib/persistence/load-forecast-sku-demand.ts";

function source(): string {
  return fs.readFileSync(path.join(ROOT, FILE), "utf8");
}

describe("M6 P2c.2 forecast sku demand loader architecture", () => {
  it("is server-only and calls exactly one snapshot RPC", () => {
    const text = source();

    expect(text.startsWith('import "server-only"')).toBe(true);
    expect(text).toContain("forecast_sku_demand_source_snapshot");
    expect(text).toMatch(/const RPC_NAME = "forecast_sku_demand_source_snapshot"/);
    expect(text).toContain("client.rpc(RPC_NAME");
    expect(text).not.toMatch(/\.from\(/);
    expect(text).not.toMatch(/\.(select|insert|update|delete)\(/);
  });

  it("reuses commerce-facts and orchestrator without trustedCompleteDates", () => {
    const text = source();

    expect(text).toContain("buildForecastSkuDemandInput");
    expect(text).toContain("forecastSkuDemand");
    expect(text).toContain("trustedCompleteDatesUsed: false");
    expect(text).toContain("pendingCorrectionFenceApplied: true");
    expect(text).toMatch(/must not include trustedCompleteDates/i);
    expect(text).toContain("coverageEvidence: fencedCoverage");
    expect(text).not.toMatch(/trustedCompleteDates\s*:/);
    expect(text).toMatch(/does not prove currency after the transaction/i);
  });

  it("rejects client identity overrides and maps timeout SQLSTATEs", () => {
    const text = source();

    expect(text).toContain("FORBIDDEN_INPUT_KEYS");
    expect(text).toContain('"organizationId"');
    expect(text).toContain('"storeId"');
    expect(text).toContain("TenantContext");
    expect(text).toContain("55P03");
    expect(text).toContain("57014");
    expect(text).not.toContain("@/lib/decision-engine");
    expect(text).not.toContain("calculateSalesVelocity");
  });
});
