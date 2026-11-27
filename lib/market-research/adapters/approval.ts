/**
 * AI-MKT-1b — separate provider approval / data-egress gates.
 *
 * Distinct from: source rights, tenant authorization, and research enablement.
 * OpenAI design-candidate approval ≠ live rights.
 * Gemini display-only candidate ≠ warehouse / live / automatic fallback.
 */

import {
  MARKET_ADAPTER_IDS,
  MARKET_SOURCE_IDS,
} from "@/lib/market-research/types";
import type { MarketResearchAdapterFailureReason } from "@/lib/market-research/adapters/types";

export type MarketResearchProviderApproval = {
  /** Design-candidate registration for offline fixtures. */
  openaiDesignCandidateApproved: true;
  /** Live OpenAI execution — never true in AI-MKT-1b. */
  openaiLiveApproved: false;
  /** Display-only candidate for offline policy tests. */
  geminiDisplayOnlyCandidateApproved: true;
  /** Live Gemini execution — never true in AI-MKT-1b. */
  geminiLiveApproved: false;
  /** Automatic fallback to Gemini — never true by default in 1b. */
  geminiAutomaticFallbackApproved: false;
  /** Any real provider data egress — never true in 1b. */
  dataEgressAllowed: false;
};

const DEFAULT_APPROVAL: MarketResearchProviderApproval = {
  openaiDesignCandidateApproved: true,
  openaiLiveApproved: false,
  geminiDisplayOnlyCandidateApproved: true,
  geminiLiveApproved: false,
  geminiAutomaticFallbackApproved: false,
  dataEgressAllowed: false,
};

export function getDefaultProviderApproval(): MarketResearchProviderApproval {
  return { ...DEFAULT_APPROVAL };
}

export type ProviderApprovalEvaluation =
  | { ok: true }
  | {
      ok: false;
      reason: MarketResearchAdapterFailureReason;
      detail: string;
    };

/**
 * Evaluate provider approval separately from source rights / tenant scope.
 * Requesting live network or egress always fails closed.
 */
/** Runtime approval view — widens literals so forged overrides fail closed. */
type ApprovalView = {
  openaiDesignCandidateApproved: boolean;
  openaiLiveApproved: boolean;
  geminiDisplayOnlyCandidateApproved: boolean;
  geminiLiveApproved: boolean;
  geminiAutomaticFallbackApproved: boolean;
  dataEgressAllowed: boolean;
};

function asApprovalView(
  approval: MarketResearchProviderApproval | undefined,
): ApprovalView {
  const base = approval ?? getDefaultProviderApproval();
  return {
    openaiDesignCandidateApproved: base.openaiDesignCandidateApproved === true,
    openaiLiveApproved: Boolean(
      (base as ApprovalView).openaiLiveApproved === true,
    ),
    geminiDisplayOnlyCandidateApproved:
      base.geminiDisplayOnlyCandidateApproved === true,
    geminiLiveApproved: Boolean(
      (base as ApprovalView).geminiLiveApproved === true,
    ),
    geminiAutomaticFallbackApproved: Boolean(
      (base as ApprovalView).geminiAutomaticFallbackApproved === true,
    ),
    dataEgressAllowed: Boolean(
      (base as ApprovalView).dataEgressAllowed === true,
    ),
  };
}

export function evaluateProviderApproval(input: {
  sourceId: string;
  adapterId: string;
  requestLiveNetwork?: unknown;
  requestDataEgress?: unknown;
  requestAutomaticFallback?: unknown;
  approval?: MarketResearchProviderApproval;
}): ProviderApprovalEvaluation {
  const approval = asApprovalView(input.approval);

  if (input.requestLiveNetwork === true) {
    return {
      ok: false,
      reason: "LIVE_PROVIDER_FORBIDDEN",
      detail: "Live provider execution is forbidden in AI-MKT-1b",
    };
  }

  if (input.requestDataEgress === true || approval.dataEgressAllowed) {
    return {
      ok: false,
      reason: "DATA_EGRESS_FORBIDDEN",
      detail: "Provider data egress is forbidden in AI-MKT-1b offline adapters",
    };
  }

  if (input.requestAutomaticFallback === true) {
    if (!approval.geminiAutomaticFallbackApproved) {
      return {
        ok: false,
        reason: "AUTOMATIC_FALLBACK_FORBIDDEN",
        detail:
          "Automatic Gemini fallback is forbidden unless separately approved",
      };
    }
  }

  if (
    input.sourceId === MARKET_SOURCE_IDS.OPENAI_WEB_SEARCH ||
    input.adapterId === MARKET_ADAPTER_IDS.OPENAI_WEB_SEARCH
  ) {
    if (approval.openaiLiveApproved) {
      return {
        ok: false,
        reason: "LIVE_PROVIDER_FORBIDDEN",
        detail:
          "OpenAI live approval must remain false; design candidate ≠ live rights",
      };
    }
    if (!approval.openaiDesignCandidateApproved) {
      return {
        ok: false,
        reason: "PROVIDER_FORBIDDEN",
        detail: "OpenAI design candidate is not approved",
      };
    }
    return { ok: true };
  }

  if (
    input.sourceId === MARKET_SOURCE_IDS.GEMINI_SEARCH_GROUNDING ||
    input.adapterId === MARKET_ADAPTER_IDS.GEMINI_SEARCH_GROUNDING
  ) {
    if (approval.geminiLiveApproved) {
      return {
        ok: false,
        reason: "LIVE_PROVIDER_FORBIDDEN",
        detail: "Gemini live approval must remain false in AI-MKT-1b",
      };
    }
    if (!approval.geminiDisplayOnlyCandidateApproved) {
      return {
        ok: false,
        reason: "PROVIDER_FORBIDDEN",
        detail: "Gemini display-only candidate is not approved",
      };
    }
    return { ok: true };
  }

  if (input.sourceId === MARKET_SOURCE_IDS.MERCHANT_INTERNAL) {
    return { ok: true };
  }

  return {
    ok: false,
    reason: "PROVIDER_FORBIDDEN",
    detail: `Provider approval denied for source '${input.sourceId}'`,
  };
}

/** Explicit non-implication: OpenAI design candidate ≠ live rights. */
export function openaiDesignCandidateImpliesLiveApproval(): false {
  return false;
}
