import {
  describe,
  expect,
  it,
} from "vitest";

import {
  assessAiProseSemanticGate,
  buildDeterministicFallbackBrief,
  composeDemoDecisionBrief,
  DECISION_BRIEF_DEMO_ATTESTATION,
  formatQuantityFieldDisplay,
  groundingAllowedEvidenceRefs,
  groundingToNumericTruthSnapshot,
  isEditableReorderQuantity,
  known,
  mapDemoActionToGrounding,
  notApplicable,
  unknown,
  validateBriefClaims,
  validateGrounding,
  validateNextStepAgainstGrounding,
  type DecisionBriefClaim,
  type DecisionBriefGroundingInput,
} from "@/lib/decision-brief";

import {
  getM7DecisionDemoFixtureRoot,
  M7_DEMO_ATTESTATION,
  type DemoActionItem,
  type M7DecisionDemoFixtureRoot,
} from "@/lib/demo/m7-decision-demo-fixtures";

import {
  assessAiNumericMutation,
} from "@/tests/evaluation/ai-numeric-mutation";

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

/**
 * Test helper: stamp attestation only for actions that are members of the
 * attested fixture root (mirrors compose provenance rules).
 */
function mapTrustedFixtureGrounding(
  action: DemoActionItem,
): DecisionBriefGroundingInput {
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
      `Action ${action.id} is not in the attested fixture root`,
    );
  }

  return mapDemoActionToGrounding(
    trusted,
    {
      trustedDemoAttestation:
        root.demoAttestation,
    },
  );
}

function cloneGrounding(
  grounding: DecisionBriefGroundingInput,
): DecisionBriefGroundingInput {
  return structuredClone(
    grounding,
  );
}

