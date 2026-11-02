/**
 * M7.4e E3.2 — ai-brief-semantic-claims-v1
 *
 * Deterministic allowlisted templates + semantic assertions + rejection scanners.
 * Strict template match only (U-E3-3). evidenceRefs alone are never sufficient.
 *
 * Hardening:
 * - Material prose sentences bind 1:1 to validated claims (kind + exact text).
 * - Template evidence requirements are enforced on that bound claim's refs.
 * - Product/text slots are untrusted; unsafe content fails closed.
 * - Soft-demand / excess / conflict templates require grounded condition support.
 */

import {
  isWatchPurchaseImplicationText,
  assessBriefNextStepPolicy,
} from "@/lib/decision-brief/next-step";

import {
  isKnown,
  knownNumberOrNull,
} from "@/lib/decision-brief/fields";

import type {
  BriefClaimValidationResult,
  DecisionBriefActionType,
  DecisionBriefClaim,
  DecisionBriefClaimKind,
  DecisionBriefEvidenceFieldKey,
  DecisionBriefGroundingInput,
  DecisionBriefNextStepCode,
  DecisionBriefRejectionCode,
} from "@/lib/decision-brief/types";

export const AI_BRIEF_SEMANTIC_CLAIMS_PROFILE_VERSION =
  "ai-brief-semantic-claims-v1" as const;

/**
 * E3.2 wires the profile. Merchant ai_validated delivery remains forbidden
 * until a later slice explicitly disables forceDeterministicFallback.
 */
export const AI_BRIEF_SEMANTIC_PROFILE_APPROVED =
  true as const;

export type SemanticProseSections = {
  whyNowSummary: string;
  uncertaintySummary: string;
  nextStepSummary: string;
};

export type SemanticClaimsEvaluationInput = {
  grounding: DecisionBriefGroundingInput;
  prose: SemanticProseSections;
  claims: readonly DecisionBriefClaim[];
  suggestedNextStepCode?: DecisionBriefNextStepCode;
  evidenceEmphasis?: readonly DecisionBriefEvidenceFieldKey[];
  groundingHash?: string;
  expectedGroundingHash?: string;
};

export type SemanticTemplateSection =
  | "whyNow"
  | "uncertainty"
  | "nextStep";

export type SemanticTemplateDefinition = {
  id: string;
  section: SemanticTemplateSection;
  actionTypes:
    | readonly DecisionBriefActionType[]
    | "*";
  requiredClaimKind: DecisionBriefClaimKind;
  /**
   * Strict pattern. Slots: {product}, {availableQuantity}, {reorderPointUnits},
   * {incomingQuantity}, {recommendedQuantity}, {fieldLabel:evidenceKey}
   */
  pattern: string;
  requiredKnownFields?: readonly DecisionBriefEvidenceFieldKey[];
  requiresRecommendedQuantityKnown?: boolean;
  /**
   * Bound claim.evidenceRefs must include ≥1 of these grounded refs.
   * An unrelated claim/ref elsewhere does not satisfy this.
   */
  requiredEvidenceRefAnyOf?: readonly string[];
  /**
   * Grounding.reasonCodes must include ≥1 of these for condition-bearing templates.
   */
  requiredReasonCodeAnyOf?: readonly string[];
  /**
   * Bound claim must cite ≥1 grounding.reasonCodes entry.
   */
  requireGroundedReasonCodeRef?: boolean;
  requiredNextStepCodes?: readonly DecisionBriefNextStepCode[];
};

const EVIDENCE_FIELD_LABELS: Record<
  DecisionBriefEvidenceFieldKey,
  string
> = {
  availableQuantity: "Available quantity",
  incomingQuantity: "Incoming quantity",
  demandVelocity: "Demand velocity",
  daysOfStock: "Days of stock",
  leadTimeDays: "Lead time",
  safetyStockUnits: "Safety stock",
  reorderPointUnits: "Reorder point",
  targetStockUnits: "Target stock",
  inventoryAgeDays: "Inventory age",
  forecastExpectedDemandUnits: "Forecast demand",
  dataQualityScore: "Data quality",
};

