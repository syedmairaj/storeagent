/**
 * AI-MKT-1d — hard execution bounds (≤ AI-ARCH ceilings).
 * No recursive planning, uncontrolled retry, or production spend ledger.
 */

import {
  RESEARCH_ARCH_MAX_DEADLINE_MS,
  RESEARCH_ARCH_MAX_STEPS,
  RESEARCH_ARCH_MAX_TOOL_CALLS,
  RESEARCH_DEFAULT_DEADLINE_MS,
  RESEARCH_DEFAULT_MAX_DRAFT_CHARS,
  RESEARCH_DEFAULT_MAX_PAYLOAD_BYTES,
  RESEARCH_DEFAULT_MAX_RETRIES,
  RESEARCH_DEFAULT_MAX_STEPS,
  RESEARCH_DEFAULT_MAX_TOOL_CALLS,
  type ResearchExecutionBounds,
  type ResearchSpendCounters,
} from "@/lib/market-research/orchestration/types";

export type BoundsOverrideInput = {
  maxSteps?: unknown;
  maxToolCalls?: unknown;
  deadlineMs?: unknown;
  maxRetries?: unknown;
  maxPayloadBytes?: unknown;
  maxDraftChars?: unknown;
};

function asPositiveInt(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  const n = Math.floor(value);
  return n > 0 ? n : fallback;
}

/**
 * Resolve research bounds. Research may lower ceilings; never exceed ARCH max.
 * Caller-supplied oversize values are clamped (not trusted as authority to raise).
 */
export function resolveResearchExecutionBounds(
  overrides?: BoundsOverrideInput | null,
): ResearchExecutionBounds {
  const maxSteps = Math.min(
    asPositiveInt(overrides?.maxSteps, RESEARCH_DEFAULT_MAX_STEPS),
    RESEARCH_ARCH_MAX_STEPS,
  );
  const maxToolCalls = Math.min(
    asPositiveInt(overrides?.maxToolCalls, RESEARCH_DEFAULT_MAX_TOOL_CALLS),
    RESEARCH_ARCH_MAX_TOOL_CALLS,
  );
  const deadlineMs = Math.min(
    asPositiveInt(overrides?.deadlineMs, RESEARCH_DEFAULT_DEADLINE_MS),
    RESEARCH_ARCH_MAX_DEADLINE_MS,
  );
  const rawRetries =
    typeof overrides?.maxRetries === "number" && Number.isFinite(overrides.maxRetries)
      ? Math.floor(overrides.maxRetries)
      : RESEARCH_DEFAULT_MAX_RETRIES;
  const maxRetries = Math.min(Math.max(0, rawRetries), 1);
  const maxPayloadBytes = Math.min(
    asPositiveInt(overrides?.maxPayloadBytes, RESEARCH_DEFAULT_MAX_PAYLOAD_BYTES),
    256_000,
  );
  const maxDraftChars = Math.min(
    asPositiveInt(overrides?.maxDraftChars, RESEARCH_DEFAULT_MAX_DRAFT_CHARS),
    RESEARCH_DEFAULT_MAX_DRAFT_CHARS,
  );

  return {
    maxSteps,
    maxToolCalls,
    deadlineMs,
    maxRetries,
    maxPayloadBytes,
    maxDraftChars,
  };
}

export function createZeroSpendCounters(
  partial?: Partial<Omit<ResearchSpendCounters, "actualSpend" | "credits">>,
): ResearchSpendCounters {
  return {
    actualSpend: 0,
    credits: 0,
    tokenEstimateIn: partial?.tokenEstimateIn ?? 0,
    tokenEstimateOut: partial?.tokenEstimateOut ?? 0,
    adapterCalls: partial?.adapterCalls ?? 0,
    failedAttempts: partial?.failedAttempts ?? 0,
    retriesUsed: partial?.retriesUsed ?? 0,
  };
}

export function estimatePayloadBytes(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export function deadlineExceeded(startedMs: number, deadlineMs: number, nowMs: number): boolean {
  return nowMs - startedMs >= deadlineMs;
}

/**
 * Reject attempts to assert production spend / credit ledger in 1d.
 */
export function assertOfflineSpendOnly(input: {
  claimActualSpend?: unknown;
  claimCredits?: unknown;
  claimLedgerSettlement?: unknown;
}): { ok: true } | { ok: false; detail: string } {
  if (input.claimActualSpend !== undefined && input.claimActualSpend !== 0) {
    return {
      ok: false,
      detail: "AI-MKT-1d forbids non-zero actual spend claims",
    };
  }
  if (input.claimCredits !== undefined && input.claimCredits !== 0) {
    return {
      ok: false,
      detail: "AI-MKT-1d forbids non-zero credit claims (ledger deferred to 1.1)",
    };
  }
  if (
    input.claimLedgerSettlement !== undefined &&
    input.claimLedgerSettlement !== "not_applicable"
  ) {
    return {
      ok: false,
      detail: "AI-MKT-1d forbids production credit ledger settlement claims",
    };
  }
  return { ok: true };
}