describe("M7.4e E1 decision brief — positive path", () => {
  it("maps and accepts deterministic fallback briefs for REORDER/REDUCE/PROMOTE/WATCH", () => {
    for (
      const actionType of [
        "REORDER",
        "REDUCE",
        "PROMOTE",
        "WATCH",
      ] as const
    ) {
      const action =
        fixtureAction(actionType);

      const result =
        composeDemoDecisionBrief(
          action,
          {
            role: "owner",
            generatedAt: GENERATED_AT,
          },
        );

      expect(
        result.ok,
        actionType,
      ).toBe(true);

      if (
        !result.ok
      ) {
        continue;
      }

      expect(result.brief.schemaVersion).toBe(
        "decision-brief-v1",
      );
      expect(result.brief.generator).toBe(
        "deterministic_fallback",
      );
      expect(result.brief.validationStatus).toBe(
        "accepted",
      );
      expect(result.brief.briefMode).toBe(
        "synthetic_demo",
      );
      expect(result.brief.recommendation.actionType).toBe(
        actionType,
      );
      expect(result.brief.whyNow.summary.length).toBeGreaterThan(
        0,
      );
      expect(result.brief.suggestedNextStep.summary.length).toBeGreaterThan(
        0,
      );
      expect(
        result.brief.provenance.freshnessStatus,
      ).toBe("unknown");
      expect(
        result.brief.provenance.decisionAsOf.state,
      ).toBe("unknown");
      expect(
        result.brief.humanControls.productionApprovalEligible,
      ).toBe(false);
      expect(
        result.brief.humanControls.demoNoSaveRequired,
      ).toBe(true);
      expect(
        result.brief.evidence.keyFacts.length,
      ).toBeGreaterThanOrEqual(3);
      expect(
        result.brief.evidence.keyFacts.length,
      ).toBeLessThanOrEqual(6);
    }
  });

  it("reuses fixture conciseReason as why-now and keeps demo snake_case reason codes", () => {
    const action =
      fixtureAction("REORDER");

    const grounding =
      mapTrustedFixtureGrounding(action);

    expect(grounding.reasonCodes).toEqual(
      action.evidence.reasonCodes,
    );
    expect(grounding.reasonCodes[0]).toBe(
      "below_reorder_point",
    );
    expect(
      grounding.deterministicFallbackCopy?.whyNow,
    ).toBe(action.conciseReason);

    const briefResult =
      buildDeterministicFallbackBrief(
        grounding,
        {
          briefId: action.id,
          role: "operator",
          generatedAt: GENERATED_AT,
        },
      );

    expect(briefResult.ok).toBe(true);
    if (
      briefResult.ok
    ) {
      expect(briefResult.brief.whyNow.summary).toBe(
        action.conciseReason,
      );
    }
  });

  it("allows REORDER unknown quantity without inventing, and disables edit", () => {
    const action =
      fixtureAction("REORDER");

    // Mapper field semantics (null → unknown) without trusting arbitrary callers.
    const mappedUnknown =
      mapDemoActionToGrounding({
        ...action,
        recommendedQuantity: null,
      });

    expect(
      mappedUnknown.recommendedQuantity,
    ).toEqual({
      state: "unknown",
      reasonCode: "recommended_quantity_unknown",
    });

    // Valid brief path: trusted fixture grounding with unknown qty applied.
    const grounding =
      cloneGrounding(
        mapTrustedFixtureGrounding(action),
      );
    grounding.recommendedQuantity = unknown(
      "recommended_quantity_unknown",
    );

    expect(
      validateGrounding(grounding).ok,
    ).toBe(true);
    expect(
      isEditableReorderQuantity(grounding),
    ).toBe(false);
    expect(
      formatQuantityFieldDisplay(
        grounding.recommendedQuantity,
      ),
    ).toBe("Unknown");

    const briefResult =
      buildDeterministicFallbackBrief(
        grounding,
        {
          briefId: action.id,
          role: "admin",
          generatedAt: GENERATED_AT,
        },
      );

    expect(briefResult.ok).toBe(true);
    if (
      briefResult.ok
    ) {
      expect(
        briefResult.brief.recommendation.recommendedQuantity.state,
      ).toBe("unknown");
      expect(
        briefResult.brief.humanControls.demoEditQuantityAllowed,
      ).toBe(false);
      expect(
        briefResult.brief.humanControls.demoPrimaryInteractionAllowed,
      ).toBe(true);
      expect(
        briefResult.brief.humanControls.productionApprovalEligible,
      ).toBe(false);
    }
  });

  it("marks non-REORDER quantity not_applicable and keeps decide-role demo interaction separate from production eligibility", () => {
    const reduce =
      fixtureAction("REDUCE");

    const grounding =
      mapTrustedFixtureGrounding(reduce);

    expect(
      grounding.recommendedQuantity.state,
    ).toBe("not_applicable");

    const ownerBrief =
      composeDemoDecisionBrief(
        reduce,
        {
          role: "owner",
          generatedAt: GENERATED_AT,
        },
      );

    const analystBrief =
      composeDemoDecisionBrief(
        reduce,
        {
          role: "analyst",
          generatedAt: GENERATED_AT,
        },
      );

    expect(ownerBrief.ok).toBe(true);
    expect(analystBrief.ok).toBe(true);

    if (
      ownerBrief.ok &&
      analystBrief.ok
    ) {
      expect(
        ownerBrief.brief.humanControls.demoPrimaryInteractionAllowed,
      ).toBe(true);
      expect(
        ownerBrief.brief.humanControls.productionApprovalEligible,
      ).toBe(false);
      expect(
        analystBrief.brief.humanControls.analystViewOnly,
      ).toBe(true);
      expect(
        analystBrief.brief.humanControls.demoPrimaryInteractionAllowed,
      ).toBe(false);
      expect(
        analystBrief.brief.humanControls.productionApprovalEligible,
      ).toBe(false);
      expect(
        ownerBrief.brief.humanControls.controlCopy.helperText,
      ).toContain("no action was saved");
    }
  });

  it("makes WATCH uncertainty-first and never emits purchase next-step codes", () => {
    const watch =
      fixtureAction("WATCH");

    const result =
      composeDemoDecisionBrief(
        watch,
        {
          role: "owner",
          generatedAt: GENERATED_AT,
        },
      );

    expect(result.ok).toBe(true);
    if (
      !result.ok
    ) {
      return;
    }

    expect(
      result.brief.uncertainty.hasMaterialUncertainty,
    ).toBe(true);
    expect(
      result.brief.uncertainty.summary.toLowerCase(),
    ).toContain("uncertainty");
    expect(
      result.brief.suggestedNextStep.code,
    ).toBe("investigate_watch");
    expect(
      [
        "review_reorder",
        "edit_reorder_quantity",
      ].includes(
        result.brief.suggestedNextStep.code,
      ),
    ).toBe(false);
    expect(
      result.brief.recommendation.recommendedQuantity.state,
    ).toBe("not_applicable");
    expect(
      result.brief.humanControls.controlCopy.primaryLabel.toLowerCase(),
    ).toContain("acknowledge");
    expect(
      result.brief.whyNow.summary.toLowerCase(),
    ).not.toContain("buy now");
    expect(
      result.brief.suggestedNextStep.summary.toLowerCase(),
    ).not.toContain("reorder recommended");
  });

  it("does not invent freshness timestamps on demo mapping", () => {
    const grounding =
      mapTrustedFixtureGrounding(
        fixtureAction("PROMOTE"),
      );

    expect(grounding.freshness.status).toBe(
      "unknown",
    );
    expect(
      grounding.decisionAsOf.state,
    ).toBe("unknown");
    expect(
      grounding.pinnedTimeZone.state,
    ).toBe("unknown");
    expect(
      grounding.evidenceSourceTimestamps.inventoryObservationAt.state,
    ).toBe("unknown");
    expect(
      grounding.evidenceSourceTimestamps.metricsComputedAt.state,
    ).toBe("unknown");
    expect(
      grounding.evidenceSourceTimestamps.forecastAsOf.state,
    ).toBe("unknown");
    expect(
      grounding.trustClaims.evidenceScope,
    ).toBe("synthetic_demonstration");
  });

  it("preserves known zero evidence as known, never coercing null to zero", () => {
    const action =
      fixtureAction("REORDER");

    const withZero: DemoActionItem = {
      ...action,
      evidence: {
        ...action.evidence,
        incomingQuantity: 0,
        availableQuantity: null,
      },
    };

    const grounding =
      mapDemoActionToGrounding(withZero);

    expect(
      grounding.evidence.incomingQuantity,
    ).toEqual({
      state: "known",
      value: 0,
    });
    expect(
      grounding.evidence.availableQuantity.state,
    ).toBe("unknown");
    // Untrusted map must not invent attestation.
    expect(
      grounding.demoAttestation,
    ).toBeUndefined();
    expect(
      grounding.trustClaims.evidenceScope,
    ).toBe("unknown");
  });
});

