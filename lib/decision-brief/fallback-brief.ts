/**
 * Deterministic fallback Decision Brief composer.
 *
 * Uses only trusted templates / reason-code explanation maps /
 * optional deterministicFallbackCopy. Never calls an AI provider.
 */

import type {
  OrganizationMemberRole,
} from "@/lib/commerce-domain/types";

import {
  canInteractWithDemoApprovals,
  DEMO_NO_SAVE_MESSAGE,
  demoDismissControlLabel,
  demoPrimaryControlLabel,
} from "@/lib/demo/m7-decision-demo-controls";

import {
  explainDemoReasonCode,
} from "@/lib/demo/m7-decision-demo-format";

import {
  isKnown,
} from "@/lib/decision-brief/fields";

import {
  selectKeyEvidenceFacts,
} from "@/lib/decision-brief/key-evidence";

import {
  actionTypeLabel,
  defaultNextStepCode,
  defaultNextStepSummary,
  isWatchPurchaseImplicationText,
} from "@/lib/decision-brief/next-step";

import {
  validateBriefClaims,
} from "@/lib/decision-brief/validate-claims";

import {
  isEditableReorderQuantity,
  validateGrounding,
} from "@/lib/decision-brief/validate-grounding";

import {
  DECISION_BRIEF_SCHEMA_VERSION,
  type DecisionBriefClaim,
  type DecisionBriefGroundingInput,
  type DecisionBriefV1,
  type DeterministicFallbackBuildResult,
} from "@/lib/decision-brief/types";

export type BuildDeterministicFallbackBriefOptions = {
  briefId: string;
  role: OrganizationMemberRole;
  /**
   * ISO datetime of brief assembly. Injected for deterministic tests.
   * Must not be displayed as inventory freshness.
   */
  generatedAt?: string;
  algorithmVersion?: string;
};

const UNCERTAINTY_REASON_NEEDLES = [
  "conflict",
  "insufficient",
  "unknown",
  "stale",
  "missing",
  "incomplete",
  "uncertain",
] as const;

function buildWhyNowSummary(
  grounding: DecisionBriefGroundingInput,
): string {
  const authored =
    grounding.deterministicFallbackCopy?.whyNow?.trim();

  if (
    authored &&
    authored.length > 0
  ) {
    return authored;
  }

  const fromReasons =
    grounding.reasonCodes
      .slice(0, 3)
      .map(
        (code) =>
          explainDemoReasonCode(code),
      )
      .join(" ");

  if (
    fromReasons.length > 0
  ) {
    return fromReasons;
  }

  return `${actionTypeLabel(grounding.actionType)} is indicated by the available evidence.`;
}

function collectUncertaintyCodes(
  grounding: DecisionBriefGroundingInput,
): string[] {
  const codes: string[] = [];

  for (
    const code of [
      ...grounding.reasonCodes,
      ...grounding.confidenceReasonCodes,
    ]
  ) {
    const lower =
      code.toLowerCase();

    if (
      UNCERTAINTY_REASON_NEEDLES.some(
        (needle) =>
          lower.includes(needle),
      )
    ) {
      if (
        !codes.includes(code)
      ) {
        codes.push(code);
      }
    }
  }

  if (
    grounding.confidence === "low" &&
    !codes.includes("low_confidence")
  ) {
    codes.push("low_confidence");
  }

  for (
    const [key, field] of Object.entries(
      grounding.evidence,
    )
  ) {
    if (
      field.state === "unknown" &&
      (
        key === "availableQuantity" ||
        key === "incomingQuantity" ||
        key === "demandVelocity" ||
        key === "daysOfStock" ||
        key === "dataQualityScore"
      )
    ) {
      const code =
        `${key}_unknown`;

      if (
        !codes.includes(code)
      ) {
        codes.push(code);
      }
    }
  }

  if (
    grounding.freshness.status === "stale" ||
    grounding.freshness.status === "unknown"
  ) {
    if (
      grounding.freshness.status === "stale" &&
      !codes.includes("stale_evidence")
    ) {
      codes.push("stale_evidence");
    }
  }

  return codes;
}

