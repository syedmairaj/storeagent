/**
 * AI-INV-1 — Grounded Inventory Explainer contracts.
 * Deterministic evidence owns numbers; AI may summarize only.
 */

export const INVENTORY_EXPLAINER_EVIDENCE_VERSION =
  "inventory-explainer-evidence-v1" as const;

export const INVENTORY_EXPLAINER_ANSWER_VERSION =
  "inventory-explainer-answer-v1" as const;

export const INVENTORY_EXPLAINER_PROMPT_VERSION =
  "inventory-explainer-prompt-v1" as const;

export const INVENTORY_EXPLAINER_DEFAULT_TIMEOUT_MS =
  2500 as const;

export const INVENTORY_EXPLAINER_DEFAULT_MAX_INPUT_TOKENS =
  2048 as const;

export const INVENTORY_EXPLAINER_DEFAULT_MAX_OUTPUT_TOKENS =
  512 as const;

/** Soft per-org daily token budget (process-local). */
export const INVENTORY_EXPLAINER_DEFAULT_DAILY_TOKEN_BUDGET =
  50_000 as const;

export const EVIDENCE_HASH_PREFIX =
  "sha256:" as const;

export const INVENTORY_EXPLAINER_QUESTION_IDS = [
  "why_flagged",
  "sales_rate_meaning",
  "cover_unavailable",
  "missing_data",
  "verify_before_replenishing",
] as const;

export type InventoryExplainerQuestionId =
  (typeof INVENTORY_EXPLAINER_QUESTION_IDS)[number];

export type InventoryExplainerQuestion = {
  id: InventoryExplainerQuestionId;
  label: string;
  /** Short helper shown under the button. */
  hint: string;
};

export type InventoryExplainerFactId =
  | "identity"
  | "available"
  | "observed_at"
  | "velocity"
  | "eligible_days"
  | "cover"
  | "cover_status"
  | "safety_stock"
  | "reorder_point"
  | "target_stock"
  | "planning_assumptions"
  | "incoming_trust"
  | "stock_condition"
  | "metric_provenance"
  | "missing"
  | "next_step";

export type InventoryExplainerFact = {
  id: InventoryExplainerFactId;
  label: string;
  value: string;
  source: string;
  /** ISO date or metric_date when known. */
  asOf?: string | null;
};

export type IncomingTrustClass =
  | "unknown"
  | "attested_complete"
  | "trusted_po_presence";

export type InventoryExplainerNextStepCode =
  | "refresh_stock"
  | "wait_metrics"
  | "activate_metrics"
  | "accumulate_history"
  | "reimport_known_qty"
  | "review_assumptions"
  | "attest_incoming"
  | "keep_evidence_current"
  | "abstain_insufficient"
  | "verify_availability"
  | "investigate_demand"
  | "confirm_metric_window";

export type InventoryExplainerNextStep = {
  code: InventoryExplainerNextStepCode;
  label: string;
};

/** AI-INV-1.1 situation id — mirrored from guidance-situation for DTO stability. */
export type InventoryExplainerGuidanceSituationId =
  | "recorded_oos_with_positive_sales"
  | "recorded_oos_without_positive_sales"
  | "in_stock_zero_observed_sales"
  | "in_stock_short_history"
  | "stale_stock_or_metrics"
  | "unknown_stock"
  | "unknown_or_missing_demand"
  | "missing_metrics"
  | "pending_metrics"
  | "low_cover_review"
  | "high_cover_review"
  | "in_stock_stable_review";

/**
 * Server-owned evidence snapshot. Never trust client-supplied copies as facts.
 */
export type InventoryExplainerEvidence = {
  schemaVersion: typeof INVENTORY_EXPLAINER_EVIDENCE_VERSION;
  evidenceHash: string;
  organizationId: string;
  storeId: string;
  locationId: string;
  variantId: string;
  grainKey: string;
  sku: string;
  /** Sanitized / length-capped for prompts — display title stays on UI. */
  productTitleSafe: string;
  storeName: string;
  locationName: string;
  stockObservationsStale: boolean;
  stockCondition: string;
  coverStatus: string;
  coverAvailability: "calculable" | "unavailable";
  metricIsHistorical: boolean;
  decisionEligibility: "unauthorized";
  incomingTrust: IncomingTrustClass;
  /** AI-INV-1.1 primary guidance situation for this grain. */
  guidanceSituationId: InventoryExplainerGuidanceSituationId;
  /** Merchant significance line from observed evidence only. */
  guidanceSignificance: string;
  /** Untested hypotheses (never confirmed causes). */
  untestedHypotheses: readonly string[];
  /** Situation-ranked contextual question ids. */
  rankedQuestionIds: readonly InventoryExplainerQuestionId[];
  facts: readonly InventoryExplainerFact[];
  missingLabels: readonly string[];
  /** Prioritized 1–3 next steps (SKU-specific). */
  nextSteps: readonly InventoryExplainerNextStep[];
  /** Allowlisted numeric/date literals for validation. */
  allowlistedLiterals: readonly string[];
};

