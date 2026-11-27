/**
 * AI-MKT-1c — honesty / claim-class guards.
 * Search interest, rankings, and reviews never become verified sales or engine facts.
 * Prompt-injection content is rejected from usable evidence.
 */

import { detectPromptInjection } from "@/lib/commerce-agent";
import type { MarketResearchAdapterSnippet } from "@/lib/market-research/adapters/types";
import type { EvidenceRejectCode } from "@/lib/market-research/normalize/types";
import type {
  ResearchEvidenceClaimClass,
  SignalClass,
} from "@/lib/market-research/types";

export type HonestyEvaluation =
  | { ok: true }
  | { ok: false; code: EvidenceRejectCode; detail: string };

const NON_SALES_SIGNALS: ReadonlySet<SignalClass> = new Set([
  "search_interest",
  "rank_proxy",
  "public_review",
  "editorial",
]);

const SALES_CLAIM_MARKERS: readonly RegExp[] = [
  /\bverified\s+sales\b/i,
  /\bunits?\s+sold\b/i,
  /\brevenue\b/i,
  /\bsell[- ]?through\b/i,
  /\bobserved_fact\b/i,
  /\bengine_calculation\b/i,
];

/**
 * Reject prompt-injection and dishonest claim/signal promotions.
 */
export function evaluateSnippetHonesty(
  snippet: MarketResearchAdapterSnippet,
): HonestyEvaluation {
  const text = snippet.text ?? "";
  if (detectPromptInjection(text)) {
    return {
      ok: false,
      code: "PROMPT_INJECTION_SUSPECT",
      detail: `Snippet '${snippet.snippetId}' contains prompt-injection markers`,
    };
  }

  if (snippet.isRealMerchantOrMarketFact !== false) {
    return {
      ok: false,
      code: "HONESTY_VIOLATION",
      detail: `Snippet '${snippet.snippetId}' must declare isRealMerchantOrMarketFact=false`,
    };
  }

  if (snippet.attemptedPromotionTo) {
    return {
      ok: false,
      code: "PROMOTION_REJECTED",
      detail: `Snippet '${snippet.snippetId}' attempted promotion to '${snippet.attemptedPromotionTo}' rejected`,
    };
  }

  // External rankings / search interest / reviews never become verified sales.
  if (NON_SALES_SIGNALS.has(snippet.signalClass)) {
    for (const pattern of SALES_CLAIM_MARKERS) {
      if (pattern.test(text)) {
        return {
          ok: false,
          code: "SIGNAL_NOT_SALES",
          detail: `Snippet '${snippet.snippetId}' signal '${snippet.signalClass}' must not claim sales/engine facts`,
        };
      }
    }
  }

  // Hypothesis / estimate must stay labeled — not silently upgraded.
  if (
    (snippet.claimClass === "hypothesis" || snippet.claimClass === "estimate") &&
    /\b(confirmed|verified|proven)\s+(fact|sales|demand)\b/i.test(text)
  ) {
    return {
      ok: false,
      code: "PROMOTION_REJECTED",
      detail: `Snippet '${snippet.snippetId}' ${snippet.claimClass} must not promote to confirmed fact`,
    };
  }

  return { ok: true };
}

/**
 * Confidence ordinal from match + freshness + independence + license — never a sales probability.
 */
export function deriveConfidenceClass(input: {
  matchQuality: "exact" | "partial" | "mismatch" | "unknown";
  freshnessClass: "current" | "stale" | "unknown";
  independenceClass: "independent" | "duplicate" | "unknown";
  licenseOk: boolean;
}): "low" | "medium" | "high" {
  if (!input.licenseOk) return "low";
  if (input.matchQuality === "mismatch" || input.matchQuality === "unknown") {
    return "low";
  }
  if (input.independenceClass === "duplicate") return "low";

  let score = 0;
  if (input.matchQuality === "exact") score += 2;
  else if (input.matchQuality === "partial") score += 1;

  if (input.freshnessClass === "current") score += 2;
  else if (input.freshnessClass === "stale") score += 0;
  else score += 0;

  if (input.independenceClass === "independent") score += 1;

  if (score >= 5) return "high";
  if (score >= 3) return "medium";
  return "low";
}

export function claimRequiresCitation(
  claimClass: ResearchEvidenceClaimClass,
): boolean {
  return claimClass === "sourced_signal";
}