function buildUncertainty(
  grounding: DecisionBriefGroundingInput,
): DecisionBriefV1["uncertainty"] {
  const codes =
    collectUncertaintyCodes(
      grounding,
    );

  const hasMaterialUncertainty =
    grounding.actionType === "WATCH" ||
    grounding.confidence === "low" ||
    codes.length > 0 ||
    grounding.freshness.status === "stale";

  let summary: string;

  if (
    !hasMaterialUncertainty
  ) {
    summary =
      "No material uncertainty flagged.";
  } else if (
    grounding.actionType === "WATCH"
  ) {
    summary =
      "Uncertainty is primary: signals conflict or evidence is incomplete, so StoreAgent is watching rather than recommending a commercial intervention.";
  } else if (
    codes.length > 0
  ) {
    summary =
      codes
        .slice(0, 3)
        .map(
          (code) =>
            explainDemoReasonCode(code),
        )
        .join(" ");
  } else {
    summary =
      "Some evidence is incomplete; treat this recommendation cautiously.";
  }

  const claims: DecisionBriefClaim[] = [
    {
      claimId: "uncertainty-summary",
      kind: "uncertainty_statement",
      text: summary,
      evidenceRefs: [
        ...grounding.reasonCodes.slice(0, 3),
      ],
    },
  ];

  return {
    hasMaterialUncertainty,
    summary,
    codes,
    claims,
  };
}

function buildHumanControls(
  grounding: DecisionBriefGroundingInput,
  role: OrganizationMemberRole,
): DecisionBriefV1["humanControls"] {
  const decide =
    canInteractWithDemoApprovals(role);

  const analystViewOnly =
    role === "analyst";

  const demoEditQuantityAllowed =
    decide &&
    isEditableReorderQuantity(
      grounding,
    );

  const isDemo =
    grounding.briefMode === "synthetic_demo";

  return {
    demoPrimaryInteractionAllowed: decide && isDemo,
    demoDismissAllowed: decide && isDemo,
    demoEditQuantityAllowed:
      demoEditQuantityAllowed && isDemo,
    analystViewOnly,
    demoNoSaveRequired: isDemo,
    // Durable production approval eligibility is a separate axis.
    // Always false for M7.4e synthetic demo / unauthorized engine_bound.
    productionApprovalEligible: false,
    controlCopy: {
      primaryLabel:
        demoPrimaryControlLabel(
          grounding.actionType,
        ),
      dismissLabel:
        demoDismissControlLabel(
          grounding.actionType,
        ),
      helperText: DEMO_NO_SAVE_MESSAGE,
    },
  };
}

function buildDeterministicClaims(
  grounding: DecisionBriefGroundingInput,
  whyNow: string,
  nextStepSummary: string,
): {
  whyNowClaims: DecisionBriefClaim[];
  nextStepClaims: DecisionBriefClaim[];
} {
  const reasonRefs =
    grounding.reasonCodes.slice(0, 4);

  const whyNowClaims: DecisionBriefClaim[] = [
    {
      claimId: "why-now-summary",
      kind: "why_now_statement",
      text: whyNow,
      structured: {
        actionType: grounding.actionType,
        priority: grounding.priority,
        confidence: grounding.confidence,
        reasonCodes: [
          ...grounding.reasonCodes,
        ],
      },
      evidenceRefs:
        reasonRefs.length > 0
          ? reasonRefs
          : [
              "availableQuantity",
            ],
    },
  ];

  if (
    grounding.actionType === "REORDER" &&
    isKnown(grounding.recommendedQuantity)
  ) {
    whyNowClaims.push({
      claimId: "quantity-restatement",
      kind: "quantity",
      text: `Recommended quantity ${grounding.recommendedQuantity.value}.`,
      structured: {
        recommendedQuantity:
          grounding.recommendedQuantity.value,
      },
      evidenceRefs: [
        ...reasonRefs,
      ],
    });
  }

  const nextStepClaims: DecisionBriefClaim[] = [
    {
      claimId: "next-step-summary",
      kind: "next_step_statement",
      text: nextStepSummary,
      structured: {
        actionType: grounding.actionType,
      },
      evidenceRefs:
        reasonRefs.length > 0
          ? reasonRefs
          : [
              "availableQuantity",
            ],
    },
  ];

  return {
    whyNowClaims,
    nextStepClaims,
  };
}

/**
 * Build an accepted deterministic fallback brief from validated grounding.
 */
