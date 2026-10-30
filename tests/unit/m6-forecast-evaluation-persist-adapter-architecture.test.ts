import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

const ROOT = process.cwd();
const FILE = "lib/persistence/persist-forecast-evaluation.ts";

function source(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

describe("M6 P4c.2 forecast evaluation persist adapter architecture", () => {
  it("is server-only and writes only through the evaluation persist RPC", () => {
    const text = source(FILE);

    expect(text.startsWith('import "server-only"')).toBe(true);
    expect(text).toContain(
      'const RPC_NAME = "persist_forecast_evaluation_result"',
    );
    expect(text).toContain("client.rpc(RPC_NAME");
    expect(text).not.toMatch(/\.from\(/);
    expect(text).not.toMatch(
      /\.(select|insert|update|delete)\(\s*['"`]/,
    );
    expect(text).not.toContain("create table");
    expect(text).not.toContain(".from(\"forecast_evaluation");
  });

  it("gates scored persistence on P4b integrity and runs P4a harness locally", () => {
    const text = source(FILE);

    expect(text).toContain("HistoricalEvidenceIntegrityResult");
    expect(text).toContain("evaluateForecastBacktestHarness");
    expect(text).toContain("controlled_pit_fixture");
    expect(text).toContain("bodyHash is derived server-side");
    expect(text).toContain("FORBIDDEN_INPUT_KEYS");
    expect(text).toContain('"bodyHash"');
    expect(text).toContain('"trustedCompleteDates"');
    expect(text).toContain('"organizationId"');
  });

  it("keeps approval flags hard-false and fails closed on body conflict", () => {
    const text = source(FILE);

    expect(text).toContain("claimsProductionApproval: false");
    expect(text).toContain("claimsM7NumericEligibility: false");
    expect(text).toContain("algorithmApproved: false");
    expect(text).toContain("evaluation_idempotency_body_conflict");
    expect(text).toContain("ForecastEvaluationPersistConflictError");
    expect(text).toContain("FORECAST_EVALUATION_PERSIST_IDEMPOTENCY_BODY_CONFLICT");
    expect(text).not.toContain("@/lib/decision-engine");
    expect(text).not.toContain("forecast_sku_demand_source_snapshot");
    expect(text).not.toContain("publishForecastSkuDemand");
  });
});