describe("M7.4e E1 decision brief — negative / fail-closed", () => {
  it("rejects synthetic_demo grounding without attestation", () => {
    const untrusted =
      mapDemoActionToGrounding(
        fixtureAction("REORDER"),
      );

    expect(
      untrusted.demoAttestation,
    ).toBeUndefined();

    const untrustedValidated =
      validateGrounding(untrusted);

    expect(untrustedValidated.ok).toBe(false);
    if (
      !untrustedValidated.ok
    ) {
      expect(untrustedValidated.reasons).toContain(
        "MISSING_ATTESTATION",
      );
    }

    const grounding =
      cloneGrounding(
        mapTrustedFixtureGrounding(
          fixtureAction("REORDER"),
        ),
      );

    delete grounding.demoAttestation;

    const validated =
      validateGrounding(grounding);

    expect(validated.ok).toBe(false);
    if (
      !validated.ok
    ) {
      expect(validated.reasons).toContain(
        "MISSING_ATTESTATION",
      );
    }

    const built =
      buildDeterministicFallbackBrief(
        grounding,
        {
          briefId: "x",
          role: "owner",
          generatedAt: GENERATED_AT,
        },
      );

    expect(built.ok).toBe(false);
  });

  it("rejects empty WATCH reason codes", () => {
    const grounding =
      cloneGrounding(
        mapTrustedFixtureGrounding(
          fixtureAction("WATCH"),
        ),
      );

    grounding.reasonCodes = [];

    const validated =
      validateGrounding(grounding);

    expect(validated.ok).toBe(false);
    if (
      !validated.ok
    ) {
      expect(validated.reasons).toContain(
        "WATCH_REASON_CODES_EMPTY",
      );
    }
  });

  it("rejects inconsistent false known REORDER quantity", () => {
    const grounding =
      cloneGrounding(
        mapTrustedFixtureGrounding(
          fixtureAction("REORDER"),
        ),
      );

    grounding.recommendedQuantity = known(0);

    expect(
      validateGrounding(grounding).ok,
    ).toBe(false);

    grounding.recommendedQuantity = known(1.5);

    const nonInteger =
      validateGrounding(grounding);

    expect(nonInteger.ok).toBe(false);
    if (
      !nonInteger.ok
    ) {
      expect(nonInteger.reasons).toContain(
        "QUANTITY_GROUNDING_INCONSISTENT",
      );
    }

    grounding.recommendedQuantity = known(-3);

    expect(
      validateGrounding(grounding).ok,
    ).toBe(false);
  });

  it("rejects non-REORDER quantity that is not not_applicable", () => {
    const grounding =
      cloneGrounding(
        mapTrustedFixtureGrounding(
          fixtureAction("REDUCE"),
        ),
      );

    grounding.recommendedQuantity = known(12);

    let validated =
      validateGrounding(grounding);

    expect(validated.ok).toBe(false);
    if (
      !validated.ok
    ) {
      expect(validated.reasons).toContain(
        "QUANTITY_GROUNDING_INCONSISTENT",
      );
    }

    grounding.recommendedQuantity = unknown(
      "should_be_na",
    );

    validated =
      validateGrounding(grounding);

    expect(validated.ok).toBe(false);
    if (
      !validated.ok
    ) {
      expect(validated.reasons).toContain(
        "QUANTITY_GROUNDING_INCONSISTENT",
      );
    }

    grounding.recommendedQuantity = notApplicable(
      "quantity_not_applicable_for_action_type",
    );

    expect(
      validateGrounding(grounding).ok,
    ).toBe(true);
  });

  it("rejects invalid synthetic trust claims", () => {
    const grounding =
      cloneGrounding(
        mapTrustedFixtureGrounding(
          fixtureAction("PROMOTE"),
        ),
      );

    grounding.trustClaims.claimsM7ProductionEligibility =
      true;
    grounding.trustClaims.algorithmApproved =
      true;
    grounding.trustClaims.evidenceScope =
      "production_bound";

    const validated =
      validateGrounding(grounding);

    expect(validated.ok).toBe(false);
    if (
      !validated.ok
    ) {
      expect(validated.reasons).toContain(
        "TRUST_CLAIMS_INVALID",
      );
    }
  });
});

