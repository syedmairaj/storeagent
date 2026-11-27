/**
 * AI-ARCH-1a — provider-independent commerce agent contracts.
 * Design: docs/AI_ARCH_0_TECHNICAL_DESIGN.md
 * Principle: The AI controls the investigation. It does not control what counts as a fact.
 *
 * Numbers and tenant scope never originate from model text alone.
 */

import type { OrganizationMemberRole } from "@/lib/commerce-domain/types";
import type { Permission } from "@/lib/tenancy/permissions";

export const COMMERCE_AGENT_QUERY_VERSION =
  "commerce-agent-query-v1" as const;

export const COMMERCE_AGENT_CONTEXT_VERSION =
  "commerce-agent-context-v1" as const;

export const COMMERCE_AGENT_TRACE_VERSION =
  "commerce-agent-trace-v1" as const;

export const COMMERCE_AGENT_EVIDENCE_BUNDLE_VERSION =
  "commerce-agent-evidence-bundle-v1" as const;

/** Future-facing intent classes (AI-MKT/COMP/CREATIVE reserved; unused in 1a). */
export type AgentIntentClass =
  | "inventory_fact"
  | "zero_sales_diagnosis"
  | "data_gap"
  | "reorder_review"
  | "competitor_research"
  | "creative_performance"
  | "market_opportunity"
  | "unsupported";

/**
 * Untrusted query envelope. Grain IDs are hints only.
 * Never treat hintGrain as MerchantContext authority.
 */
export type AgentQuery = {
  schemaVersion: typeof COMMERCE_AGENT_QUERY_VERSION;
  locale: "en-US";
  intentClass: AgentIntentClass;
  naturalLanguage?: string;
  questionId?: string;
  hintGrain?: {
    organizationId: string;
    storeId?: string;
    locationId?: string;
    variantId?: string;
    countryCode?: string;
    currencyCode?: string;
  };
  clientRequestId: string;
};

/**
 * Trusted context — membership + permissions resolved on the server.
 * organizationId NEVER comes from model output.
 */
export type MerchantContext = {
  schemaVersion: typeof COMMERCE_AGENT_CONTEXT_VERSION;
  userId: string;
  organizationId: string;
  role: OrganizationMemberRole;
  permissions: readonly Permission[];
  storeId?: string;
  locationId?: string;
  variantId?: string;
  countryCode?: string | null;
  currencyCode?: string | null;
  asOf: string;
};

export type ToolPermission =
  | "inventory.read"
  | "forecasts.read"
  | "actions.read"
  | "stores.read"
  | "data_quality.read";

export type ToolDefinition = {
  toolId: string;
  description: string;
  sideEffectClass: "read_only";
  requiredPermissions: readonly ToolPermission[];
  inputSchemaVersion: string;
  maxCallsPerRun: number;
  timeoutMs: number;
};

export type ToolResult =
  | {
      ok: true;
      toolId: string;
      latencyMs: number;
      evidenceIds: readonly string[];
      rawRef?: string;
    }
  | {
      ok: false;
      toolId: string;
      code:
        | "PERMISSION_DENIED"
        | "NOT_FOUND"
        | "TIMEOUT"
        | "TRANSIENT"
        | "UNSUPPORTED"
        | "BUDGET";
      detail: string;
    };

/**
 * Claim classes — keep AI-MKT external signals and LOOP outcomes distinguishable later.
 * observed_fact / engine_calculation / hypothesis must not be conflated.
 */
export type ClaimClass =
  | "observed_fact"
  | "sourced_signal"
  | "engine_calculation"
  | "estimate"
  | "hypothesis"
  | "unknown";

export type EvidenceFreshnessClass = "current" | "stale" | "unknown";

export type EvidenceMatchQuality =
  | "exact"
  | "partial"
  | "mismatch"
  | "unknown";

export type EvidenceRecord = {
  evidenceId: string;
  claimClass: ClaimClass;
  label: string;
  value: string;
  unit?: string | null;
  sourceSystem: string;
  sourceRef?: string;
  observedAt?: string | null;
  asOf?: string | null;
  organizationId: string;
  storeId?: string;
  locationId?: string;
  variantId?: string;
  sku?: string;
  countryCode?: string | null;
  currencyCode?: string | null;
  matchQuality?: EvidenceMatchQuality;
  freshnessClass?: EvidenceFreshnessClass;
  /** Internal L1 sources are always licensed; external later require explicit true. */
  licenseOk: boolean;
  /** AI-INV fact id when mapped from inventory explainer. */
  inventoryFactId?: string;
};

