import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

const ROOT = process.cwd();
const FILE = "lib/forecasting/merchant-attestation.ts";

function source(): string {
  return fs.readFileSync(path.join(ROOT, FILE), "utf8");
}

describe("M6 P2b.2c.1 merchant attestation architecture", () => {
  it("is server-only and routes through merchant persistence only", () => {
    const text = source();

    expect(text.startsWith('import "server-only"')).toBe(true);
    expect(text).toContain("createForecastEvidencePersistence");
    expect(text).toContain("issueMerchantAttestationPromotion");
    expect(text).toContain("issueMerchantAttestationCoverage");
    expect(text).toContain("invalidateCoverageWithMerchant");
    expect(text).toContain("bindMerchantAttestationTenant");
    expect(text).toContain("AuthenticatedIdentity");
  });

  it("forbids client trust/actor/org/closure and production trustedCompleteDates", () => {
    const text = source();

    expect(text).toContain("FORBIDDEN_COMMAND_KEYS");
    expect(text).toContain('"trust"');
    expect(text).toContain('"actorUserId"');
    expect(text).toContain('"organizationId"');
    expect(text).toContain('"closureId"');
    expect(text).toContain('"trustedCompleteDates"');
    expect(text).toContain('"discountAmount"');
    expect(text).toContain('"syncRunStatus"');
    expect(text).not.toContain("p_trust");
    expect(text).not.toContain("p_closure_id");
    expect(text).not.toMatch(/\.from\(/);
  });

  it("keeps complete as explicit merchant confirmation, not provider/sync closure", () => {
    const text = source();

    expect(text).toContain("confirmDayStreamClosed");
    expect(text).toContain("assertDayStreamClosed");
    expect(text).toMatch(/merchant-attested/i);
    expect(text).not.toContain("issueTrustedProvider");
    expect(text).not.toContain("csv_complete_sync_run");
    expect(text).not.toContain("@/lib/decision-engine");
    expect(text).not.toContain("calculateSalesVelocity");
  });

  it("does not add an HTTP route in this slice", () => {
    const text = source();

    expect(text).not.toContain("NextRequest");
    expect(text).not.toContain("NextResponse");
    expect(text).not.toContain("app/api");

    const routeHits = fs
      .readdirSync(path.join(ROOT, "app"), { recursive: true })
      .map(String)
      .filter((entry) => entry.includes("merchant-attestation"));

    expect(routeHits).toEqual([]);
  });
});