describe("M7.4e E1 decision brief — adversarial claims / semantic boundary", () => {
  it("rejects untraced evidenceRefs and fabricated reason codes", () => {
    const grounding =
      mapTrustedFixtureGrounding(
        fixtureAction("REORDER"),
      );

    const claims: DecisionBriefClaim[] = [
      {
        claimId: "bad-ref",
        kind: "why_now_statement",
        text: "Invented support.",
        structured: {
          actionType: "REORDER",
        },
        evidenceRefs: [
          "not_a_real_ref",
        ],
      },
      {
        claimId: "fabricated-code",
        kind: "reason_code",
        text: "Fabricated.",
        structured: {
          reasonCodes: [
            "ENGINE_ONLY_CODE_SHOULD_NOT_PASS",
          ],
        },
        evidenceRefs: [
          "below_reorder_point",
        ],
      },
    ];

    const validated =
      validateBriefClaims(
        grounding,
        claims,
      );

    expect(validated.ok).toBe(false);
    if (
      !validated.ok
    ) {
      expect(validated.reasons).toContain(
        "CLAIM_EVIDENCE_UNTRACED",
      );
      expect(validated.reasons).toContain(
        "AI_FABRICATED_REASON_CODE",
      );
    }
  });

  it("rejects confidencePercent and quantity mutations using M0.9.10 semantics", () => {
    const grounding =
      mapTrustedFixtureGrounding(
        fixtureAction("REORDER"),
      );

    const claims: DecisionBriefClaim[] = [
      {
        claimId: "pct",
        kind: "confidence",
        text: "95% confident",
        structured: {
          confidence: "high",
          confidencePercent: 95,
        },
        evidenceRefs: [
          "below_reorder_point",
        ],
      },
      {
        claimId: "qty-mut",
        kind: "quantity",
        text: "Order 999",
        structured: {
          recommendedQuantity: 999,
        },
        evidenceRefs: [
          "below_reorder_point",
        ],
      },
    ];

    const briefAssessment =
      validateBriefClaims(
        grounding,
        claims,
      );

    expect(briefAssessment.ok).toBe(false);
    if (
      !briefAssessment.ok
    ) {
      expect(briefAssessment.reasons).toContain(
        "AI_UNSUPPORTED_CONFIDENCE_PERCENT",
      );
      expect(briefAssessment.reasons).toContain(
        "AI_NUMERIC_MUTATION",
      );
    }

    const truth =
      groundingToNumericTruthSnapshot(
        grounding,
      );

    const numeric =
      assessAiNumericMutation(
        truth,
        {
          explanation: "Order 999 at 95%",
          claims: {
            recommendedQuantity: 999,
            confidencePercent: 95,
          },
        },
      );

    expect(numeric.status).toBe("violation");
    if (
      numeric.status === "violation"
    ) {
      expect(numeric.violations).toContain(
        "QUANTITY_MUTATION",
      );
      expect(numeric.violations).toContain(
        "UNSUPPORTED_CONFIDENCE_PERCENT",
      );
    }
  });

  it("rejects inventing quantity when REORDER grounding quantity is unknown", () => {
    const action =
      fixtureAction("REORDER");

    const grounding =
      cloneGrounding(
        mapTrustedFixtureGrounding(action),
      );
    grounding.recommendedQuantity = unknown(
      "recommended_quantity_unknown",
    );

    const claims: DecisionBriefClaim[] = [
      {
        claimId: "invent-qty",
        kind: "quantity",
        text: "Order 24 anyway",
        structured: {
          recommendedQuantity: 24,
        },
        evidenceRefs: [
          "below_reorder_point",
        ],
      },
    ];

    const validated =
      validateBriefClaims(
        grounding,
        claims,
      );

    expect(validated.ok).toBe(false);
    if (
      !validated.ok
    ) {
      expect(validated.reasons).toContain(
        "QUANTITY_GROUNDING_INCONSISTENT",
      );
      expect(validated.reasons).toContain(
        "AI_NUMERIC_MUTATION",
      );
    }
  });

  it("rejects WATCH purchase next-step codes and purchase-implying prose", () => {
    const grounding =
      mapTrustedFixtureGrounding(
        fixtureAction("WATCH"),
      );

    const nextStep =
      validateNextStepAgainstGrounding(
        grounding,
        "review_reorder",
      );

    expect(nextStep.ok).toBe(false);
    if (
      !nextStep.ok
    ) {
      expect(nextStep.reasons).toContain(
        "AI_WATCH_PURCHASE_IMPLICATION",
      );
    }

    const claims: DecisionBriefClaim[] = [
      {
        claimId: "watch-buy",
        kind: "next_step_statement",
        text: "Reorder recommended — buy now.",
        evidenceRefs: [
          grounding.reasonCodes[0]!,
        ],
      },
    ];

    const claimResult =
      validateBriefClaims(
        grounding,
        claims,
      );

    expect(claimResult.ok).toBe(false);
    if (
      !claimResult.ok
    ) {
      expect(claimResult.reasons).toContain(
        "AI_WATCH_PURCHASE_IMPLICATION",
      );
    }
  });

  it("rejects financial claim language", () => {
    const grounding =
      mapTrustedFixtureGrounding(
        fixtureAction("REDUCE"),
      );

    const claims: DecisionBriefClaim[] = [
      {
        claimId: "roi",
        kind: "why_now_statement",
        text: "This prevents cash at risk and improves ROI.",
        evidenceRefs: [
          "excess_days_of_stock",
        ],
      },
    ];

    const validated =
      validateBriefClaims(
        grounding,
        claims,
      );

    expect(validated.ok).toBe(false);
    if (
      !validated.ok
    ) {
      expect(validated.reasons).toContain(
        "AI_UNSUPPORTED_FINANCIAL_CLAIM",
      );
    }
  });

  it("keeps AI prose behind semantic-validation gate even when structured checks would pass", () => {
    const required =
      assessAiProseSemanticGate({
        semanticProfileApproved: false,
      });

    expect(required.ok).toBe(false);
    if (
      !required.ok
    ) {
      expect(required.reasons).toContain(
        "AI_PROSE_SEMANTIC_VALIDATION_REQUIRED",
      );
    }

    const rejected =
      assessAiProseSemanticGate({
        semanticProfileApproved: true,
        semanticProfileAccepted: false,
      });

    expect(rejected.ok).toBe(false);
    if (
      !rejected.ok
    ) {
      expect(rejected.reasons).toContain(
        "AI_PROSE_SEMANTIC_VALIDATION_REJECTED",
      );
    }

    // E1 path never emits ai_validated.
    const brief =
      composeDemoDecisionBrief(
        fixtureAction("REORDER"),
        {
          role: "owner",
          generatedAt: GENERATED_AT,
        },
      );

    expect(brief.ok).toBe(true);
    if (
      brief.ok
    ) {
      expect(brief.brief.generator).toBe(
        "deterministic_fallback",
      );
      expect(brief.brief.provenance.ai).toBeUndefined();
    }
  });

  it("allows omission of structured fields (parity with M0.9.10)", () => {
    const grounding =
      mapTrustedFixtureGrounding(
        fixtureAction("REORDER"),
      );

    const truth =
      groundingToNumericTruthSnapshot(
        grounding,
      );

    const omitted =
      assessAiNumericMutation(
        truth,
        {
          explanation: "Grounded restatement only",
          claims: {
            actionType: "REORDER",
          },
        },
      );

    expect(omitted.status).toBe("allowed");

    const claims: DecisionBriefClaim[] = [
      {
        claimId: "ok-omit",
        kind: "action_type",
        text: "Reorder",
        structured: {
          actionType: "REORDER",
        },
        evidenceRefs: [
          "below_reorder_point",
        ],
      },
    ];

    expect(
      validateBriefClaims(
        grounding,
        claims,
      ).ok,
    ).toBe(true);
  });
});