export type Claim = {
  claimId: string;
  text: string;
  claimClass: ClaimClass;
  evidenceIds: readonly string[];
  verified: boolean;
  conflictIds?: readonly string[];
};

export type DecisionRecommendationActionClass =
  | "review"
  | "refresh_data"
  | "investigate"
  | "watch"
  | "reorder_candidate"
  | "abstain";

export type ApprovalBoundary =
  | "none"
  | "merchant_required"
  | "blocked_until_m7";

export type DecisionRecommendation = {
  recommendationId: string;
  actionClass: DecisionRecommendationActionClass;
  summary: string;
  engineVersion?: string;
  inputsHash?: string;
  requiresHumanApproval: true;
  approvalBoundary: ApprovalBoundary;
};

export type AgentTraceStepKind =
  | "plan"
  | "tool"
  | "analyze"
  | "verify"
  | "respond"
  | "map";

export type AgentTrace = {
  schemaVersion: typeof COMMERCE_AGENT_TRACE_VERSION;
  runId: string;
  clientRequestId: string;
  organizationId: string;
  startedAt: string;
  endedAt?: string;
  steps: readonly {
    step: number;
    kind: AgentTraceStepKind;
    toolId?: string;
    ok: boolean;
    latencyMs?: number;
    note?: string;
  }[];
  tokenEstimateIn?: number;
  tokenEstimateOut?: number;
  budgetRemaining?: number;
  cancelled?: boolean;
};

export type AgentFailureCode =
  | "UNAUTHORIZED"
  | "TENANT_SCOPE_MISMATCH"
  | "PERMISSION_DENIED"
  | "UNSUPPORTED_INTENT"
  | "UNSUPPORTED_EVIDENCE"
  | "INSUFFICIENT_EVIDENCE"
  | "CONFLICTING_EVIDENCE"
  | "STALE_EVIDENCE"
  | "TOOL_FAILURE"
  | "STEP_LIMIT"
  | "TIMEOUT"
  | "COST_CAP_EXCEEDED"
  | "RATE_LIMITED"
  | "PROMPT_INJECTION_SUSPECT"
  | "HALLUCINATED_NUMBER"
  | "FORBIDDEN_ACTION_CLAIM"
  | "LIVE_PROVIDER_FORBIDDEN"
  | "AGENT_DISABLED"
  | "INVALID_PLAN";

/** Orchestrator run outcome (AI-ARCH-1c). */
export type AgentRunResult = AgentAnswer | AgentAbstention;

export type AgentAbstention = {
  status: "abstained";
  code: AgentFailureCode;
  merchantMessage: string;
  missingEvidenceLabels: readonly string[];
  nextSteps: readonly { code: string; label: string }[];
  evidenceHash?: string;
  trace: AgentTrace;
};

export type AgentAnswer = {
  status: "answered";
  merchantAnswer: string;
  findings: readonly Claim[];
  evidence: readonly EvidenceRecord[];
  calculations: readonly EvidenceRecord[];
  uncertainty: readonly string[];
  recommendedAction: DecisionRecommendation;
  nextSteps: readonly { code: string; label: string }[];
  approvalBoundary: ApprovalBoundary;
  evidenceHash: string;
  generator: "deterministic" | "ai_validated" | "fallback_deterministic";
  trace: AgentTrace;
};

/** Mapped AI-INV evidence bundle for later orchestrator consumption (1b+). */
export type CommerceAgentEvidenceBundle = {
  schemaVersion: typeof COMMERCE_AGENT_EVIDENCE_BUNDLE_VERSION;
  evidenceHash: string;
  organizationId: string;
  storeId: string;
  locationId: string;
  variantId: string;
  sku: string;
  grainKey: string;
  freshnessClass: EvidenceFreshnessClass;
  evidence: readonly EvidenceRecord[];
  calculations: readonly EvidenceRecord[];
  hypotheses: readonly Claim[];
  findings: readonly Claim[];
  missingLabels: readonly string[];
  uncertainty: readonly string[];
  conflicts: readonly {
    conflictId: string;
    evidenceIds: readonly string[];
    summary: string;
  }[];
  nextSteps: readonly { code: string; label: string }[];
  recommendedAction: DecisionRecommendation;
  allowlistedLiterals: readonly string[];
  guidanceSituationId?: string;
};

export type MapInventoryExplainerEvidenceResult =
  | { ok: true; bundle: CommerceAgentEvidenceBundle }
  | {
      ok: false;
      code: AgentFailureCode;
      error: string;
    };