const SECTION_CLAIM_KIND: Record<
  SemanticTemplateSection,
  DecisionBriefClaimKind
> = {
  whyNow: "why_now_statement",
  uncertainty: "uncertainty_statement",
  nextStep: "next_step_statement",
};

/**
 * Strict allowlisted catalog for ai-brief-semantic-claims-v1.
 */
export const AI_BRIEF_SEMANTIC_TEMPLATES_V1: readonly SemanticTemplateDefinition[] = [
  {
    id: "why.reorder.below_rop",
    section: "whyNow",
    actionTypes: [
      "REORDER",
    ],
    requiredClaimKind: "why_now_statement",
    pattern:
      "{product} is below reorder point ({reorderPointUnits}) with {availableQuantity} available.",
    requiredKnownFields: [
      "reorderPointUnits",
      "availableQuantity",
    ],
    requiredEvidenceRefAnyOf: [
      "reorderPointUnits",
      "availableQuantity",
      "below_reorder_point",
    ],
    requiredReasonCodeAnyOf: [
      "below_reorder_point",
    ],
  },
  {
    id: "why.reorder.quantity",
    section: "whyNow",
    actionTypes: [
      "REORDER",
    ],
    requiredClaimKind: "why_now_statement",
    pattern:
      "Recommended quantity is {recommendedQuantity}.",
    requiresRecommendedQuantityKnown: true,
    requiredEvidenceRefAnyOf: [
      "availableQuantity",
      "reorderPointUnits",
      "below_reorder_point",
    ],
  },
  {
    id: "why.reduce.excess",
    section: "whyNow",
    actionTypes: [
      "REDUCE",
    ],
    requiredClaimKind: "why_now_statement",
    pattern:
      "{product} shows excess coverage with {availableQuantity} available; reduce incoming exposure.",
    requiredKnownFields: [
      "availableQuantity",
    ],
    requiredEvidenceRefAnyOf: [
      "excess_days_of_stock",
      "aging_inventory",
    ],
    requiredReasonCodeAnyOf: [
      "excess_days_of_stock",
      "aging_inventory",
    ],
  },
  {
    id: "why.promote.soft_demand",
    section: "whyNow",
    actionTypes: [
      "PROMOTE",
    ],
    requiredClaimKind: "why_now_statement",
    pattern:
      "{product} shows soft demand with {availableQuantity} available; plan a promotion to clear stock.",
    requiredKnownFields: [
      "availableQuantity",
    ],
    requiredEvidenceRefAnyOf: [
      "soft_demand",
      "seasonal_clearance",
    ],
    requiredReasonCodeAnyOf: [
      "soft_demand",
      "seasonal_clearance",
    ],
  },
  {
    id: "why.watch.conflict",
    section: "whyNow",
    actionTypes: [
      "WATCH",
    ],
    requiredClaimKind: "why_now_statement",
    pattern:
      "Signals conflict for {product}; StoreAgent is watching rather than intervening.",
    requireGroundedReasonCodeRef: true,
  },
  {
    id: "unc.watch.primary",
    section: "uncertainty",
    actionTypes: [
      "WATCH",
    ],
    requiredClaimKind: "uncertainty_statement",
    pattern:
      "Uncertainty is primary; StoreAgent is watching rather than intervening.",
    requireGroundedReasonCodeRef: true,
  },
  {
    id: "unc.none",
    section: "uncertainty",
    actionTypes: [
      "REORDER",
      "REDUCE",
      "PROMOTE",
    ],
    requiredClaimKind: "uncertainty_statement",
    pattern:
      "No material uncertainty flagged.",
  },
  {
    id: "unc.unknown_field.availableQuantity",
    section: "uncertainty",
    actionTypes: "*",
    requiredClaimKind: "uncertainty_statement",
    pattern:
      "{fieldLabel:availableQuantity} is unknown, so certainty stays limited.",
    requiredEvidenceRefAnyOf: [
      "availableQuantity",
    ],
  },
  {
    id: "unc.unknown_field.incomingQuantity",
    section: "uncertainty",
    actionTypes: "*",
    requiredClaimKind: "uncertainty_statement",
    pattern:
      "{fieldLabel:incomingQuantity} is unknown, so certainty stays limited.",
    requiredEvidenceRefAnyOf: [
      "incomingQuantity",
    ],
  },
  {
    id: "next.reorder.review",
    section: "nextStep",
    actionTypes: [
      "REORDER",
    ],
    requiredClaimKind: "next_step_statement",
    pattern:
      "Review the recommended reorder quantity before taking any further step.",
    requiredNextStepCodes: [
      "review_reorder",
      "edit_reorder_quantity",
      "no_execution",
    ],
    requiredEvidenceRefAnyOf: [
      "availableQuantity",
      "reorderPointUnits",
      "below_reorder_point",
    ],
  },
  {
    id: "next.reduce.exposure",
    section: "nextStep",
    actionTypes: [
      "REDUCE",
    ],
    requiredClaimKind: "next_step_statement",
    pattern:
      "Reduce additional incoming exposure for this SKU.",
    requiredNextStepCodes: [
      "reduce_incoming_exposure",
      "no_execution",
    ],
    requiredEvidenceRefAnyOf: [
      "excess_days_of_stock",
      "aging_inventory",
      "availableQuantity",
    ],
  },
  {
    id: "next.promote.plan",
    section: "nextStep",
    actionTypes: [
      "PROMOTE",
    ],
    requiredClaimKind: "next_step_statement",
    pattern:
      "Plan a promotion to clear aging or soft-demand stock.",
    requiredNextStepCodes: [
      "plan_promotion",
      "no_execution",
    ],
    requiredEvidenceRefAnyOf: [
      "soft_demand",
      "seasonal_clearance",
      "availableQuantity",
    ],
  },
  {
    id: "next.watch.investigate",
    section: "nextStep",
    actionTypes: [
      "WATCH",
    ],
    requiredClaimKind: "next_step_statement",
    pattern:
      "Investigate conflicting or incomplete signals before intervening.",
    requiredNextStepCodes: [
      "investigate_watch",
      "dismiss_watch",
      "no_execution",
    ],
    requireGroundedReasonCodeRef: true,
  },
] as const;