describe("M7.4e E1 pre-commit hardening — attested demo provenance", () => {
  it("mapper does not grant attestation to arbitrary caller-supplied actions", () => {
    const forged: DemoActionItem = {
      id: "forged-untrusted-action",
      actionType: "REORDER",
      priority: "critical",
      confidence: "high",
      confidenceReasonCodes: [
        "forged_confidence",
      ],
      productTitle: "Forged SKU",
      variantTitle: "Forged variant",
      conciseReason: "Caller invented this action.",
      recommendedQuantity: 99,
      recommendedActionDate: "2026-11-03",
      evidence: {
        availableQuantity: 1,
        incomingQuantity: 0,
        demandVelocity: 1,
        daysOfStock: 1,
        leadTimeDays: 1,
        safetyStockUnits: 1,
        reorderPointUnits: 2,
        targetStockUnits: 3,
        inventoryAgeDays: 1,
        forecastExpectedDemandUnits: 1,
        dataQualityScore: 0.9,
        reasonCodes: [
          "below_reorder_point",
        ],
      },
    };

    const grounding =
      mapDemoActionToGrounding(forged);

    expect(grounding.demoAttestation).toBeUndefined();
    expect(
      grounding.trustClaims.evidenceScope,
    ).toBe("unknown");
    expect(
      validateGrounding(grounding).ok,
    ).toBe(false);

    const composed =
      composeDemoDecisionBrief(
        forged,
        {
          role: "owner",
          generatedAt: GENERATED_AT,
        },
      );

    expect(composed.ok).toBe(false);
    if (
      !composed.ok
    ) {
      expect(composed.reasons).toContain(
        "TRUST_CLAIMS_INVALID",
      );
    }
  });

  it("compose rejects caller mutations of attested fixture rows", () => {
    const trusted =
      fixtureAction("REORDER");

    const mutated: DemoActionItem = {
      ...trusted,
      recommendedQuantity: 999,
      conciseReason:
        "Mutated to invent a stronger reorder story.",
    };

    const composed =
      composeDemoDecisionBrief(
        mutated,
        {
          role: "owner",
          generatedAt: GENERATED_AT,
        },
      );

    expect(composed.ok).toBe(false);
    if (
      !composed.ok
    ) {
      expect(composed.reasons).toContain(
        "TRUST_CLAIMS_INVALID",
      );
      expect(composed.detail.toLowerCase()).toContain(
        "diverges",
      );
    }
  });

  it("compose rejects fixture roots that fail attestation loading", () => {
    const root =
      getM7DecisionDemoFixtureRoot();
    const tampered = {
      ...root,
      demoAttestation: "not-attested",
    } as unknown as M7DecisionDemoFixtureRoot;

    const composed =
      composeDemoDecisionBrief(
        fixtureAction("WATCH"),
        {
          role: "owner",
          generatedAt: GENERATED_AT,
          fixtureRoot: tampered,
        },
      );

    expect(composed.ok).toBe(false);
    if (
      !composed.ok
    ) {
      expect(composed.reasons).toContain(
        "MISSING_ATTESTATION",
      );
    }

    expect(M7_DEMO_ATTESTATION).toBe(
      DECISION_BRIEF_DEMO_ATTESTATION,
    );
  });
});

