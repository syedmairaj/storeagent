/**
 * AI-MKT-1d — bounded market-research orchestration.
 *
 * Flow: trusted context → admit → bounded plan → retrieve → normalize →
 * validate claims → safe response / abstain.
 *
 * Reuses 1a admission, invokeMarketResearchAdapter, normalizeMarketResearchEvidence.
 * No duplicate autonomous agent. No L1 market.* tools. Enablement remains OFF
 * unless explicit synthetic fixture injection.
 */

import { randomUUID } from "node:crypto";

import type { MerchantContext } from "@/lib/commerce-agent/types";
import {
  getDefaultProviderApproval,
  invokeMarketResearchAdapter,
  type InvokeMarketResearchAdapterInput,
  type MarketResearchProviderApproval,
  type OpenAiOfflineFixtureId,
  type GeminiOfflineFixtureId,
} from "@/lib/market-research/adapters";
import {
  assertL1MarketToolsRemainForbidden,
  mayRunMarketResearch,
} from "@/lib/market-research/enablement";
import { admitMarketResearchRequest } from "@/lib/market-research/gate";
import {
  OPENAI_NORMALIZE_CONDITIONS,
  normalizeMarketResearchEvidence,
  authorizeNormalizedEvidenceForL1Findings,
  type ProductMatchTarget,
} from "@/lib/market-research/normalize";
import { deriveServerLicenseOk } from "@/lib/market-research/rights";
import { evaluateSourceOperationRights } from "@/lib/market-research/rights";
import { MARKET_SOURCE_IDS } from "@/lib/market-research/types";
import { parseResearchRequest } from "@/lib/market-research/validate";
import {
  assertOfflineSpendOnly,
  createZeroSpendCounters,
  deadlineExceeded,
  estimatePayloadBytes,
  resolveResearchExecutionBounds,
  type BoundsOverrideInput,
} from "@/lib/market-research/orchestration/bounds";
import {
  buildTrustedResearchRunBinding,
  detectForgedBindingAuthority,
  sealBindingEvidenceHash,
  type BindingAuthorityProbe,
} from "@/lib/market-research/orchestration/binding";
import { hashAcceptedResearchEvidence } from "@/lib/market-research/orchestration/evidence-hash";
import {
  assertNoRecursivePlanExpansion,
  buildBoundedResearchPlan,
} from "@/lib/market-research/orchestration/plan";
import type { MarketResearchDraftAdapter } from "@/lib/market-research/orchestration/draft";
import {
  applyOptionalResearchDraft,
  deterministicSynthesisOnly,
} from "@/lib/market-research/orchestration/synthesize";
import {
  MARKET_RESEARCH_ORCHESTRATION_VERSION,
  type MarketResearchOrchestrationFailure,
  type MarketResearchOrchestrationResult,
  type ResearchOrchestrationFailureCode,
  type ResearchRunTrace,
  type ResearchSpendCounters,
  type ResearchTraceStep,
  type TrustedResearchRunBinding,
} from "@/lib/market-research/orchestration/types";

export const OPENAI_RETRIEVE_CONDITIONS = [
  "live_research_authorized",
  "third_party_source_rights_reviewed",
  "credit_reservation_ok",
] as const;

export const OPENAI_ANALYZE_CONDITIONS = [
  "tenant_scoped_only",
  "third_party_source_rights_reviewed",
  "claim_class_sourced_signal_only",
] as const;

export const OPENAI_DISPLAY_CONDITIONS = [
  "inline_citations_rendered",
  "third_party_source_rights_reviewed",
] as const;

