/**
 * M7.4e E1 — Decision Brief schemas, demo grounding, validation, fallback.
 * No LLM provider. No UI. No production approval wiring.
 */

export {
  known,
  unknown,
  notApplicable,
  isKnown,
  isUnknown,
  isNotApplicable,
  numberFieldFromNullable,
  stringFieldFromNullable,
  fieldDisplay,
  knownNumberOrNull,
} from "@/lib/decision-brief/fields";

export {
  DECISION_BRIEF_SCHEMA_VERSION,
  DECISION_BRIEF_DEMO_ATTESTATION,
  DECISION_BRIEF_AI_CLAIM_PROFILE,
  type DecisionBriefSchemaVersion,
  type DecisionBriefDemoAttestation,
  type DecisionBriefMode,
  type DecisionBriefActionType,
  type DecisionBriefPriority,
  type DecisionBriefConfidence,
  type Known,
  type Unknown,
  type NotApplicable,
  type Field,
  type DecisionBriefFreshnessStatus,
  type DecisionBriefEvidenceScope,
  type DecisionBriefTrustClaims,
  type DecisionBriefEvidenceFields,
  type DecisionBriefEvidenceFieldKey,
  type DecisionBriefGroundingInput,
  type BriefGenerator,
  type BriefValidationStatus,
  type DecisionBriefClaimKind,
  type DecisionBriefClaim,
  type DecisionBriefNextStepCode,
  type DecisionBriefRejectionCode,
  type DecisionBriefV1,
  type GroundingValidationResult,
  type BriefClaimValidationResult,
  type DeterministicFallbackBuildResult,
} from "@/lib/decision-brief/types";

export {
  mapDemoActionToGrounding,
  demoAttestationIsValid,
  demoActionMatchesTrustedFixture,
  type MapDemoActionToGroundingOptions,
} from "@/lib/decision-brief/map-demo-action";

export {
  validateGrounding,
  isEditableReorderQuantity,
} from "@/lib/decision-brief/validate-grounding";

export {
  validateBriefClaims,
  assessAiProseSemanticGate,
  validateNextStepAgainstGrounding,
  groundingAllowedEvidenceRefs,
  groundingAllowedUncertaintyEvidenceRefs,
  groundingKnownEvidenceFieldKeys,
  groundingUnknownEvidenceFieldKeys,
  groundingToNumericTruthSnapshot,
  type BriefNumericTruthSnapshot,
} from "@/lib/decision-brief/validate-claims";

export {
  buildDeterministicFallbackBrief,
  type BuildDeterministicFallbackBriefOptions,
} from "@/lib/decision-brief/fallback-brief";

export {
  composeDemoDecisionBrief,
  type ComposeDemoDecisionBriefOptions,
  type ComposeDemoDecisionBriefResult,
} from "@/lib/decision-brief/compose-demo-brief";

export {
  defaultNextStepCode,
  defaultNextStepSummary,
  actionTypeLabel,
  assessBriefNextStepPolicy,
  isWatchPurchaseImplicationText,
} from "@/lib/decision-brief/next-step";

export {
  selectKeyEvidenceFacts,
  formatQuantityFieldDisplay,
} from "@/lib/decision-brief/key-evidence";
