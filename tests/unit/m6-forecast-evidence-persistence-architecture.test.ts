import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

const ROOT = process.cwd();
const FILE = "lib/persistence/forecast-evidence.ts";

function source(): string {
  return fs.readFileSync(path.join(ROOT, FILE), "utf8");
}

describe("M6 P2b.2b.3 forecast evidence persistence architecture", () => {
  it("is server-only and routes through the five evidence RPCs", () => {
    const text = source();

    expect(text.startsWith('import "server-only"')).toBe(true);
    expect(text).toContain("issue_trusted_provider_promotion_evidence");
    expect(text).toContain(
      "issue_merchant_attestation_promotion_evidence",
    );
    expect(text).toContain("issue_trusted_provider_coverage_evidence");
    expect(text).toContain(
      "issue_merchant_attestation_coverage_evidence",
    );
    expect(text).toContain("invalidate_forecast_day_coverage_evidence");
  });

  it("never accepts trust/closure_id overrides or writes tables directly", () => {
    const text = source();

    expect(text).toContain("FORBIDDEN_PAYLOAD_KEYS");
    expect(text).toContain('"closureId"');
    expect(text).toContain('"trust"');
    expect(text).not.toMatch(/\.from\(/);
    expect(text).not.toMatch(/insert\(|update\(|delete\(/i);
    expect(text).not.toContain("p_trust");
    expect(text).not.toContain("p_closure_id");
  });

  it("keeps provider complete fail-closed and merchant attestation distinct", () => {
    const text = source();

    expect(text).toMatch(
      /no authoritative day\/stream closure source/i,
    );
    expect(text).toContain("p_assert_day_stream_closed");
    expect(text).toContain("verified_merchant_attestation");
    expect(text).toContain("trusted_provider");
    expect(text).not.toContain("@/lib/decision-engine");
    expect(text).not.toContain("calculateSalesVelocity");
  });
});