const FINANCIAL_NEEDLES = [
  "roi",
  "cash at risk",
  "revenue at risk",
  "prevented stockout",
  "moq savings",
  "estimatedcashatrisk",
  "estimatedrevenueatrisk",
] as const;

const INJECTION_NEEDLES = [
  "ignore previous instructions",
  "ignore all prior",
  "system prompt",
  "tool_call",
  "tool-call",
  "organizationid=",
  "organization_id=",
  "enable ai for org",
  "exfiltrate",
  "api key",
  "service_role",
  "](http://",
  "](https://",
  "![](",
] as const;

const FRESHNESS_CLAIM_NEEDLES = [
  "as of ",
  "observed at",
  "updated today",
  "fresh inventory",
  "fresh data",
  "current as of",
  "snapshot at",
] as const;

const ACTION_LABELS: Record<
  DecisionBriefActionType,
  string
> = {
  REORDER: "Reorder",
  REDUCE: "Reduce",
  PROMOTE: "Promote",
  WATCH: "Watch",
};

/**
 * Untrusted text-slot policy for {product} and future free-text slots.
 * Rejects sentence boundaries, markdown/instruction markers, and digits
 * that could bypass numeric/injection scanners via template insertion.
 */
export function isSafeSemanticTextSlot(
  value: string,
): boolean {
  const trimmed =
    value.trim();

  if (
    trimmed.length === 0 ||
    trimmed.length > 120
  ) {
    return false;
  }

  // Letters / marks / spaces / limited connectors only — no digits or punctuation.
  if (
    !/^[\p{L}\p{M}]+(?:[ '\-&][\p{L}\p{M}]+)*$/u.test(
      trimmed,
    )
  ) {
    return false;
  }

  const lower =
    trimmed.toLowerCase();

  for (
    const needle of INJECTION_NEEDLES
  ) {
    if (
      lower.includes(needle)
    ) {
      return false;
    }
  }

  // Must remain a single sentence atom after normalization.
  if (
    splitSemanticSentences(
      trimmed,
    ).length !== 1
  ) {
    return false;
  }

  return true;
}

function pushUnique(
  reasons: DecisionBriefRejectionCode[],
  code: DecisionBriefRejectionCode,
): void {
  if (
    !reasons.includes(code)
  ) {
    reasons.push(code);
  }
}

export function normalizeSemanticProse(
  text: string,
): string {
  return text
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Split merchant prose into non-empty sentences.
 * Periods inside numbers (e.g. 1.5) are preserved by only splitting on ". ".
 */
export function splitSemanticSentences(
  text: string,
): string[] {
  const normalized =
    normalizeSemanticProse(
      text,
    );

  if (
    normalized.length === 0
  ) {
    return [];
  }

  return normalized
    .split(
      /(?<=\.)\s+/,
    )
    .map(
      (part) =>
        part.trim(),
    )
    .filter(
      (part) =>
        part.length > 0,
    );
}

function formatNumberSlot(
  value: number,
): string {
  if (
    Object.is(value, -0)
  ) {
    return "0";
  }

  return String(
    value,
  );
}

function templateApplicable(
  template: SemanticTemplateDefinition,
  actionType: DecisionBriefActionType,
): boolean {
  if (
    template.actionTypes === "*"
  ) {
    return true;
  }

  return template.actionTypes.includes(
    actionType,
  );
}

function groundingSupportsTemplateConditions(
  template: SemanticTemplateDefinition,
  grounding: DecisionBriefGroundingInput,
): boolean {
  if (
    template.requiredReasonCodeAnyOf &&
    template.requiredReasonCodeAnyOf.length > 0
  ) {
    const codes =
      new Set(
        grounding.reasonCodes,
      );

    if (
      !template.requiredReasonCodeAnyOf.some(
        (code) =>
          codes.has(code),
      )
    ) {
      return false;
    }
  }

  if (
    template.requireGroundedReasonCodeRef &&
    grounding.reasonCodes.length === 0
  ) {
    return false;
  }

  return true;
}

function isGroundedEvidenceRef(
  grounding: DecisionBriefGroundingInput,
  ref: string,
): boolean {
  if (
    grounding.reasonCodes.includes(ref) ||
    grounding.confidenceReasonCodes.includes(ref)
  ) {
    return true;
  }

  if (
    ref in grounding.evidence
  ) {
    const field =
      grounding.evidence[
        ref as DecisionBriefEvidenceFieldKey
      ];

    // Known evidence keys are always grounded for ref membership.
    // Unknown keys are only valid for uncertainty templates (caller checks).
    return field !== undefined;
  }

  return false;
}

function claimSatisfiesTemplateEvidence(
  template: SemanticTemplateDefinition,
  claim: DecisionBriefClaim,
  grounding: DecisionBriefGroundingInput,
): boolean {
  if (
    claim.kind !== template.requiredClaimKind
  ) {
    return false;
  }

  if (
    template.requiredEvidenceRefAnyOf &&
    template.requiredEvidenceRefAnyOf.length > 0
  ) {
    const hit =
      template.requiredEvidenceRefAnyOf.some(
        (ref) =>
          claim.evidenceRefs.includes(ref) &&
          isGroundedEvidenceRef(
            grounding,
            ref,
          ),
      );

    if (
      !hit
    ) {
      return false;
    }
  }

  if (
    template.requireGroundedReasonCodeRef
  ) {
    const hit =
      claim.evidenceRefs.some(
        (ref) =>
          grounding.reasonCodes.includes(ref),
      );

    if (
      !hit
    ) {
      return false;
    }
  }

  return true;
}

function renderTemplate(
  template: SemanticTemplateDefinition,
  grounding: DecisionBriefGroundingInput,
): string | null {
  if (
    !templateApplicable(
      template,
      grounding.actionType,
    )
  ) {
    return null;
  }

  if (
    !groundingSupportsTemplateConditions(
      template,
      grounding,
    )
  ) {
    return null;
  }

  if (
    template.requiresRecommendedQuantityKnown &&
    !isKnown(
      grounding.recommendedQuantity,
    )
  ) {
    return null;
  }

  if (
    template.requiredKnownFields
  ) {
    for (
      const field of template.requiredKnownFields
    ) {
      if (
        grounding.evidence[field].state !== "known"
      ) {
        return null;
      }
    }
  }

  if (
    template.pattern.includes(
      "{product}",
    ) &&
    !isSafeSemanticTextSlot(
      grounding.productTitle,
    )
  ) {
    return null;
  }

  let rendered =
    template.pattern;

  rendered =
    rendered.replaceAll(
      "{product}",
      grounding.productTitle.trim(),
    );

  const numberSlots: {
    token: string;
    value: number | null;
  }[] = [
    {
      token: "{availableQuantity}",
      value: knownNumberOrNull(
        grounding.evidence.availableQuantity,
      ),
    },
    {
      token: "{reorderPointUnits}",
      value: knownNumberOrNull(
        grounding.evidence.reorderPointUnits,
      ),
    },
    {
      token: "{incomingQuantity}",
      value: knownNumberOrNull(
        grounding.evidence.incomingQuantity,
      ),
    },
    {
      token: "{recommendedQuantity}",
      value: knownNumberOrNull(
        grounding.recommendedQuantity,
      ),
    },
  ];

  for (
    const slot of numberSlots
  ) {
    if (
      !rendered.includes(
        slot.token,
      )
    ) {
      continue;
    }

    if (
      slot.value === null
    ) {
      return null;
    }

    rendered =
      rendered.replaceAll(
        slot.token,
        formatNumberSlot(
          slot.value,
        ),
      );
  }

  const fieldLabelMatch =
    /\{fieldLabel:([a-zA-Z]+)\}/.exec(
      rendered,
    );

  if (
    fieldLabelMatch
  ) {
    const fieldKey =
      fieldLabelMatch[1] as DecisionBriefEvidenceFieldKey;

    if (
      !(
        fieldKey in EVIDENCE_FIELD_LABELS
      )
    ) {
      return null;
    }

    if (
      grounding.evidence[fieldKey].state !== "unknown"
    ) {
      return null;
    }

    rendered =
      rendered.replaceAll(
        `{fieldLabel:${fieldKey}}`,
        EVIDENCE_FIELD_LABELS[fieldKey],
      );
  }

  if (
    /\{[a-zA-Z]/.test(
      rendered,
    )
  ) {
    return null;
  }

  const normalized =
    normalizeSemanticProse(
      rendered,
    );

  // Rendered template must stay a single sentence (no slot-injected boundaries).
  if (
    splitSemanticSentences(
      normalized,
    ).length !== 1
  ) {
    return null;
  }

  return normalized;
}

function findBindingClaim(
  sentence: string,
  template: SemanticTemplateDefinition,
  grounding: DecisionBriefGroundingInput,
  claims: readonly DecisionBriefClaim[],
  consumedClaimIds: Set<string>,
): DecisionBriefClaim | null {
  const normalizedSentence =
    normalizeSemanticProse(
      sentence,
    );

  for (
    const claim of claims
  ) {
    if (
      consumedClaimIds.has(
        claim.claimId,
      )
    ) {
      continue;
    }

    if (
      claim.kind !== SECTION_CLAIM_KIND[template.section]
    ) {
      continue;
    }

    if (
      normalizeSemanticProse(
        claim.text,
      ) !== normalizedSentence
    ) {
      continue;
    }

    if (
      !claimSatisfiesTemplateEvidence(
        template,
        claim,
        grounding,
      )
    ) {
      continue;
    }

    return claim;
  }

  return null;
}

function sentenceMatchesWithClaim(
  sentence: string,
  template: SemanticTemplateDefinition,
  grounding: DecisionBriefGroundingInput,
  nextStepCode: DecisionBriefNextStepCode | undefined,
  claims: readonly DecisionBriefClaim[],
  consumedClaimIds: Set<string>,
): DecisionBriefClaim | null {
  const expected =
    renderTemplate(
      template,
      grounding,
    );

  if (
    expected === null
  ) {
    return null;
  }

  if (
    normalizeSemanticProse(
      sentence,
    ) !== expected
  ) {
    return null;
  }

  if (
    template.requiredNextStepCodes &&
    (
      nextStepCode === undefined ||
      !template.requiredNextStepCodes.includes(
        nextStepCode,
      )
    )
  ) {
    return null;
  }

  return findBindingClaim(
    sentence,
    template,
    grounding,
    claims,
    consumedClaimIds,
  );
}

function collectKnownNumbers(
  grounding: DecisionBriefGroundingInput,
): Set<string> {
  const values =
    new Set<string>();

  const push =
    (
      value: number | null,
    ) => {
      if (
        value === null
      ) {
        return;
      }

      values.add(
        formatNumberSlot(
          value,
        ),
      );
    };

  push(
    knownNumberOrNull(
      grounding.recommendedQuantity,
    ),
  );

  for (
    const field of Object.values(
      grounding.evidence,
    )
  ) {
    if (
      field.state === "known"
    ) {
      push(
        field.value,
      );
    }
  }

  values.add(
    String(
      grounding.reasonCodes.length,
    ),
  );

  return values;
}

function extractProseNumbers(
  text: string,
): string[] {
  const matches =
    text.match(
      /-?\d+(?:\.\d+)?/g,
    );

  return matches ?? [];
}

function proseMentionsWrongAction(
  text: string,
  actionType: DecisionBriefActionType,
): boolean {
  const normalized =
    text.toLowerCase();

  for (
    const [type, label] of Object.entries(
      ACTION_LABELS,
    ) as [DecisionBriefActionType, string][]
  ) {
    if (
      type === actionType
    ) {
      continue;
    }

    const pattern =
      new RegExp(
        `\\b${label.toLowerCase()}\\b`,
        "i",
      );

    if (
      pattern.test(
        normalized,
      )
    ) {
      return true;
    }
  }

  return false;
}

function scanProseNeedles(
  text: string,
  reasons: DecisionBriefRejectionCode[],
  grounding: DecisionBriefGroundingInput,
): void {
  const normalized =
    text.toLowerCase().replace(
      /\s+/g,
      " ",
    );

  for (
    const needle of FINANCIAL_NEEDLES
  ) {
    if (
      normalized.includes(needle)
    ) {
      pushUnique(
        reasons,
        "AI_UNSUPPORTED_FINANCIAL_CLAIM",
      );
      break;
    }
  }

  if (
    /\b\d+(\.\d+)?%\s*confident\b/.test(
      normalized,
    ) ||
    /\bconfidence\s*\d+(\.\d+)?%\b/.test(
      normalized,
    ) ||
    /\b\d+(\.\d+)?%\s*confidence\b/.test(
      normalized,
    )
  ) {
    pushUnique(
      reasons,
      "AI_UNSUPPORTED_CONFIDENCE_PERCENT",
    );
  }

  for (
    const needle of INJECTION_NEEDLES
  ) {
    if (
      normalized.includes(needle)
    ) {
      pushUnique(
        reasons,
        "AI_PROMPT_INJECTION_SUSPECT",
      );
      break;
    }
  }

  if (
    grounding.actionType === "WATCH" &&
    isWatchPurchaseImplicationText(
      text,
    )
  ) {
    pushUnique(
      reasons,
      "AI_WATCH_PURCHASE_IMPLICATION",
    );
  }

  const freshnessUnknown =
    grounding.decisionAsOf.state === "unknown" ||
    grounding.freshness.status === "unknown";

  if (
    freshnessUnknown
  ) {
    for (
      const needle of FRESHNESS_CLAIM_NEEDLES
    ) {
      if (
        normalized.includes(needle)
      ) {
        pushUnique(
          reasons,
          "AI_PROSE_SEMANTIC_VALIDATION_REJECTED",
        );
        break;
      }
    }
  }

  if (
    proseMentionsWrongAction(
      text,
      grounding.actionType,
    )
  ) {
    pushUnique(
      reasons,
      "AI_PROSE_SEMANTIC_VALIDATION_REJECTED",
    );
  }

  const knownNumbers =
    collectKnownNumbers(
      grounding,
    );

  for (
    const raw of extractProseNumbers(
      text,
    )
  ) {
    const asNumber =
      Number(
        raw,
      );

    if (
      !Number.isFinite(
        asNumber,
      )
    ) {
      pushUnique(
        reasons,
        "AI_PROSE_SEMANTIC_VALIDATION_REJECTED",
      );
      continue;
    }

    const canonical =
      formatNumberSlot(
        asNumber,
      );

    if (
      !knownNumbers.has(
        canonical,
      ) &&
      !knownNumbers.has(
        raw,
      )
    ) {
      pushUnique(
        reasons,
        "AI_PROSE_SEMANTIC_VALIDATION_REJECTED",
      );
    }
  }
}

function assessTemplateCoverage(
  section: SemanticTemplateSection,
  text: string,
  grounding: DecisionBriefGroundingInput,
  nextStepCode: DecisionBriefNextStepCode | undefined,
  claims: readonly DecisionBriefClaim[],
  consumedClaimIds: Set<string>,
  reasons: DecisionBriefRejectionCode[],
): void {
  const sentences =
    splitSemanticSentences(
      text,
    );

  for (
    const sentence of sentences
  ) {
    let bound: DecisionBriefClaim | null =
      null;

    for (
      const template of AI_BRIEF_SEMANTIC_TEMPLATES_V1
    ) {
      if (
        template.section !== section
      ) {
        continue;
      }

      const claim =
        sentenceMatchesWithClaim(
          sentence,
          template,
          grounding,
          nextStepCode,
          claims,
          consumedClaimIds,
        );

      if (
        claim
      ) {
        bound = claim;
        break;
      }
    }

    if (
      !bound
    ) {
      pushUnique(
        reasons,
        "AI_PROSE_SEMANTIC_VALIDATION_REJECTED",
      );
      return;
    }

    consumedClaimIds.add(
      bound.claimId,
    );
  }
}

/**
 * Deterministic semantic profile assessment for ai-brief-semantic-claims-v1.
 */
export function assessAiBriefSemanticClaimsV1(
  input: SemanticClaimsEvaluationInput,
): BriefClaimValidationResult {
  const reasons: DecisionBriefRejectionCode[] = [];
  const {
    grounding,
    prose,
    claims,
  } = input;

  // Untrusted product / text slots: fail closed before template acceptance.
  if (
    !isSafeSemanticTextSlot(
      grounding.productTitle,
    )
  ) {
    const lower =
      grounding.productTitle.toLowerCase();

    if (
      INJECTION_NEEDLES.some(
        (needle) =>
          lower.includes(needle),
      )
    ) {
      pushUnique(
        reasons,
        "AI_PROMPT_INJECTION_SUSPECT",
      );
    }

    pushUnique(
      reasons,
      "AI_PROSE_SEMANTIC_VALIDATION_REJECTED",
    );
  }

  // S1 — reproducibility binding only.
  if (
    input.groundingHash !== undefined &&
    input.expectedGroundingHash !== undefined &&
    input.groundingHash !== input.expectedGroundingHash
  ) {
    pushUnique(
      reasons,
      "CLAIM_EVIDENCE_UNTRACED",
    );
  }

  // S7 — next-step policy.
  if (
    input.suggestedNextStepCode !== undefined
  ) {
    const policy =
      assessBriefNextStepPolicy(
        grounding.actionType,
        input.suggestedNextStepCode,
      );

    if (
      !policy.ok
    ) {
      for (
        const code of policy.reasons
      ) {
        pushUnique(
          reasons,
          code,
        );
      }
    }
  }

  // S11 — evidenceEmphasis ⊆ known evidence keys.
  if (
    input.evidenceEmphasis
  ) {
    for (
      const key of input.evidenceEmphasis
    ) {
      if (
        !(
          key in grounding.evidence
        ) ||
        grounding.evidence[key].state !== "known"
      ) {
        pushUnique(
          reasons,
          "CLAIM_EVIDENCE_UNTRACED",
        );
        break;
      }
    }
  }

  const consumedClaimIds =
    new Set<string>();

  const sections: {
    section: SemanticTemplateSection;
    text: string;
  }[] = [
    {
      section: "whyNow",
      text: prose.whyNowSummary,
    },
    {
      section: "uncertainty",
      text: prose.uncertaintySummary,
    },
    {
      section: "nextStep",
      text: prose.nextStepSummary,
    },
  ];

  for (
    const {
      section,
      text,
    } of sections
  ) {
    scanProseNeedles(
      text,
      reasons,
      grounding,
    );

    assessTemplateCoverage(
      section,
      text,
      grounding,
      input.suggestedNextStepCode,
      claims,
      consumedClaimIds,
      reasons,
    );
  }

  if (
    splitSemanticSentences(
      prose.whyNowSummary,
    ).length === 0 ||
    splitSemanticSentences(
      prose.nextStepSummary,
    ).length === 0
  ) {
    pushUnique(
      reasons,
      "AI_PROSE_SEMANTIC_VALIDATION_REJECTED",
    );
  }

  if (
    reasons.length > 0
  ) {
    return {
      ok: false,
      reasons,
      detail: reasons.join(", "),
    };
  }

  return {
    ok: true,
  };
}

/**
 * Build exact template-rendered prose for a grounding when required fields exist.
 * Returns null if a full why/next trio cannot be rendered (incl. unsafe product).
 */
export function buildTemplatedSemanticProse(
  grounding: DecisionBriefGroundingInput,
  nextStepCode: DecisionBriefNextStepCode,
): SemanticProseSections | null {
  if (
    !isSafeSemanticTextSlot(
      grounding.productTitle,
    )
  ) {
    return null;
  }

  const pick = (
    section: SemanticTemplateSection,
  ): string | null => {
    for (
      const template of AI_BRIEF_SEMANTIC_TEMPLATES_V1
    ) {
      if (
        template.section !== section ||
        !templateApplicable(
          template,
          grounding.actionType,
        )
      ) {
        continue;
      }

      if (
        template.requiredNextStepCodes &&
        !template.requiredNextStepCodes.includes(
          nextStepCode,
        )
      ) {
        continue;
      }

      const rendered =
        renderTemplate(
          template,
          grounding,
        );

      if (
        rendered !== null
      ) {
        return rendered;
      }
    }

    return null;
  };

  const whyNow =
    pick(
      "whyNow",
    );
  const uncertainty =
    pick(
      "uncertainty",
    );
  const nextStep =
    pick(
      "nextStep",
    );

  if (
    whyNow === null ||
    uncertainty === null ||
    nextStep === null
  ) {
    return null;
  }

  return {
    whyNowSummary: whyNow,
    uncertaintySummary: uncertainty,
    nextStepSummary: nextStep,
  };
}

/**
 * Preferred evidence refs for a section given grounding + action templates.
 */
export function selectTemplatedEvidenceRefs(
  grounding: DecisionBriefGroundingInput,
  section: SemanticTemplateSection,
): string[] {
  const preferred: string[] = [];

  for (
    const template of AI_BRIEF_SEMANTIC_TEMPLATES_V1
  ) {
    if (
      template.section !== section ||
      !templateApplicable(
        template,
        grounding.actionType,
      )
    ) {
      continue;
    }

    if (
      !groundingSupportsTemplateConditions(
        template,
        grounding,
      )
    ) {
      continue;
    }

    if (
      template.requiredEvidenceRefAnyOf
    ) {
      for (
        const ref of template.requiredEvidenceRefAnyOf
      ) {
        if (
          isGroundedEvidenceRef(
            grounding,
            ref,
          ) &&
          !preferred.includes(ref)
        ) {
          preferred.push(ref);
        }
      }
    }

    if (
      template.requireGroundedReasonCodeRef
    ) {
      for (
        const code of grounding.reasonCodes
      ) {
        if (
          !preferred.includes(code)
        ) {
          preferred.push(code);
        }
      }
    }

    if (
      preferred.length > 0
    ) {
      break;
    }
  }

  if (
    preferred.length === 0 &&
    grounding.reasonCodes.length > 0
  ) {
    return grounding.reasonCodes.slice(0, 3);
  }

  return preferred.slice(0, 4);
}

export function evidenceFieldLabel(
  field: DecisionBriefEvidenceFieldKey,
): string {
  return EVIDENCE_FIELD_LABELS[field];
}
