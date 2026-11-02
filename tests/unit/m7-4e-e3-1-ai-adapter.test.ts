import {
  describe,
  expect,
  it,
} from "vitest";

import {
  buildDeterministicFallbackBrief,
  composeDemoDecisionBrief,
  mapDemoActionToGrounding,
  type DecisionBriefGroundingInput,
} from "@/lib/decision-brief";

import {
  AI_EXPLANATION_ADAPTER_CONTRACT_VERSION,
  DECISION_BRIEF_GROUNDING_HASH_VERSION,
  E3_1_FORCE_DETERMINISTIC_FALLBACK,
  GROUNDING_HASH_PREFIX,
  buildDeterministicGroundingEnvelope,
  canonicalSerialize,
  compareCanonicalKeys,
  computeGroundingHash,
  createOfflineStubAdapter,
  disabledAiExplanationOptions,
  explainDecisionBriefFromGrounding,
  testInjectedAiExplanationOptions,
  validateAiExplanationCandidate,
  validateCandidateClaimNesting,
} from "@/lib/decision-brief/ai";

import {
  getM7DecisionDemoFixtureRoot,
  type DemoActionItem,
} from "@/lib/demo/m7-decision-demo-fixtures";

const GENERATED_AT =
  "2026-11-02T12:00:00.000Z";

function fixtureAction(
  actionType: DemoActionItem["actionType"],
): DemoActionItem {
  const action =
    getM7DecisionDemoFixtureRoot().actions.find(
      (item) =>
        item.actionType === actionType,
    );

  if (
    !action
  ) {
    throw new Error(
      `Missing fixture action ${actionType}`,
    );
  }

  return action;
}

function trustedGrounding(
  actionType: DemoActionItem["actionType"] = "REORDER",
): {
  action: DemoActionItem;
  grounding: DecisionBriefGroundingInput;
} {
  const action =
    fixtureAction(
      actionType,
    );
  const root =
    getM7DecisionDemoFixtureRoot();
  const trusted =
    root.actions.find(
      (item) =>
        item.id === action.id,
    );

  if (
    !trusted
  ) {
    throw new Error(
      "Trusted fixture row missing",
    );
  }

  return {
    action: trusted,
    grounding: mapDemoActionToGrounding(
      trusted,
      {
        organizationId: "org-demo-chrome",
        trustedDemoAttestation:
          root.demoAttestation,
      },
    ),
  };
}

/**
 * Fully controlled hash fixture — must not depend on mutable demo rows.
 * Pinned digest below is normative for decision-brief-grounding-hash-v1.
 */
function pinnedHashGrounding(): DecisionBriefGroundingInput {
  return {
    schemaVersion: "decision-brief-v1",
    briefMode: "synthetic_demo",
    organizationId: null,
    storeId: null,
    locationId: null,
    variantId: null,
    productTitle: "Pin Product",
    variantTitle: "Pin Variant",
    actionType: "WATCH",
    priority: "medium",
    confidence: "low",
    recommendedQuantity: {
      state: "not_applicable",
      reasonCode:
        "quantity_not_applicable_for_action_type",
    },
    recommendedActionDate: {
      state: "unknown",
    },
    reasonCodes: [
      "signal_conflict",
      "incomplete_evidence",
    ],
    confidenceReasonCodes: [
      "low_confidence",
    ],
    evidence: {
      availableQuantity: {
        state: "known",
        value: 0,
      },
      incomingQuantity: {
        state: "known",
        value: 0,
      },
      demandVelocity: {
        state: "unknown",
      },
      daysOfStock: {
        state: "unknown",
      },
      leadTimeDays: {
        state: "unknown",
      },
      safetyStockUnits: {
        state: "unknown",
      },
      reorderPointUnits: {
        state: "unknown",
      },
      targetStockUnits: {
        state: "unknown",
      },
      inventoryAgeDays: {
        state: "unknown",
      },
      forecastExpectedDemandUnits: {
        state: "unknown",
      },
      dataQualityScore: {
        state: "unknown",
      },
    },
    decisionAsOf: {
      state: "unknown",
    },
    pinnedTimeZone: {
      state: "unknown",
    },
    evidenceSourceTimestamps: {
      inventoryObservationAt: {
        state: "unknown",
      },
      metricsComputedAt: {
        state: "unknown",
      },
      forecastAsOf: {
        state: "unknown",
      },
    },
    freshness: {
      status: "unknown",
      staleReasonCodes: [],
    },
    demoAttestation:
      "m7-synthetic-demonstration-v1",
    trustClaims: {
      claimsMerchantFacing: false,
      claimsM7ProductionEligibility: false,
      algorithmApproved: false,
      isScoredMerchantDecision: false,
      claimsProductionForecastApproval: false,
      evidenceScope: "synthetic_demonstration",
    },
  };
}

