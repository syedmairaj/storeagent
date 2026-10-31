import {
  describe,
  expect,
  it,
} from "vitest";

import {
  demoActionShowsRecommendedQuantity,
  getM7DecisionDemoFixtureRoot,
  loadM7DecisionDemoDataset,
  M7_DEMO_ATTESTATION,
  type M7DecisionDemoFixtureRoot,
} from "@/lib/demo/m7-decision-demo-fixtures";

import {
  formatDemoDataQualityScore,
  formatDemoUnknownNumber,
} from "@/lib/demo/m7-decision-demo-format";

describe("M7.4b decision demo fixtures", () => {
  it("attests synthetic demonstration provenance", () => {
    const root = getM7DecisionDemoFixtureRoot();

    expect(root.demoAttestation).toBe(M7_DEMO_ATTESTATION);
    expect(
      loadM7DecisionDemoDataset(root).ok,
    ).toBe(true);
  });

  it("fail-closes when attestation is missing", () => {
    const root = getM7DecisionDemoFixtureRoot();
    const tampered = {
      ...root,
      demoAttestation: "not-attested",
    } as unknown as M7DecisionDemoFixtureRoot;

    const loaded = loadM7DecisionDemoDataset(tampered);

    expect(loaded.ok).toBe(false);
    if (!loaded.ok) {
      expect(loaded.reason).toBe("missing_attestation");
    }
  });

  it("covers REORDER, REDUCE, PROMOTE, WATCH and HEALTHY skim", () => {
    const root = getM7DecisionDemoFixtureRoot();
    const types = new Set(
      root.actions.map((action) => action.actionType),
    );

    expect(types.has("REORDER")).toBe(true);
    expect(types.has("REDUCE")).toBe(true);
    expect(types.has("PROMOTE")).toBe(true);
    expect(types.has("WATCH")).toBe(true);
    expect(root.healthySkim.length).toBeGreaterThanOrEqual(1);
  });

  it("shows recommended quantity only for grounded REORDER fixtures", () => {
    const root = getM7DecisionDemoFixtureRoot();

    for (const action of root.actions) {
      if (action.actionType === "REORDER") {
        expect(
          demoActionShowsRecommendedQuantity(action),
        ).toBe(true);
        expect(action.recommendedQuantity).toBeGreaterThan(0);
      } else {
        expect(
          demoActionShowsRecommendedQuantity(action),
        ).toBe(false);
        expect(action.recommendedQuantity).toBeNull();
      }
    }
  });

  it("requires WATCH reason codes and includes unknown-prone evidence", () => {
    const root = getM7DecisionDemoFixtureRoot();
    const watchActions = root.actions.filter(
      (action) => action.actionType === "WATCH",
    );

    expect(watchActions.length).toBeGreaterThanOrEqual(1);

    for (const action of watchActions) {
      expect(action.evidence.reasonCodes.length).toBeGreaterThanOrEqual(1);
    }

    const hasNullEvidence = watchActions.some(
      (action) =>
        action.evidence.availableQuantity === null ||
        action.evidence.incomingQuantity === null ||
        action.evidence.demandVelocity === null ||
        action.evidence.daysOfStock === null,
    );

    expect(hasNullEvidence).toBe(true);
  });

  it("formats null evidence as Unknown, never zero", () => {
    expect(formatDemoUnknownNumber(null)).toBe("Unknown");
    expect(formatDemoUnknownNumber(undefined)).toBe("Unknown");
    expect(formatDemoUnknownNumber(Number.NaN)).toBe("Unknown");
    expect(formatDemoUnknownNumber(0)).toBe("0");
    expect(
      formatDemoUnknownNumber(2.4, {
        digits: 1,
        suffix: "/day",
      }),
    ).toBe("2.4/day");
    expect(formatDemoDataQualityScore(null)).toBe("Unknown");
    expect(formatDemoDataQualityScore(0.92)).toBe("92%");
  });

  it("never invents live money, MOQ, or buying fields on fixtures", () => {
    const source = JSON.stringify(getM7DecisionDemoFixtureRoot());

    for (const forbidden of [
      "estimatedCashAtRisk",
      "estimatedRevenueAtRisk",
      "MOQ",
      "supplierQuote",
      "preventedStockout",
      "purchaseOrder",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });
});