export function buildDeterministicFallbackBrief(
  grounding: DecisionBriefGroundingInput,
  options: BuildDeterministicFallbackBriefOptions,
): DeterministicFallbackBuildResult {
  // E1 hard stop: engine_bound types exist for future E4 but must not compose.
  if (
    grounding.briefMode === "engine_bound"
  ) {
    return {
      ok: false,
      reasons: [
        "INVALID_BRIEF_MODE",
      ],
      detail:
        "engine_bound Decision Brief composition is not authorized until E4.",
    };
  }

  const groundingValidation =
    validateGrounding(
      grounding,
    );

  if (
    !groundingValidation.ok
  ) {
    return {
      ok: false,
      reasons: groundingValidation.reasons,
      detail: groundingValidation.detail,
    };
  }

  const whyNow =
    buildWhyNowSummary(
      grounding,
    );

  if (
    grounding.actionType === "WATCH" &&
    isWatchPurchaseImplicationText(whyNow)
  ) {
    return {
      ok: false,
      reasons: [
        "AI_WATCH_PURCHASE_IMPLICATION",
      ],
      detail:
        "WATCH why-now must not imply a purchase recommendation.",
    };
  }

  const nextStepCode =
    defaultNextStepCode(
      grounding.actionType,
    );

  const nextStepSummary =
    grounding.deterministicFallbackCopy
      ?.suggestedNextStep?.trim() ||
    defaultNextStepSummary(
      grounding.actionType,
    );

  if (
    grounding.actionType === "WATCH" &&
    isWatchPurchaseImplicationText(
      nextStepSummary,
    )
  ) {
    return {
      ok: false,
      reasons: [
        "AI_WATCH_PURCHASE_IMPLICATION",
      ],
      detail:
        "WATCH next-step copy must not imply a purchase recommendation.",
    };
  }

  const {
    whyNowClaims,
    nextStepClaims,
  } =
    buildDeterministicClaims(
      grounding,
      whyNow,
      nextStepSummary,
    );

  const uncertainty =
    buildUncertainty(
      grounding,
    );

  const allClaims = [
    ...whyNowClaims,
    ...uncertainty.claims,
    ...nextStepClaims,
  ];

  const claimValidation =
    validateBriefClaims(
      grounding,
      allClaims,
    );

  if (
    !claimValidation.ok
  ) {
    return {
      ok: false,
      reasons: claimValidation.reasons,
      detail: claimValidation.detail,
    };
  }

  const confidenceNotes =
    grounding.confidenceReasonCodes.map(
      (code) =>
        explainDemoReasonCode(code),
    );

  const brief: DecisionBriefV1 = {
    schemaVersion: DECISION_BRIEF_SCHEMA_VERSION,
    briefId: options.briefId,
    briefMode: grounding.briefMode,
    generator: "deterministic_fallback",
    validationStatus: "accepted",
    generatedAt:
      options.generatedAt ??
      new Date().toISOString(),

    recommendation: {
      actionType: grounding.actionType,
      label: actionTypeLabel(
        grounding.actionType,
      ),
      productTitle: grounding.productTitle,
      variantTitle: grounding.variantTitle,
      priority: grounding.priority,
      recommendedQuantity:
        grounding.recommendedQuantity,
      recommendedActionDate:
        grounding.recommendedActionDate,
    },

    whyNow: {
      summary: whyNow,
      claims: whyNowClaims,
    },

    evidence: {
      keyFacts: selectKeyEvidenceFacts(
        grounding.actionType,
        grounding.evidence,
      ),
      fullEvidenceAvailable: true,
    },

    confidence: {
      level: grounding.confidence,
      reasonCodes: [
        ...grounding.confidenceReasonCodes,
      ],
      displayNotes: confidenceNotes,
    },

    uncertainty,

    suggestedNextStep: {
      code: nextStepCode,
      summary: nextStepSummary,
      claims: nextStepClaims,
    },

    humanControls: buildHumanControls(
      grounding,
      options.role,
    ),

    provenance: {
      demoAttestation:
        grounding.demoAttestation,
      decisionAsOf: grounding.decisionAsOf,
      freshnessStatus:
        grounding.freshness.status,
      trustClaims: grounding.trustClaims,
      algorithmVersion:
        options.algorithmVersion ??
        (
          grounding.briefMode === "synthetic_demo"
            ? "demo-fixture"
            : "inventory-decision-v1"
        ),
    },
  };

  // Defensive: never surface invented quantity display for non-REORDER.
  if (
    brief.recommendation.actionType !== "REORDER" &&
    brief.recommendation.recommendedQuantity.state !==
      "not_applicable"
  ) {
    return {
      ok: false,
      reasons: [
        "QUANTITY_GROUNDING_INCONSISTENT",
      ],
      detail:
        "Non-REORDER brief quantity must remain not_applicable.",
    };
  }

  return {
    ok: true,
    brief,
  };
}