const PINNED_GROUNDING_HASH_V1 =
  "sha256:622e4e75db997ea290cba712d2cf8de1aace886e840bd615e196c23c9a366501";

describe("M7.4e E3.1 grounding hash", () => {
  it("pins decision-brief-grounding-hash-v1 with sha256: prefix and stable digest", () => {
    const {
      grounding,
    } =
      trustedGrounding(
        "REORDER",
      );

    const hashA =
      computeGroundingHash(
        grounding,
      );
    const hashB =
      computeGroundingHash(
        structuredClone(
          grounding,
        ),
      );

    expect(
      hashA.startsWith(
        GROUNDING_HASH_PREFIX,
      ),
    ).toBe(true);
    expect(
      hashA.length,
    ).toBe(
      GROUNDING_HASH_PREFIX.length + 64,
    );
    expect(
      hashA,
    ).toBe(
      hashB,
    );
    expect(
      DECISION_BRIEF_GROUNDING_HASH_VERSION,
    ).toBe(
      "decision-brief-grounding-hash-v1",
    );

    const envelope =
      buildDeterministicGroundingEnvelope(
        grounding,
        {
          briefId: "brief-hash",
        },
      );

    expect(
      envelope.groundingHash,
    ).toBe(
      hashA,
    );
    expect(
      envelope.adapterContractVersion,
    ).toBe(
      AI_EXPLANATION_ADAPTER_CONTRACT_VERSION,
    );
  });

  it("uses deterministic code-unit key ordering and pins a golden digest", () => {
    expect(
      compareCanonicalKeys(
        "a",
        "b",
      ),
    ).toBe(
      -1,
    );
    expect(
      compareCanonicalKeys(
        "b",
        "a",
      ),
    ).toBe(
      1,
    );
    expect(
      compareCanonicalKeys(
        "a",
        "a",
      ),
    ).toBe(
      0,
    );

    expect(
      canonicalSerialize({
        b: 1,
        a: 2,
      }),
    ).toBe(
      canonicalSerialize({
        a: 2,
        b: 1,
      }),
    );
    expect(
      canonicalSerialize({
        b: 1,
        a: 2,
      }),
    ).toBe(
      '{"a":2,"b":1}',
    );

    const pinned =
      pinnedHashGrounding();
    const reorderedEvidence =
      structuredClone(
        pinned,
      );

    // Rebuild evidence object with shuffled insertion order.
    reorderedEvidence.evidence = {
      dataQualityScore:
        pinned.evidence.dataQualityScore,
      availableQuantity:
        pinned.evidence.availableQuantity,
      targetStockUnits:
        pinned.evidence.targetStockUnits,
      incomingQuantity:
        pinned.evidence.incomingQuantity,
      demandVelocity:
        pinned.evidence.demandVelocity,
      daysOfStock:
        pinned.evidence.daysOfStock,
      leadTimeDays:
        pinned.evidence.leadTimeDays,
      safetyStockUnits:
        pinned.evidence.safetyStockUnits,
      reorderPointUnits:
        pinned.evidence.reorderPointUnits,
      inventoryAgeDays:
        pinned.evidence.inventoryAgeDays,
      forecastExpectedDemandUnits:
        pinned.evidence.forecastExpectedDemandUnits,
    };

    expect(
      computeGroundingHash(
        pinned,
      ),
    ).toBe(
      PINNED_GROUNDING_HASH_V1,
    );
    expect(
      computeGroundingHash(
        reorderedEvidence,
      ),
    ).toBe(
      PINNED_GROUNDING_HASH_V1,
    );
  });

  it("changes hash when grounding commercial fields change, not when generatedAt would", () => {
    const {
      grounding,
    } =
      trustedGrounding(
        "REORDER",
      );
    const base =
      computeGroundingHash(
        grounding,
      );
    const mutated =
      structuredClone(
        grounding,
      );
    mutated.priority = "low";

    expect(
      computeGroundingHash(
        mutated,
      ),
    ).not.toBe(
      base,
    );
  });

  it("canonicalizes -0 to 0 for hash stability", () => {
    const {
      grounding,
    } =
      trustedGrounding(
        "REORDER",
      );

    if (
      grounding.evidence.availableQuantity.state !==
      "known"
    ) {
      throw new Error(
        "expected known availableQuantity",
      );
    }

    const withZero =
      structuredClone(
        grounding,
      );
    const withNegZero =
      structuredClone(
        grounding,
      );

    withZero.evidence.availableQuantity = {
      state: "known",
      value: 0,
    };
    withNegZero.evidence.availableQuantity = {
      state: "known",
      value: -0,
    };

    expect(
      computeGroundingHash(
        withZero,
      ),
    ).toBe(
      computeGroundingHash(
        withNegZero,
      ),
    );
  });
});

