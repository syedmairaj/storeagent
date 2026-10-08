import {
  describe,
  expect,
  it,
} from "vitest";

import {
  buildDecisionReproducibilityFingerprint,
  DECISION_ALGORITHM_VERSIONS_V1,
} from "@/lib/decision-engine/reproducibility";

const descriptor = {
  algorithmVersions:
    DECISION_ALGORITHM_VERSIONS_V1,
  configurationVersion:
    "decision-config-v1",
};

describe("decision reproducibility", () => {
  it("produces identical fingerprint for identical inputs", () => {
    const input = {
      availableQuantity: 10,
      demandVelocity: 4,
      stockoutRisk: "high",
    };

    const a =
      buildDecisionReproducibilityFingerprint(
        descriptor,
        input,
      );

    const b =
      buildDecisionReproducibilityFingerprint(
        descriptor,
        input,
      );

    expect(a.fingerprint).toBe(
      b.fingerprint,
    );
  });

  it("is stable across object property order", () => {
    const a =
      buildDecisionReproducibilityFingerprint(
        descriptor,
        {
          availableQuantity: 10,
          demandVelocity: 4,
        },
      );

    const b =
      buildDecisionReproducibilityFingerprint(
        descriptor,
        {
          demandVelocity: 4,
          availableQuantity: 10,
        },
      );

    expect(a.fingerprint).toBe(
      b.fingerprint,
    );
  });

  it("changes when canonical decision input changes", () => {
    const a =
      buildDecisionReproducibilityFingerprint(
        descriptor,
        {
          availableQuantity: 10,
        },
      );

    const b =
      buildDecisionReproducibilityFingerprint(
        descriptor,
        {
          availableQuantity: 11,
        },
      );

    expect(a.fingerprint).not.toBe(
      b.fingerprint,
    );
  });

  it("changes when decision configuration changes", () => {
    const a =
      buildDecisionReproducibilityFingerprint(
        descriptor,
        {
          availableQuantity: 10,
        },
      );

    const b =
      buildDecisionReproducibilityFingerprint(
        {
          ...descriptor,
          configurationVersion:
            "decision-config-v2",
        },
        {
          availableQuantity: 10,
        },
      );

    expect(a.fingerprint).not.toBe(
      b.fingerprint,
    );
  });

  it("preserves explicit algorithm versions", () => {
    expect(
      DECISION_ALGORITHM_VERSIONS_V1,
    ).toEqual({
      reorder: "reorder-rule-v1",
      reduce: "reduce-rule-v1",
      promote: "promote-rule-v1",
      watchHealthy:
        "watch-healthy-rule-v1",
      conflict:
        "decision-conflict-v1",
      primaryAction:
        "primary-action-v1",
      priority:
        "decision-priority-v1",
      confidence:
        "decision-confidence-v1",
    });
  });

  it("requires explicit configuration version", () => {
    expect(() =>
      buildDecisionReproducibilityFingerprint(
        {
          ...descriptor,
          configurationVersion: "",
        },
        {},
      ),
    ).toThrow(
      "configurationVersion is required.",
    );
  });
});
