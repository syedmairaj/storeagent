/**
 * M7.4e E1 — decision-brief-v1 shared types.
 *
 * Deterministic engines / fixtures own commercial truth.
 * AI may only explain after separate E3 + semantic validation approval.
 */

export const DECISION_BRIEF_SCHEMA_VERSION =
  "decision-brief-v1" as const;

export const DECISION_BRIEF_DEMO_ATTESTATION =
  "m7-synthetic-demonstration-v1" as const;

export const DECISION_BRIEF_AI_CLAIM_PROFILE =
  "ai-numeric-mutation-v1" as const;

export type DecisionBriefSchemaVersion =
  typeof DECISION_BRIEF_SCHEMA_VERSION;

export type DecisionBriefDemoAttestation =
  typeof DECISION_BRIEF_DEMO_ATTESTATION;

export type DecisionBriefMode =
  | "synthetic_demo"
  | "engine_bound";

export type DecisionBriefActionType =
  | "REORDER"
  | "REDUCE"
  | "PROMOTE"
  | "WATCH";

export type DecisionBriefPriority =
  | "critical"
  | "high"
  | "medium"
  | "low";

export type DecisionBriefConfidence =
  | "high"
  | "medium"
  | "low";

export type Known<T> = {
  state: "known";
  value: T;
};

export type Unknown = {
  state: "unknown";
  reasonCode?: string;
};

export type NotApplicable = {
  state: "not_applicable";
  reasonCode?: string;
};

export type Field<T> =
  | Known<T>
  | Unknown
  | NotApplicable;

export type DecisionBriefFreshnessStatus =
  | "fresh"
  | "aging"
  | "stale"
  | "unknown";

export type DecisionBriefEvidenceScope =
  | "controlled_fixture_only"
  | "synthetic_demonstration"
  | "production_bound"
  | "unknown";

export type DecisionBriefTrustClaims = {
  claimsMerchantFacing: boolean;
  claimsM7ProductionEligibility: boolean;
  algorithmApproved: boolean;
  isScoredMerchantDecision: boolean;
  claimsProductionForecastApproval: boolean;
  evidenceScope: DecisionBriefEvidenceScope;
};

export type DecisionBriefEvidenceFields = {
  availableQuantity: Field<number>;
  incomingQuantity: Field<number>;
  demandVelocity: Field<number>;
  daysOfStock: Field<number>;
  leadTimeDays: Field<number>;
  safetyStockUnits: Field<number>;
  reorderPointUnits: Field<number>;
  targetStockUnits: Field<number>;
  inventoryAgeDays: Field<number>;
  forecastExpectedDemandUnits: Field<number>;
  dataQualityScore: Field<number>;
};

export type DecisionBriefEvidenceFieldKey =
  keyof DecisionBriefEvidenceFields;

export interface DecisionBriefGroundingInput {
  schemaVersion: DecisionBriefSchemaVersion;
  briefMode: DecisionBriefMode;

  organizationId: string | null;
  storeId: string | null;
  locationId: string | null;
  variantId: string | null;
  productTitle: string;
  variantTitle: string;

  actionType: DecisionBriefActionType;
  priority: DecisionBriefPriority;
  confidence: DecisionBriefConfidence;
  recommendedQuantity: Field<number>;
  recommendedActionDate: Field<string>;

  reasonCodes: readonly string[];
  confidenceReasonCodes: readonly string[];

  evidence: DecisionBriefEvidenceFields;

  decisionAsOf: Field<string>;
  pinnedTimeZone: Field<string>;
  evidenceSourceTimestamps: {
    inventoryObservationAt: Field<string>;
    metricsComputedAt: Field<string>;
    forecastAsOf: Field<string>;
  };
  freshness: {
    status: DecisionBriefFreshnessStatus;
    staleReasonCodes: readonly string[];
  };

  demoAttestation?: DecisionBriefDemoAttestation;
  trustClaims: DecisionBriefTrustClaims;

  deterministicFallbackCopy?: {
    whyNow: string;
    suggestedNextStep: string;
  };
}

export type BriefGenerator =
  | "deterministic_fallback"
  | "ai_validated";

export type BriefValidationStatus =
  | "accepted"
  | "accepted_with_omissions"
  | "rejected_used_fallback";

export type DecisionBriefClaimKind =
  | "action_type"
  | "quantity"
  | "priority"
  | "confidence"
  | "evidence_fact"
  | "reason_code"
  | "why_now_statement"
  | "uncertainty_statement"
  | "next_step_statement";