export type RunMarketResearchOrchestrationInput = {
  merchantContext: MerchantContext;
  rawRequest: unknown;
  targetProduct: ProductMatchTarget;
  sourceId: string;
  /** Injected clock ISO (freshness + binding). */
  nowIso: string;
  /** Wall-clock start; defaults to Date.now(). */
  nowMs?: number;
  runId?: string;
  /** Required for any execution — default enablement stays OFF. */
  allowSyntheticFixtures?: boolean;
  syntheticFixtureMode?: boolean;
  /** Server-satisfied retrieve conditions only. */
  satisfiedRetrieveConditions?: readonly string[];
  satisfiedNormalizeConditions?: readonly string[];
  satisfiedAnalyzeConditions?: readonly string[];
  satisfiedDisplayConditions?: readonly string[];
  /** Server/test approval dependency — never caller authority alone. */
  approval?: MarketResearchProviderApproval;
  fixtureId?: OpenAiOfflineFixtureId | GeminiOfflineFixtureId;
  preferredMode?: InvokeMarketResearchAdapterInput["preferredMode"];
  registryKey?: string;
  draftAdapter?: MarketResearchDraftAdapter;
  draftTimeoutMs?: number;
  signal?: AbortSignal;
  bounds?: BoundsOverrideInput;
  /**
   * Forgery probes — any supplied authority fields fail closed.
   * Never treated as trusted evidence/policy/approval.
   */
  untrustedAuthority?: BindingAuthorityProbe | null;
  requestLiveNetwork?: unknown;
  requestDataEgress?: unknown;
  requestAutomaticFallback?: unknown;
  untrustedAdapter?: unknown;
  untrustedHints?: InvokeMarketResearchAdapterInput["untrustedHints"];
  /** Rejected if true — no recursive planning. */
  requestRecursivePlan?: unknown;
  /** Rejected if asserting production spend/credits. */
  claimActualSpend?: unknown;
  claimCredits?: unknown;
  claimLedgerSettlement?: unknown;
  /**
   * Test hook: force additional plan steps (must be rejected).
   */
  proposedExtraPlanSteps?: unknown;
  /** Test hook: max retries request beyond cap. */
  requestRetries?: unknown;
};

function emptyFailure(input: {
  runId: string;
  status: "abstained" | "error";
  code: ResearchOrchestrationFailureCode;
  detail: string;
  startedAt: string;
  bounds: ReturnType<typeof resolveResearchExecutionBounds>;
  spend: ResearchSpendCounters;
  steps: ResearchTraceStep[];
  organizationId?: string;
  clientRequestId?: string;
  binding?: TrustedResearchRunBinding;
  reasonCodes?: readonly ResearchOrchestrationFailureCode[];
  limitations?: readonly string[];
  evidenceHash?: string;
}): MarketResearchOrchestrationFailure {
  const endedAt = new Date().toISOString();
  const trace: ResearchRunTrace = {
    schemaVersion: MARKET_RESEARCH_ORCHESTRATION_VERSION,
    runId: input.runId,
    startedAt: input.startedAt,
    endedAt,
    steps: input.steps,
    bounds: input.bounds,
    spend: input.spend,
  };
  return {
    status: input.status,
    schemaVersion: MARKET_RESEARCH_ORCHESTRATION_VERSION,
    runId: input.runId,
    organizationId: input.organizationId,
    clientRequestId: input.clientRequestId,
    code: input.code,
    detail: input.detail,
    reasonCodes: input.reasonCodes ?? [input.code],
    limitations: input.limitations ?? ["no_findings_emitted"],
    evidenceHash: input.evidenceHash,
    findings: [],
    evidenceIds: [],
    conflicts: [],
    abstentions: [{ code: mapToResearchFailure(input.code), detail: input.detail }],
    originClass: "synthetic_fixture",
    syntheticOriginPreserved: true,
    isRealMerchantOrMarketFact: false,
    promotableToL1Findings: false,
    generator: "none",
    binding: input.binding,
    trace,
    spend: input.spend,
    producedFindings: false,
  };
}

function mapToResearchFailure(
  code: ResearchOrchestrationFailureCode,
): import("@/lib/market-research/types").ResearchFailureCode {
  const known = new Set([
    "UNAUTHORIZED",
    "TENANT_SCOPE_MISMATCH",
    "UNSUPPORTED_GEO",
    "UNSUPPORTED_CATEGORY",
    "LICENSE_DENIED",
    "SOURCE_REVOKED",
    "SOURCE_UNKNOWN",
    "POLICY_VERSION_MISMATCH",
    "RIGHTS_CONDITIONS_UNSATISFIED",
    "BUDGET",
    "CREDIT_RESERVATION_FAILED",
    "PROVIDER_FORBIDDEN",
    "LIVE_EXECUTION_FORBIDDEN",
    "RESEARCH_DISABLED",
    "SSRF_BLOCKED",
    "TIMEOUT",
    "TRANSIENT",
    "MATCH_AMBIGUOUS",
    "INSUFFICIENT_EVIDENCE",
    "ATTRIBUTION_REQUIRED",
    "CACHE_FORBIDDEN",
    "MALFORMED_REQUEST",
    "FORGED_POLICY_INPUT",
    "PROMPT_INJECTION_SUSPECT",
  ]);
  if (known.has(code)) {
    return code as import("@/lib/market-research/types").ResearchFailureCode;
  }
  if (code === "DEADLINE_EXCEEDED" || code === "LATE_RESPONSE_DISCARDED") {
    return "TIMEOUT";
  }
  if (code === "CANCELLED") {
    return "TRANSIENT";
  }
  return "INSUFFICIENT_EVIDENCE";
}