describe("M7.4e E3.1 flag-off E2 parity", () => {
  it("disabled_default path matches composeDemoDecisionBrief including generatedAt and controls", async () => {
    for (
      const actionType of [
        "REORDER",
        "REDUCE",
        "PROMOTE",
        "WATCH",
      ] as const
    ) {
      const {
        action,
        grounding,
      } =
        trustedGrounding(
          actionType,
        );

      const composed =
        composeDemoDecisionBrief(
          action,
          {
            role: "owner",
            generatedAt: GENERATED_AT,
            organizationId: "org-demo-chrome",
          },
        );

      expect(
        composed.ok,
        actionType,
      ).toBe(true);

      if (
        !composed.ok
      ) {
        continue;
      }

      const explained =
        await explainDecisionBriefFromGrounding(
          grounding,
          disabledAiExplanationOptions({
            briefId: action.id,
            role: "owner",
            generatedAt: GENERATED_AT,
          }),
        );

      expect(
        explained.ok,
        actionType,
      ).toBe(true);

      if (
        !explained.ok
      ) {
        continue;
      }

      expect(
        explained.brief,
      ).toEqual(
        composed.brief,
      );
      expect(
        explained.brief.generator,
      ).toBe(
        "deterministic_fallback",
      );
      expect(
        explained.brief.validationStatus,
      ).toBe(
        "accepted",
      );
      expect(
        explained.brief.generatedAt,
      ).toBe(
        GENERATED_AT,
      );
      expect(
        explained.brief.humanControls
          .productionApprovalEligible,
      ).toBe(
        false,
      );
      expect(
        explained.diagnostics.aiAttempted,
      ).toBe(
        false,
      );
    }
  });

  it("ignores client/model enablement pretenders outside test_injected", async () => {
    const {
      action,
      grounding,
    } =
      trustedGrounding(
        "REORDER",
      );
    const stub =
      createOfflineStubAdapter();

    // disabled_default must never attempt AI even if booleans look enabled.
    // (server_resolved_config is trusted in E3.3 and is covered there.)
    const result =
      await explainDecisionBriefFromGrounding(
        grounding,
        {
          briefId: action.id,
          role: "owner",
          generatedAt: GENERATED_AT,
          aiExplanationEnabled: true,
          allowlistMatch: true,
          enablementSource: "disabled_default",
          adapter: stub,
          forceDeterministicFallback:
            E3_1_FORCE_DETERMINISTIC_FALLBACK,
        },
      );

    expect(
      result.ok,
    ).toBe(true);

    if (
      !result.ok
    ) {
      return;
    }

    expect(
      result.diagnostics.aiAttempted,
    ).toBe(
      false,
    );
    expect(
      result.brief.generator,
    ).toBe(
      "deterministic_fallback",
    );
  });
});