export interface DecisionBriefClaim {
  claimId: string;
  kind: DecisionBriefClaimKind;
  text: string;
  structured?: {
    actionType?: DecisionBriefActionType;
    recommendedQuantity?: number | null;
    priority?: DecisionBriefPriority;
    confidence?: DecisionBriefConfidence;
    confidencePercent?: number;
    evidenceField?: DecisionBriefEvidenceFieldKey;
    evidenceValue?: number | null;
    reasonCodes?: readonly string[];
  };
  evidenceRefs: readonly string[];
}

export type DecisionBriefNextStepCode =
  | "review_reorder"
  | "edit_reorder_quantity"
  | "reduce_incoming_exposure"
  | "plan_promotion"
  | "investigate_watch"
  | "dismiss_watch"
  | "no_execution";

export type DecisionBriefRejectionCode =
  | "MISSING_ATTESTATION"
  | "INVALID_BRIEF_MODE"
  | "GROUNDING_INCOMPLETE"
  | "WATCH_REASON_CODES_EMPTY"
  | "QUANTITY_GROUNDING_INCONSISTENT"
  | "AI_PROSE_SEMANTIC_VALIDATION_REQUIRED"
  | "AI_PROSE_SEMANTIC_VALIDATION_REJECTED"
  | "STALE_EVIDENCE"
  | "CONTRADICTORY_EVIDENCE"
  | "AI_UNAVAILABLE"
  | "AI_TIMEOUT"
  | "AI_UNSUPPORTED_SHAPE"
  | "AI_NUMERIC_MUTATION"
  | "AI_UNSUPPORTED_CONFIDENCE_PERCENT"
  | "AI_FABRICATED_REASON_CODE"
  | "AI_UNSUPPORTED_FINANCIAL_CLAIM"
  | "AI_WATCH_PURCHASE_IMPLICATION"
  | "AI_PROMPT_INJECTION_SUSPECT"
  | "CLAIM_EVIDENCE_UNTRACED"
  | "TRUST_CLAIMS_INVALID";

export interface DecisionBriefV1 {
  schemaVersion: DecisionBriefSchemaVersion;
  briefId: string;
  briefMode: DecisionBriefMode;
  generator: BriefGenerator;
  validationStatus: BriefValidationStatus;
  generatedAt: string;

  recommendation: {
    actionType: DecisionBriefActionType;
    label: string;
    productTitle: string;
    variantTitle: string;
    priority: DecisionBriefPriority;
    recommendedQuantity: Field<number>;
    recommendedActionDate: Field<string>;
  };

  whyNow: {
    summary: string;
    claims: readonly DecisionBriefClaim[];
  };

  evidence: {
    keyFacts: readonly {
      field: string;
      label: string;
      display: string;
      fieldState: "known" | "unknown" | "not_applicable";
    }[];
    fullEvidenceAvailable: boolean;
  };

  confidence: {
    level: DecisionBriefConfidence;
    reasonCodes: readonly string[];
    displayNotes: readonly string[];
  };

  uncertainty: {
    hasMaterialUncertainty: boolean;
    summary: string;
    codes: readonly string[];
    claims: readonly DecisionBriefClaim[];
  };

  suggestedNextStep: {
    code: DecisionBriefNextStepCode;
    summary: string;
    claims: readonly DecisionBriefClaim[];
  };

  humanControls: {
    demoPrimaryInteractionAllowed: boolean;
    demoDismissAllowed: boolean;
    demoEditQuantityAllowed: boolean;
    analystViewOnly: boolean;
    demoNoSaveRequired: boolean;
    productionApprovalEligible: boolean;
    controlCopy: {
      primaryLabel: string;
      dismissLabel: string;
      helperText: string;
    };
  };

  provenance: {
    demoAttestation?: DecisionBriefDemoAttestation;
    decisionAsOf: Field<string>;
    freshnessStatus: DecisionBriefFreshnessStatus;
    trustClaims: DecisionBriefTrustClaims;
    algorithmVersion: string;
    ai?: {
      provider: string;
      model: string;
      promptVersion: string;
      latencyMs: number;
      inputTokenEstimate?: number;
      outputTokenEstimate?: number;
    };
  };

  rejection?: {
    reasons: readonly DecisionBriefRejectionCode[];
    detail: string;
  };
}

export type GroundingValidationResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      reasons: readonly DecisionBriefRejectionCode[];
      detail: string;
    };

export type BriefClaimValidationResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      reasons: readonly DecisionBriefRejectionCode[];
      detail: string;
    };

export type DeterministicFallbackBuildResult =
  | {
      ok: true;
      brief: DecisionBriefV1;
    }
  | {
      ok: false;
      reasons: readonly DecisionBriefRejectionCode[];
      detail: string;
    };