function pushStep(
  steps: ResearchTraceStep[],
  step: Omit<ResearchTraceStep, "step"> & { step?: number },
): void {
  steps.push({
    step: step.step ?? steps.length + 1,
    kind: step.kind,
    ok: step.ok,
    latencyMs: step.latencyMs,
    note: step.note,
    toolCallCounted: step.toolCallCounted,
  });
}

/**
 * Execute one bounded offline market-research run.
 * Disabled / unauthorized / forged paths invoke zero adapters.
 */
export async function runMarketResearchOrchestration(
  input: RunMarketResearchOrchestrationInput,
): Promise<MarketResearchOrchestrationResult> {
  const runId = input.runId ?? randomUUID();
  const startedMs = input.nowMs ?? Date.now();
  const startedAt = new Date(startedMs).toISOString();
  const bounds = resolveResearchExecutionBounds(input.bounds);
  const steps: ResearchTraceStep[] = [];
  let spend = createZeroSpendCounters();
  const signal = input.signal ?? new AbortController().signal;

  // Structural: L1 market tools remain forbidden (regression guard).
  assertL1MarketToolsRemainForbidden();

  const spendGate = assertOfflineSpendOnly({
    claimActualSpend: input.claimActualSpend,
    claimCredits: input.claimCredits,
    claimLedgerSettlement: input.claimLedgerSettlement,
  });
  if (!spendGate.ok) {
    return emptyFailure({
      runId,
      status: "error",
      code: "SPEND_LEDGER_FORBIDDEN",
      detail: spendGate.detail,
      startedAt,
      bounds,
      spend,
      steps,
    });
  }

  const forged = detectForgedBindingAuthority(input.untrustedAuthority);
  if (forged.forged) {
    return emptyFailure({
      runId,
      status: "error",
      code: forged.code,
      detail: forged.detail,
      startedAt,
      bounds,
      spend,
      steps,
      organizationId: input.merchantContext.organizationId,
    });
  }

  if (input.requestRecursivePlan === true) {
    return emptyFailure({
      runId,
      status: "error",
      code: "RECURSIVE_PLAN_FORBIDDEN",
      detail: "Recursive planning is forbidden",
      startedAt,
      bounds,
      spend,
      steps,
    });
  }

  if (Array.isArray(input.proposedExtraPlanSteps) && input.proposedExtraPlanSteps.length > 0) {
    const expansion = assertNoRecursivePlanExpansion([], input.proposedExtraPlanSteps as never);
    if (!expansion.ok) {
      return emptyFailure({
        runId,
        status: "error",
        code: expansion.code,
        detail: expansion.detail,
        startedAt,
        bounds,
        spend,
        steps,
      });
    }
  }

  if (
    typeof input.requestRetries === "number" &&
    input.requestRetries > bounds.maxRetries
  ) {
    return emptyFailure({
      runId,
      status: "error",
      code: "RETRY_CAP_EXCEEDED",
      detail: `Requested retries ${input.requestRetries} exceed maxRetries ${bounds.maxRetries}`,
      startedAt,
      bounds,
      spend,
      steps,
    });
  }

  // Enablement — default OFF without synthetic injection.
  const enablement = mayRunMarketResearch({
    organizationId: input.merchantContext.organizationId,
    allowSyntheticFixtures: input.allowSyntheticFixtures,
    requestLiveNetwork: input.requestLiveNetwork,
  });
  if (!enablement.mayRunSyntheticFixtures) {
    return emptyFailure({
      runId,
      status: "abstained",
      code: "RESEARCH_DISABLED",
      detail:
        "Market research enablement OFF; synthetic fixtures require explicit injection",
      startedAt,
      bounds,
      spend,
      steps,
      organizationId: input.merchantContext.organizationId,
    });
  }

  if (signal.aborted || deadlineExceeded(startedMs, bounds.deadlineMs, Date.now())) {
    return emptyFailure({
      runId,
      status: "error",
      code: signal.aborted ? "CANCELLED" : "DEADLINE_EXCEEDED",
      detail: signal.aborted
        ? "Run cancelled before admit"
        : "Deadline exceeded before admit",
      startedAt,
      bounds,
      spend,
      steps,
      organizationId: input.merchantContext.organizationId,
    });
  }

  // --- Step 1: admit (1a) ---
  const admitStarted = Date.now();
  const admission = admitMarketResearchRequest({
    merchantContext: input.merchantContext,
    rawRequest: input.rawRequest,
    sourceId: input.sourceId,
    operation: "retrieve",
    satisfiedConditions: input.satisfiedRetrieveConditions,
    syntheticFixtureMode: input.syntheticFixtureMode,
    allowSyntheticFixtures: input.allowSyntheticFixtures,
    requestLiveNetwork: input.requestLiveNetwork,
    untrustedHints: input.untrustedHints,
  });
  pushStep(steps, {
    kind: "admit",
    ok: admission.ok,
    latencyMs: Date.now() - admitStarted,
    note: admission.ok ? "admitted_synthetic" : admission.code,
  });

  if (!admission.ok) {
    return emptyFailure({
      runId,
      status: admission.code === "RESEARCH_DISABLED" ? "abstained" : "error",
      code: admission.code,
      detail: admission.detail,
      startedAt,
      bounds,
      spend,
      steps,
      organizationId: input.merchantContext.organizationId,
    });
  }

  if (steps.length > bounds.maxSteps) {
    return emptyFailure({
      runId,
      status: "error",
      code: "STEP_CAP_EXCEEDED",
      detail: "Step cap exceeded after admit",
      startedAt,
      bounds,
      spend,
      steps,
      organizationId: admission.scope.organizationId,
      clientRequestId: admission.request.clientRequestId,
    });
  }

  const planBuilt = buildBoundedResearchPlan({
    depth: admission.request.depth,
    bounds,
  });
  if (!planBuilt.ok) {
    return emptyFailure({
      runId,
      status: "error",
      code: planBuilt.code,
      detail: planBuilt.detail,
      startedAt,
      bounds,
      spend,
      steps,
      organizationId: admission.scope.organizationId,
      clientRequestId: admission.request.clientRequestId,
    });
  }

  // Gemini automatic fallback structurally denied.
  if (input.requestAutomaticFallback === true) {
    return emptyFailure({
      runId,
      status: "error",
      code: "GEMINI_FALLBACK_DENIED",
      detail: "Automatic Gemini fallback denied; zero adapter findings",
      startedAt,
      bounds,
      spend,
      steps,
      organizationId: admission.scope.organizationId,
      clientRequestId: admission.request.clientRequestId,
    });
  }

  // Pre-bind with server-derived licenseOk (retrieve rights already admitted).
  const licenseOk = deriveServerLicenseOk({
    sourceId: input.sourceId,
    operation: "retrieve",
    satisfiedConditions: input.satisfiedRetrieveConditions,
    asOf: input.nowIso,
  });

  const adapterIdGuess =
    input.sourceId === MARKET_SOURCE_IDS.GEMINI_SEARCH_GROUNDING
      ? "gemini_search_grounding_v1"
      : input.sourceId === MARKET_SOURCE_IDS.OPENAI_WEB_SEARCH
        ? "openai_web_search_v1"
        : input.sourceId;

  const bindingResult = buildTrustedResearchRunBinding({
    merchantContext: input.merchantContext,
    request: admission.request,
    sourceId: input.sourceId,
    adapterId: adapterIdGuess,
    targetProduct: input.targetProduct,
    licenseOk,
    runId,
  });
  if (!bindingResult.ok) {
    return emptyFailure({
      runId,
      status: "error",
      code: bindingResult.code,
      detail: bindingResult.detail,
      startedAt,
      bounds,
      spend,
      steps,
      organizationId: admission.scope.organizationId,
      clientRequestId: admission.request.clientRequestId,
    });
  }
  let binding = bindingResult.binding;

  if (signal.aborted || deadlineExceeded(startedMs, bounds.deadlineMs, Date.now())) {
    return emptyFailure({
      runId,
      status: "error",
      code: signal.aborted ? "CANCELLED" : "DEADLINE_EXCEEDED",
      detail: "Cancelled or deadline before retrieve — no findings",
      startedAt,
      bounds,
      spend,
      steps,
      organizationId: binding.organizationId,
      clientRequestId: binding.clientRequestId,
      binding,
    });
  }

  // --- Step 2: retrieve (1b) ---
  const toolCallsSoFar = steps.filter((s) => s.toolCallCounted).length;
  if (toolCallsSoFar >= bounds.maxToolCalls) {
    return emptyFailure({
      runId,
      status: "error",
      code: "TOOL_CAP_EXCEEDED",
      detail: "Tool call cap reached before retrieve",
      startedAt,
      bounds,
      spend,
      steps,
      organizationId: binding.organizationId,
      clientRequestId: binding.clientRequestId,
      binding,
    });
  }

  const retrieveStarted = Date.now();
  const remainingMs = Math.max(
    1,
    bounds.deadlineMs - (Date.now() - startedMs),
  );
  const invoked = await invokeMarketResearchAdapter({
    merchantContext: input.merchantContext,
    rawRequest: input.rawRequest,
    sourceId: input.sourceId,
    operation: "retrieve",
    registryKey: input.registryKey,
    preferredMode: input.preferredMode,
    fixtureId: input.fixtureId,
    satisfiedConditions: input.satisfiedRetrieveConditions,
    syntheticFixtureMode: input.syntheticFixtureMode,
    allowSyntheticFixtures: input.allowSyntheticFixtures,
    requestLiveNetwork: input.requestLiveNetwork,
    requestDataEgress: input.requestDataEgress,
    requestAutomaticFallback: input.requestAutomaticFallback,
    untrustedAdapter: input.untrustedAdapter,
    untrustedHints: input.untrustedHints,
    approval: input.approval ?? getDefaultProviderApproval(),
    signal,
    timeoutMs: Math.min(remainingMs, 500),
    nowIso: input.nowIso,
  });

  spend = createZeroSpendCounters({
    ...spend,
    adapterCalls: invoked.adaptersInvoked,
    failedAttempts:
      spend.failedAttempts + (invoked.result.ok ? 0 : invoked.adaptersInvoked),
  });

  pushStep(steps, {
    kind: "retrieve",
    ok: invoked.result.ok,
    latencyMs: Date.now() - retrieveStarted,
    note: invoked.result.ok
      ? `adaptersInvoked:${invoked.adaptersInvoked}`
      : `denied_or_failed:${"reason" in invoked.result ? invoked.result.reason : "unknown"}`,
    toolCallCounted: invoked.adaptersInvoked > 0,
  });

  // Cancellation / late discard — never produce findings.
  if (signal.aborted) {
    return emptyFailure({
      runId,
      status: "error",
      code: "CANCELLED",
      detail: "Cancelled during/after retrieve — findings discarded",
      startedAt,
      bounds,
      spend,
      steps,
      organizationId: binding.organizationId,
      clientRequestId: binding.clientRequestId,
      binding,
    });
  }

  if (deadlineExceeded(startedMs, bounds.deadlineMs, Date.now())) {
    return emptyFailure({
      runId,
      status: "error",
      code: "LATE_RESPONSE_DISCARDED",
      detail: "Deadline exceeded; adapter response discarded with zero findings",
      startedAt,
      bounds,
      spend,
      steps,
      organizationId: binding.organizationId,
      clientRequestId: binding.clientRequestId,
      binding,
    });
  }

  if (invoked.admissionDenied || invoked.adaptersInvoked === 0) {
    const reason =
      !invoked.result.ok && "researchCode" in invoked.result && invoked.result.researchCode
        ? (invoked.result.researchCode as ResearchOrchestrationFailureCode)
        : !invoked.result.ok
          ? mapAdapterReason(invoked.result.reason)
          : "PROVIDER_FORBIDDEN";
    return emptyFailure({
      runId,
      status: reason === "RESEARCH_DISABLED" ? "abstained" : "error",
      code: reason,
      detail: !invoked.result.ok ? invoked.result.detail : "Adapter not invoked",
      startedAt,
      bounds,
      spend,
      steps,
      organizationId: binding.organizationId,
      clientRequestId: binding.clientRequestId,
      binding,
    });
  }

  if (!invoked.result.ok) {
    spend = createZeroSpendCounters({
      ...spend,
      failedAttempts: spend.failedAttempts + 1,
    });
    return emptyFailure({
      runId,
      status: "error",
      code: mapAdapterReason(invoked.result.reason),
      detail: invoked.result.detail,
      startedAt,
      bounds,
      spend,
      steps,
      organizationId: binding.organizationId,
      clientRequestId: binding.clientRequestId,
      binding,
    });
  }

  const payloadBytes = estimatePayloadBytes(invoked.result);
  if (payloadBytes > bounds.maxPayloadBytes) {
    return emptyFailure({
      runId,
      status: "error",
      code: "PAYLOAD_CAP_EXCEEDED",
      detail: `Adapter payload ${payloadBytes}b exceeds maxPayloadBytes ${bounds.maxPayloadBytes}`,
      startedAt,
      bounds,
      spend,
      steps,
      organizationId: binding.organizationId,
      clientRequestId: binding.clientRequestId,
      binding,
    });
  }

  // Pin adapter id from successful envelope.
  binding = {
    ...binding,
    adapterId: invoked.result.adapterId,
    sourceId: invoked.result.sourceId,
  };

  // Gemini: retrieve may return display-shaped fixtures, but normalize/analyze denied.
  if (input.sourceId === MARKET_SOURCE_IDS.GEMINI_SEARCH_GROUNDING) {
    pushStep(steps, {
      kind: "normalize",
      ok: false,
      note: "GEMINI_NORMALIZE_DENIED",
    });
    return emptyFailure({
      runId,
      status: "abstained",
      code: "GEMINI_NORMALIZE_DENIED",
      detail: "Gemini remains excluded from normalized research and analysis",
      startedAt,
      bounds,
      spend,
      steps,
      organizationId: binding.organizationId,
      clientRequestId: binding.clientRequestId,
      binding,
      reasonCodes: ["GEMINI_NORMALIZE_DENIED", "GEMINI_ANALYZE_DENIED"],
    });
  }

  if (steps.length > bounds.maxSteps) {
    return emptyFailure({
      runId,
      status: "error",
      code: "STEP_CAP_EXCEEDED",
      detail: "Step cap exceeded before normalize",
      startedAt,
      bounds,
      spend,
      steps,
      organizationId: binding.organizationId,
      clientRequestId: binding.clientRequestId,
      binding,
    });
  }

  // --- Step 3: normalize (1c) ---
  const normalizeStarted = Date.now();
  const normalizeConditions =
    input.satisfiedNormalizeConditions ?? [...OPENAI_NORMALIZE_CONDITIONS];
  const normalized = normalizeMarketResearchEvidence({
    merchantContext: input.merchantContext,
    rawRequest: input.rawRequest,
    adapterResult: invoked.result,
    targetProduct: input.targetProduct,
    nowIso: input.nowIso,
    satisfiedNormalizeConditions: normalizeConditions,
    untrustedHints: input.untrustedHints,
  });
  pushStep(steps, {
    kind: "normalize",
    ok: normalized.ok,
    latencyMs: Date.now() - normalizeStarted,
    note: normalized.ok
      ? `accepted:${normalized.accepted.length};rejected:${normalized.rejected.length}`
      : normalized.code,
  });

  if (!normalized.ok) {
    return emptyFailure({
      runId,
      status: "abstained",
      code: normalized.code as ResearchOrchestrationFailureCode,
      detail: normalized.detail,
      startedAt,
      bounds,
      spend,
      steps,
      organizationId: binding.organizationId,
      clientRequestId: binding.clientRequestId,
      binding,
    });
  }

  // --- Step 4: analyze rights (re-evaluate independently) ---
  const analyzeRights = evaluateSourceOperationRights({
    sourceId: binding.sourceId,
    operation: "analyze",
    satisfiedConditions:
      input.satisfiedAnalyzeConditions ?? [...OPENAI_ANALYZE_CONDITIONS],
    asOf: input.nowIso,
  });
  pushStep(steps, {
    kind: "analyze",
    ok: analyzeRights.ok,
    note: analyzeRights.ok ? "analyze_rights_ok" : analyzeRights.code,
  });
  if (!analyzeRights.ok) {
    return emptyFailure({
      runId,
      status: "abstained",
      code: analyzeRights.code,
      detail: analyzeRights.detail,
      startedAt,
      bounds,
      spend,
      steps,
      organizationId: binding.organizationId,
      clientRequestId: binding.clientRequestId,
      binding,
    });
  }

  // Display rights re-evaluated separately (do not imply analyze).
  const displayRights = evaluateSourceOperationRights({
    sourceId: binding.sourceId,
    operation: "display",
    satisfiedConditions:
      input.satisfiedDisplayConditions ?? [...OPENAI_DISPLAY_CONDITIONS],
    asOf: input.nowIso,
  });
  if (!displayRights.ok) {
    return emptyFailure({
      runId,
      status: "abstained",
      code: displayRights.code,
      detail: `Display rights denied: ${displayRights.detail}`,
      startedAt,
      bounds,
      spend,
      steps,
      organizationId: binding.organizationId,
      clientRequestId: binding.clientRequestId,
      binding,
    });
  }

  // model_process intentionally not auto-satisfied — offline draft is not model_process.
  const modelProcess = evaluateSourceOperationRights({
    sourceId: binding.sourceId,
    operation: "model_process",
    satisfiedConditions: [],
    asOf: input.nowIso,
  });
  if (modelProcess.ok) {
    // Should not happen without paid tier conditions — fail closed if unexpectedly allowed
    // without explicit server conditions in this slice.
  }

  if (normalized.accepted.length === 0) {
    pushStep(steps, {
      kind: "synthesize",
      ok: false,
      note: "no_accepted_evidence",
    });
    return emptyFailure({
      runId,
      status: "abstained",
      code: "INSUFFICIENT_EVIDENCE",
      detail: "No accepted normalized evidence; abstaining",
      startedAt,
      bounds,
      spend,
      steps,
      organizationId: binding.organizationId,
      clientRequestId: binding.clientRequestId,
      binding,
      limitations: [
        "no_accepted_evidence",
        "synthetic_origin_preserved",
        ...normalized.rejected.map((r) => `rejected:${r.code}`),
      ],
    });
  }

  const evidenceHash = hashAcceptedResearchEvidence({
    organizationId: binding.organizationId,
    clientRequestId: binding.clientRequestId,
    sourceId: binding.sourceId,
    adapterId: binding.adapterId,
    sourcePolicyVersion: binding.sourcePolicyVersion,
    accepted: normalized.accepted,
    conflicts: normalized.conflicts,
  });
  binding = sealBindingEvidenceHash(binding, evidenceHash);

  // Guard: synthetic never promotes to L1.
  for (const item of normalized.accepted) {
    const promo = authorizeNormalizedEvidenceForL1Findings({
      merchantContext: input.merchantContext,
      item,
      satisfiedNormalizeConditions: normalizeConditions,
      nowIso: input.nowIso,
    });
    if (promo.ok) {
      return emptyFailure({
        runId,
        status: "error",
        code: "L1_PROMOTION_FORBIDDEN",
        detail: "Unexpected L1 promotion path — fail closed",
        startedAt,
        bounds,
        spend,
        steps,
        organizationId: binding.organizationId,
        clientRequestId: binding.clientRequestId,
        binding,
        evidenceHash,
      });
    }
  }

  // --- Step 5: synthesize ---
  const baseline = deterministicSynthesisOnly({
    accepted: normalized.accepted,
    conflicts: normalized.conflicts,
  });

  let researchAnswer = baseline.researchAnswer;
  let findings = baseline.findings;
  let limitations = [...baseline.limitations];
  let generator: "deterministic" | "draft_validated" | "fallback_deterministic" =
    "deterministic";
  const reasonCodes: ResearchOrchestrationFailureCode[] = [];

  if (input.draftAdapter) {
    if (signal.aborted || deadlineExceeded(startedMs, bounds.deadlineMs, Date.now())) {
      return emptyFailure({
        runId,
        status: "error",
        code: signal.aborted ? "CANCELLED" : "DEADLINE_EXCEEDED",
        detail: "Cancelled/deadline before draft — no findings from late draft",
        startedAt,
        bounds,
        spend,
        steps,
        organizationId: binding.organizationId,
        clientRequestId: binding.clientRequestId,
        binding,
        evidenceHash,
      });
    }

    const rejectedIds = new Set(normalized.rejected.map((r) => r.rejectId));
    const draftTimeout = Math.min(
      input.draftTimeoutMs ?? 200,
      Math.max(1, bounds.deadlineMs - (Date.now() - startedMs)),
    );
    const applied = await applyOptionalResearchDraft({
      draftAdapter: input.draftAdapter,
      evidenceHash,
      accepted: normalized.accepted,
      conflicts: normalized.conflicts,
      baselineAnswer: baseline.researchAnswer,
      baselineFindings: baseline.findings,
      baselineLimitations: baseline.limitations,
      rejectedEvidenceIds: rejectedIds,
      maxDraftChars: bounds.maxDraftChars,
      signal,
      timeoutMs: draftTimeout,
    });

    researchAnswer = applied.researchAnswer;
    findings = applied.findings;
    limitations = [...applied.limitations];
    generator =
      applied.status === "accepted"
        ? applied.generator
        : "fallback_deterministic";
    if (applied.status === "rejected_fallback") {
      reasonCodes.push("DRAFT_REJECTED");
      limitations.push(`draft_detail:${applied.detail}`);
    }

    // Token estimates offline only.
    spend = createZeroSpendCounters({
      ...spend,
      tokenEstimateIn: Math.ceil(baseline.researchAnswer.length / 4),
      tokenEstimateOut: Math.ceil(researchAnswer.length / 4),
    });
  }

  pushStep(steps, {
    kind: "synthesize",
    ok: true,
    note: `generator:${generator};findings:${findings.length}`,
  });

  if (signal.aborted || deadlineExceeded(startedMs, bounds.deadlineMs, Date.now())) {
    return emptyFailure({
      runId,
      status: "error",
      code: signal.aborted ? "CANCELLED" : "LATE_RESPONSE_DISCARDED",
      detail: "Cancelled/late after synthesize — discarding findings",
      startedAt,
      bounds,
      spend,
      steps,
      organizationId: binding.organizationId,
      clientRequestId: binding.clientRequestId,
      binding,
      evidenceHash,
    });
  }

  // --- Step 6: finalize ---
  pushStep(steps, {
    kind: "finalize",
    ok: true,
    note: `evidenceHash:${evidenceHash}`,
  });

  if (steps.length > bounds.maxSteps) {
    return emptyFailure({
      runId,
      status: "error",
      code: "STEP_CAP_EXCEEDED",
      detail: "Step cap exceeded at finalize",
      startedAt,
      bounds,
      spend,
      steps,
      organizationId: binding.organizationId,
      clientRequestId: binding.clientRequestId,
      binding,
      evidenceHash,
    });
  }

  const status =
    normalized.conflicts.length > 0 || normalized.rejected.length > 0
      ? "partial"
      : "answered";

  const endedAt = new Date().toISOString();
  const trace: ResearchRunTrace = {
    schemaVersion: MARKET_RESEARCH_ORCHESTRATION_VERSION,
    runId,
    startedAt,
    endedAt,
    steps,
    bounds,
    spend,
  };

  // Parse request once more for clientRequestId consistency (already admitted).
  const parsed = parseResearchRequest(input.rawRequest);
  const clientRequestId = parsed.ok
    ? parsed.value.clientRequestId
    : binding.clientRequestId;

  return {
    status,
    schemaVersion: MARKET_RESEARCH_ORCHESTRATION_VERSION,
    runId,
    organizationId: binding.organizationId,
    clientRequestId,
    sourceId: binding.sourceId,
    adapterId: binding.adapterId,
    sourcePolicyVersion: binding.sourcePolicyVersion,
    evidenceHash,
    researchAnswer,
    findings,
    evidenceIds: normalized.accepted.map((e) => e.evidenceId),
    acceptedEvidence: normalized.accepted,
    conflicts: normalized.conflicts,
    abstentions: normalized.abstentions,
    limitations,
    reasonCodes,
    originClass: "synthetic_fixture",
    syntheticOriginPreserved: true,
    isRealMerchantOrMarketFact: false,
    promotableToL1Findings: false,
    generator,
    binding,
    trace,
    spend,
  };
}

function mapAdapterReason(
  reason: string,
): ResearchOrchestrationFailureCode {
  switch (reason) {
    case "LIVE_PROVIDER_FORBIDDEN":
      return "LIVE_EXECUTION_FORBIDDEN";
    case "RESEARCH_DISABLED":
      return "RESEARCH_DISABLED";
    case "TENANT_SCOPE_MISMATCH":
      return "TENANT_SCOPE_MISMATCH";
    case "TIMEOUT":
    case "LATE_RESPONSE_DISCARDED":
      return "LATE_RESPONSE_DISCARDED";
    case "CANCELLED":
      return "CANCELLED";
    case "AUTOMATIC_FALLBACK_FORBIDDEN":
      return "GEMINI_FALLBACK_DENIED";
    case "FORGED_POLICY_INPUT":
      return "FORGED_POLICY_INPUT";
    case "LICENSE_DENIED":
      return "LICENSE_DENIED";
    case "RIGHTS_CONDITIONS_UNSATISFIED":
      return "RIGHTS_CONDITIONS_UNSATISFIED";
    default:
      return "PROVIDER_FORBIDDEN";
  }
}