describe("M7.4e E3.1 forceDeterministicFallback delivery", () => {
  it("discards valid-looking stub candidates and never returns ai_validated", async () => {
    const {
      action,
      grounding,
    } =
      trustedGrounding(
        "REORDER",
      );
    const stub =
      createOfflineStubAdapter({
        behavior: {
          mode: "valid_looking",
        },
      });

    const result =
      await explainDecisionBriefFromGrounding(
        grounding,
        testInjectedAiExplanationOptions({
          briefId: action.id,
          role: "owner",
          generatedAt: GENERATED_AT,
          adapter: stub,
        }),
      );

    expect(
      result.ok,
    ).toBe(true);

    if (
      !result.ok
    ) {
      return;
    }

    expect(
      result.brief.generator,
    ).toBe(
      "deterministic_fallback",
    );
    expect(
      result.brief.validationStatus,
    ).toBe(
      "accepted",
    );
    expect(
      result.brief.provenance.ai,
    ).toBeUndefined();
    expect(
      result.diagnostics.aiAttempted,
    ).toBe(
      true,
    );
    expect(
      result.diagnostics.candidateReceived,
    ).toBe(
      true,
    );
    expect(
      result.diagnostics.candidateDiscarded,
    ).toBe(
      true,
    );
    // valid_looking prose is untemplated → semantic reject; still fallback-only.
    expect(
      result.diagnostics.discardReasons,
    ).toContain(
      "AI_PROSE_SEMANTIC_VALIDATION_REJECTED",
    );

    const e2 =
      buildDeterministicFallbackBrief(
        grounding,
        {
          briefId: action.id,
          role: "owner",
          generatedAt: GENERATED_AT,
        },
      );

    expect(
      e2.ok,
    ).toBe(true);

    if (
      e2.ok
    ) {
      expect(
        result.brief,
      ).toEqual(
        e2.brief,
      );
    }
  });

  it("rejects forged trust / missing attestation before AI attempt", async () => {
    const {
      grounding,
    } =
      trustedGrounding(
        "REORDER",
      );
    const forged =
      structuredClone(
        grounding,
      );
    delete forged.demoAttestation;
    forged.trustClaims.evidenceScope =
      "production_bound";
    forged.trustClaims.claimsM7ProductionEligibility =
      true;

    const result =
      await explainDecisionBriefFromGrounding(
        forged,
        testInjectedAiExplanationOptions({
          briefId: "forged",
          role: "owner",
          generatedAt: GENERATED_AT,
          adapter: createOfflineStubAdapter(),
        }),
      );

    expect(
      result.ok,
    ).toBe(false);

    if (
      result.ok
    ) {
      return;
    }

    expect(
      result.diagnostics.aiAttempted,
    ).toBe(
      false,
    );
    expect(
      result.reasons.length,
    ).toBeGreaterThan(
      0,
    );
  });
});