describe("M7.4e E1 pre-commit hardening — engine_bound fail-closed until E4", () => {
  it("validateGrounding rejects engine_bound while preserving the type", () => {
    const grounding =
      cloneGrounding(
        mapTrustedFixtureGrounding(
          fixtureAction("REORDER"),
        ),
      );

    grounding.briefMode = "engine_bound";
    delete grounding.demoAttestation;
    grounding.trustClaims = {
      ...grounding.trustClaims,
      evidenceScope: "unknown",
    };

    const validated =
      validateGrounding(grounding);

    expect(validated.ok).toBe(false);
    if (
      !validated.ok
    ) {
      expect(validated.reasons).toContain(
        "INVALID_BRIEF_MODE",
      );
    }

    // Type surface still includes engine_bound for future E4.
    const mode: DecisionBriefGroundingInput["briefMode"] =
      "engine_bound";
    expect(mode).toBe("engine_bound");
  });

  it("buildDeterministicFallbackBrief hard-fails engine_bound composition", () => {
    const grounding =
      cloneGrounding(
        mapTrustedFixtureGrounding(
          fixtureAction("REDUCE"),
        ),
      );

    grounding.briefMode = "engine_bound";
    delete grounding.demoAttestation;

    const built =
      buildDeterministicFallbackBrief(
        grounding,
        {
          briefId: grounding.productTitle,
          role: "owner",
          generatedAt: GENERATED_AT,
        },
      );

    expect(built.ok).toBe(false);
    if (
      !built.ok
    ) {
      expect(built.reasons).toContain(
        "INVALID_BRIEF_MODE",
      );
      expect(built.detail).toContain("E4");
    }
  });
});