export type InventoryExplainerCitation = {
  factId: InventoryExplainerFactId;
  label: string;
  value: string;
  source: string;
  asOf?: string | null;
};

export type InventoryExplainerAnswerStatus =
  | "answered"
  | "abstained"
  | "rejected"
  | "unavailable";

export type InventoryExplainerGenerator =
  | "deterministic"
  | "ai_validated"
  | "fallback_deterministic";

export type InventoryExplainerEnablementSource =
  | "disabled_default"
  | "test_injected"
  | "server_resolved_config";

export type InventoryExplainerAdapterId =
  | "offline_stub"
  | "recorded_replay"
  | "live_provider";

export type InventoryExplainerAdapterFailureReason =
  | "AI_UNAVAILABLE"
  | "AI_TIMEOUT"
  | "AI_UNSUPPORTED_SHAPE"
  | "AI_PROMPT_INJECTION_SUSPECT"
  | "GROUNDING_HASH_MISMATCH"
  | "COST_CAP_EXCEEDED"
  | "RATE_LIMITED"
  | "MALFORMED_OUTPUT"
  | "UNSUPPORTED_CLAIM";

export type InventoryExplainerRejectionCode =
  | "UNAUTHORIZED"
  | "TENANT_SCOPE_MISMATCH"
  | "PERMISSION_DENIED"
  | "GRAIN_NOT_FOUND"
  | "INVALID_QUESTION"
  | "INSUFFICIENT_EVIDENCE"
  | "HALLUCINATED_NUMBER"
  | "FORBIDDEN_ACTION_CLAIM"
  | "PROMPT_INJECTION_SUSPECT"
  | "AI_TIMEOUT"
  | "AI_UNAVAILABLE"
  | "AI_UNSUPPORTED_SHAPE"
  | "COST_CAP_EXCEEDED"
  | "RATE_LIMITED"
  | "MALFORMED_OUTPUT"
  | "STALE_EVIDENCE"
  | "LIVE_PROVIDER_FORBIDDEN";

export type InventoryExplainerDiagnostics = {
  aiAttempted: boolean;
  enablementSource: InventoryExplainerEnablementSource;
  generator: InventoryExplainerGenerator;
  candidateReceived: boolean;
  candidateDiscarded: boolean;
  discardReasons: readonly InventoryExplainerRejectionCode[];
  adapterFailureReason?: InventoryExplainerAdapterFailureReason;
  evidenceHash?: string;
  lateResultDiscarded: boolean;
  costCapExceeded?: boolean;
  rateLimited?: boolean;
  cacheHit?: boolean;
};

export type InventoryExplainerAnswer = {
  schemaVersion: typeof INVENTORY_EXPLAINER_ANSWER_VERSION;
  questionId: InventoryExplainerQuestionId;
  status: InventoryExplainerAnswerStatus;
  merchantAnswer: string;
  abstentionReason?: string;
  citations: readonly InventoryExplainerCitation[];
  nextSteps: readonly InventoryExplainerNextStep[];
  evidenceHash: string;
  generator: InventoryExplainerGenerator;
  diagnostics: InventoryExplainerDiagnostics;
};

export type InventoryExplainerAiCandidate = {
  schemaVersion: typeof INVENTORY_EXPLAINER_ANSWER_VERSION;
  adapterId: InventoryExplainerAdapterId;
  provider: string;
  model: string;
  promptVersion: string;
  evidenceHash: string;
  questionId: InventoryExplainerQuestionId;
  merchantAnswer: string;
  citedFactIds: readonly InventoryExplainerFactId[];
  suggestedNextStepCodes: readonly InventoryExplainerNextStepCode[];
  usage?: {
    latencyMs: number;
    inputTokenEstimate?: number;
    outputTokenEstimate?: number;
  };
};