describe("M7.4e E3.1 adversarial adapter outcomes", () => {
  it("fails closed on grounding hash mismatch", async () => {
    const {
      action,
      grounding,
    } =
      trustedGrounding(
        "WATCH",
      );

    const result =
      await explainDecisionBriefFromGrounding(
        grounding,
        testInjectedAiExplanationOptions({
          briefId: action.id,
          role: "owner",
          generatedAt: GENERATED_AT,
          adapter: createOfflineStubAdapter({
            behavior: {
              mode: "hash_mismatch",
            },
          }),
        }),
      );

    expect(
      result.ok,
    ).toBe(true);

    if (
      !result.ok
    ) {
      return;
    }

    expect(
      result.brief.generator,
    ).toBe(
      "deterministic_fallback",
    );
    expect(
      result.diagnostics.candidateDiscarded,
    ).toBe(
      true,
    );
    expect(
      result.diagnostics.adapterFailureReason,
    ).toBe(
      "GROUNDING_HASH_MISMATCH",
    );
  });

  it("fails closed on stub error", async () => {
    const {
      action,
      grounding,
    } =
      trustedGrounding(
        "REDUCE",
      );

    const result =
      await explainDecisionBriefFromGrounding(
        grounding,
        testInjectedAiExplanationOptions({
          briefId: action.id,
          role: "owner",
          generatedAt: GENERATED_AT,
          adapter: createOfflineStubAdapter({
            behavior: {
              mode: "error",
              reason: "AI_UNAVAILABLE",
            },
          }),
        }),
      );

    expect(
      result.ok,
    ).toBe(true);

    if (
      !result.ok
    ) {
      return;
    }

    expect(
      result.brief.generator,
    ).toBe(
      "deterministic_fallback",
    );
    expect(
      result.diagnostics.adapterFailureReason,
    ).toBe(
      "AI_UNAVAILABLE",
    );
    expect(
      result.diagnostics.discardReasons,
    ).toContain(
      "AI_UNAVAILABLE",
    );
  });

  it("fails closed on malformed nested claims without throwing", async () => {
    const {
      action,
      grounding,
    } =
      trustedGrounding(
        "REORDER",
      );

    const nesting =
      validateCandidateClaimNesting([
        {
          claimId: "bad",
          kind: "why_now_statement",
          text: null,
          evidenceRefs: "not-array",
        },
      ]);

    expect(
      nesting.ok,
    ).toBe(false);

    if (
      nesting.ok
    ) {
      return;
    }

    expect(
      nesting.reasons,
    ).toContain(
      "AI_UNSUPPORTED_SHAPE",
    );

    const result =
      await explainDecisionBriefFromGrounding(
        grounding,
        testInjectedAiExplanationOptions({
          briefId: action.id,
          role: "owner",
          generatedAt: GENERATED_AT,
          adapter: createOfflineStubAdapter({
            behavior: {
              mode: "malformed_nested_claims",
            },
          }),
        }),
      );

    expect(
      result.ok,
    ).toBe(true);

    if (
      !result.ok
    ) {
      return;
    }

    expect(
      result.brief.generator,
    ).toBe(
      "deterministic_fallback",
    );
    expect(
      result.brief.validationStatus,
    ).toBe(
      "accepted",
    );
    expect(
      result.diagnostics.candidateDiscarded,
    ).toBe(
      true,
    );
    expect(
      result.diagnostics.discardReasons,
    ).toContain(
      "AI_UNSUPPORTED_SHAPE",
    );
    expect(
      result.diagnostics.adapterFailureReason,
    ).toBe(
      "AI_UNSUPPORTED_SHAPE",
    );
  });

  it("clears deadline timer on early adapter settlement while preserving late discard", async () => {
    const {
      action,
      grounding,
    } =
      trustedGrounding(
        "REORDER",
      );

    const started =
      Date.now();

    const early =
      await explainDecisionBriefFromGrounding(
        grounding,
        testInjectedAiExplanationOptions({
          briefId: action.id,
          role: "owner",
          generatedAt: GENERATED_AT,
          adapter: createOfflineStubAdapter({
            behavior: {
              mode: "valid_looking",
            },
          }),
          timeoutMs: 1500,
        }),
      );

    const elapsed =
      Date.now() - started;

    expect(
      early.ok,
    ).toBe(true);

    if (
      !early.ok
    ) {
      return;
    }

    // Early settlement must not wait out the full deadline budget.
    expect(
      elapsed,
    ).toBeLessThan(
      750,
    );
    expect(
      early.diagnostics.lateResultDiscarded,
    ).toBe(
      false,
    );
    expect(
      early.brief.generator,
    ).toBe(
      "deterministic_fallback",
    );

    const late =
      await explainDecisionBriefFromGrounding(
        grounding,
        testInjectedAiExplanationOptions({
          briefId: action.id,
          role: "owner",
          generatedAt: GENERATED_AT,
          adapter: createOfflineStubAdapter({
            behavior: {
              mode: "ignore_abort_late",
              delayMs: 200,
            },
          }),
          timeoutMs: 40,
        }),
      );

    expect(
      late.ok,
    ).toBe(true);

    if (
      !late.ok
    ) {
      return;
    }

    expect(
      late.diagnostics.lateResultDiscarded,
    ).toBe(
      true,
    );
    expect(
      late.diagnostics.adapterFailureReason,
    ).toBe(
      "AI_TIMEOUT",
    );
  });

  it("fails closed on rejected candidate claims and exercises semantic gate", async () => {
    const {
      action,
      grounding,
    } =
      trustedGrounding(
        "PROMOTE",
      );

    const result =
      await explainDecisionBriefFromGrounding(
        grounding,
        testInjectedAiExplanationOptions({
          briefId: action.id,
          role: "owner",
          generatedAt: GENERATED_AT,
          adapter: createOfflineStubAdapter({
            behavior: {
              mode: "rejected_claims",
            },
          }),
        }),
      );

    expect(
      result.ok,
    ).toBe(true);

    if (
      !result.ok
    ) {
      return;
    }

    expect(
      result.brief.generator,
    ).toBe(
      "deterministic_fallback",
    );
    expect(
      result.diagnostics.discardReasons,
    ).toEqual(
      expect.arrayContaining([
        "AI_NUMERIC_MUTATION",
        "AI_PROSE_SEMANTIC_VALIDATION_REJECTED",
      ]),
    );

    const envelope =
      buildDeterministicGroundingEnvelope(
        grounding,
        {
          briefId: action.id,
        },
      );
    const stubResult =
      await createOfflineStubAdapter({
        behavior: {
          mode: "rejected_claims",
        },
      }).generate(
        envelope,
        {
          signal: new AbortController().signal,
          timeoutMs: 2500,
          maxInputTokens: 100,
          maxOutputTokens: 100,
        },
      );

    expect(
      stubResult.ok,
    ).toBe(true);

    if (
      !stubResult.ok
    ) {
      return;
    }

    const validation =
      validateAiExplanationCandidate(
        envelope,
        stubResult.candidate,
      );

    expect(
      validation.ok,
    ).toBe(false);
  });

  it("enforces timeout and discards ignore-abort late success", async () => {
    const {
      action,
      grounding,
    } =
      trustedGrounding(
        "REORDER",
      );

    const result =
      await explainDecisionBriefFromGrounding(
        grounding,
        testInjectedAiExplanationOptions({
          briefId: action.id,
          role: "owner",
          generatedAt: GENERATED_AT,
          adapter: createOfflineStubAdapter({
            behavior: {
              mode: "ignore_abort_late",
              delayMs: 200,
            },
          }),
          timeoutMs: 40,
        }),
      );

    expect(
      result.ok,
    ).toBe(true);

    if (
      !result.ok
    ) {
      return;
    }

    expect(
      result.brief.generator,
    ).toBe(
      "deterministic_fallback",
    );
    expect(
      result.diagnostics.adapterFailureReason,
    ).toBe(
      "AI_TIMEOUT",
    );
    expect(
      result.diagnostics.lateResultDiscarded,
    ).toBe(
      true,
    );
    expect(
      result.diagnostics.candidateReceived,
    ).toBe(
      false,
    );
    expect(
      result.brief.generatedAt,
    ).toBe(
      GENERATED_AT,
    );
  });

  it("fails closed when adapter hangs until abort", async () => {
    const {
      action,
      grounding,
    } =
      trustedGrounding(
        "WATCH",
      );

    const result =
      await explainDecisionBriefFromGrounding(
        grounding,
        testInjectedAiExplanationOptions({
          briefId: action.id,
          role: "owner",
          generatedAt: GENERATED_AT,
          adapter: createOfflineStubAdapter({
            behavior: {
              mode: "hang_until_abort",
            },
          }),
          timeoutMs: 40,
        }),
      );

    expect(
      result.ok,
    ).toBe(true);

    if (
      !result.ok
    ) {
      return;
    }

    expect(
      result.brief.generator,
    ).toBe(
      "deterministic_fallback",
    );
    // Either deadline wins first, or abort-aware stub returns AI_TIMEOUT.
    expect(
      [
        "AI_TIMEOUT",
        "AI_UNAVAILABLE",
      ],
    ).toContain(
      result.diagnostics.adapterFailureReason,
    );
  });

  it("preserves WATCH safety and productionApprovalEligible=false under AI attempt", async () => {
    const {
      action,
      grounding,
    } =
      trustedGrounding(
        "WATCH",
      );

    const result =
      await explainDecisionBriefFromGrounding(
        grounding,
        testInjectedAiExplanationOptions({
          briefId: action.id,
          role: "owner",
          generatedAt: GENERATED_AT,
          adapter: createOfflineStubAdapter(),
        }),
      );

    expect(
      result.ok,
    ).toBe(true);

    if (
      !result.ok
    ) {
      return;
    }

    expect(
      result.brief.recommendation.actionType,
    ).toBe(
      "WATCH",
    );
    expect(
      result.brief.suggestedNextStep.code,
    ).toBe(
      "investigate_watch",
    );
    expect(
      result.brief.humanControls
        .productionApprovalEligible,
    ).toBe(
      false,
    );
  });

  it("keeps offline stub supportsLiveNetwork=false", () => {
    const stub =
      createOfflineStubAdapter();

    expect(
      stub.adapterId,
    ).toBe(
      "offline_stub",
    );
    expect(
      stub.supportsLiveNetwork,
    ).toBe(
      false,
    );
  });
});