describe("M7.4e E1 pre-commit hardening — claim evidence traceability", () => {
  it("does not treat unknown evidence keys as allowed refs for numeric claims", () => {
    const grounding =
      mapTrustedFixtureGrounding(
        fixtureAction("WATCH"),
      );

    expect(
      grounding.evidence.incomingQuantity.state,
    ).toBe("unknown");
    expect(
      groundingAllowedEvidenceRefs(
        grounding,
      ).has("incomingQuantity"),
    ).toBe(false);

    const numericClaim: DecisionBriefClaim = {
      claimId: "unknown-as-known",
      kind: "evidence_fact",
      text: "Incoming is 12",
      structured: {
        evidenceField: "incomingQuantity",
        evidenceValue: 12,
      },
      evidenceRefs: [
        "incomingQuantity",
      ],
    };

    const validated =
      validateBriefClaims(
        grounding,
        [
          numericClaim,
        ],
      );

    expect(validated.ok).toBe(false);
    if (
      !validated.ok
    ) {
      expect(validated.reasons).toContain(
        "CLAIM_EVIDENCE_UNTRACED",
      );
    }
  });

  it("allows uncertainty statements to reference unknown evidence fields without treating refs as semantic proof", () => {
    const grounding =
      mapTrustedFixtureGrounding(
        fixtureAction("WATCH"),
      );

    const uncertaintyOk: DecisionBriefClaim = {
      claimId: "uncertainty-unknown-ref",
      kind: "uncertainty_statement",
      text: "Incoming quantity is unknown, so intervention is deferred.",
      evidenceRefs: [
        "incomingQuantity",
        grounding.reasonCodes[0]!,
      ],
    };

    expect(
      validateBriefClaims(
        grounding,
        [
          uncertaintyOk,
        ],
      ).ok,
    ).toBe(true);

    // Membership of evidenceRefs alone does not authorize AI prose delivery.
    const semantic =
      assessAiProseSemanticGate({
        semanticProfileApproved: false,
      });

    expect(semantic.ok).toBe(false);
    if (
      !semantic.ok
    ) {
      expect(semantic.reasons).toContain(
        "AI_PROSE_SEMANTIC_VALIDATION_REQUIRED",
      );
    }
  });

  it("rejects numeric evidence claims that assert values against unknown fields", () => {
    const grounding =
      mapTrustedFixtureGrounding(
        fixtureAction("WATCH"),
      );

    const claim: DecisionBriefClaim = {
      claimId: "assert-unknown-numeric",
      kind: "evidence_fact",
      text: "Demand velocity is 2.0",
      structured: {
        evidenceField: "demandVelocity",
        evidenceValue: 2,
      },
      // Use a valid reason-code ref so failure is about unknown field truth,
      // not a missing reason-code membership check.
      evidenceRefs: [
        grounding.reasonCodes[0]!,
      ],
    };

    const validated =
      validateBriefClaims(
        grounding,
        [
          claim,
        ],
      );

    expect(validated.ok).toBe(false);
    if (
      !validated.ok
    ) {
      expect(validated.reasons).toContain(
        "CLAIM_EVIDENCE_UNTRACED",
      );
    }
  });
});

describe("M7.4e E1 decision brief — architecture boundaries", () => {
  it("does not introduce provider SDK imports in decision-brief modules", async () => {
    const fs =
      await import("node:fs");
    const path =
      await import("node:path");

    const root =
      path.join(
        process.cwd(),
        "lib/decision-brief",
      );

    const files =
      fs.readdirSync(root).filter(
        (name) =>
          name.endsWith(".ts"),
      );

    expect(files.length).toBeGreaterThan(0);

    for (
      const file of files
    ) {
      const source =
        fs.readFileSync(
          path.join(root, file),
          "utf8",
        );

      for (
        const forbidden of [
          "openai",
          "@anthropic",
          "@google/generative-ai",
          "transition_inventory_action_merchant",
          "persistInventoryAction",
          "createSupabaseAdminClient",
        ]
      ) {
        expect(
          source,
          `${file} must not contain ${forbidden}`,
        ).not.toContain(forbidden);
      }
    }
  });
});
