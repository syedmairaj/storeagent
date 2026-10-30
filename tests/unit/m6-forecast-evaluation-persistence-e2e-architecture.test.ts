import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

const ROOT = process.cwd();
const E2E =
  "tests/unit/m6-forecast-evaluation-persistence-e2e.live.test.ts";
const ADAPTER = "lib/persistence/persist-forecast-evaluation.ts";

function source(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

describe("M6 P4c.3 evaluation persistence E2E architecture", () => {
  it("wires P4b → P4a → adapter → SQL RPC without live canonical replay", () => {
    const e2e = source(E2E);
    const adapter = source(ADAPTER);

    expect(e2e).toContain("validateHistoricalEvidenceIntegrity");
    expect(e2e).toContain("persistForecastEvaluation");
    expect(e2e).toContain("persist_forecast_evaluation_result");
    expect(e2e).toContain("controlled_pit_fixture");
    expect(e2e).toContain("UNSUPPORTED_HISTORICAL_REPLAY");
    expect(e2e).toContain("INVALID_HISTORY");
    expect(e2e).toContain("EVALUATION_IDEMPOTENCY_BODY_CONFLICT");
    expect(e2e).not.toContain("forecast_sku_demand_source_snapshot");
    expect(e2e).not.toContain("trustedCompleteDates");
    expect(e2e).not.toContain("publishForecastSkuDemand");

    expect(adapter).toContain('RPC_NAME = "persist_forecast_evaluation_result"');
    expect(adapter).toContain('"trustedCompleteDates"');
    expect(adapter).not.toContain("forecast_sku_demand_source_snapshot");
  });

  it("asserts SQL JSON trust flags and scored model trio in the E2E gate", () => {
    const e2e = source(E2E);

    expect(e2e).toContain("claimsProductionApproval");
    expect(e2e).toContain("claimsM7NumericEligibility");
    expect(e2e).toContain("algorithmApproved");
    expect(e2e).toContain("candidate,naive_lag1,zero");
    expect(e2e).toContain("ZERO_TOTAL_ACTUAL_DEMAND");
    expect(e2e).toContain("MASE_DENOMINATOR_ZERO");
    expect(e2e).toContain("lastRaw");
  });
});
