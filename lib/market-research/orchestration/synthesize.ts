/**
 * AI-MKT-1d — deterministic synthesis + draft apply/fallback.
 * Never promotes synthetic researchEvidence into real merchant/L1 facts.
 */

import type { NormalizedEvidenceItem } from "@/lib/market-research/normalize/types";
import type { ResearchConflict } from "@/lib/market-research/types";
import {
  assertLiveResearchDraftForbidden,
  validateMarketResearchAnswerDraft,
  type MarketResearchDraftAdapter,
} from "@/lib/market-research/orchestration/draft";
import type {
  MarketResearchDraftRejectionCode,
  ObservationTimeClaim,
  ValidatedResearchFinding,
} from "@/lib/market-research/orchestration/types";

function observationClassFor(
  item: NormalizedEvidenceItem,
): ObservationTimeClaim {
  if (!item.observationKnown || item.freshnessClass === "unknown") {
    return "unknown";
  }
  if (item.freshnessClass === "stale") {
    return "historical";
  }
  return "current";
}

function limitationsFor(
  item: NormalizedEvidenceItem,
  conflicts: ReadonlySet<string>,
): string[] {
  const limitations: string[] = [
    "synthetic_fixture_only",
    "not_a_real_merchant_or_market_fact",
    "not_promotable_to_l1_findings",
  ];

  if (item.matchQuality === "partial") {
    limitations.push("partial_product_match_not_exact_sku");
  }
  if (item.matchQuality === "unknown") {
    limitations.push("unknown_product_match");
  }
  if (item.freshnessClass === "stale") {
    limitations.push("historical_observation_only");
  }
  if (item.freshnessClass === "unknown" || !item.observationKnown) {
    limitations.push("observation_period_unknown_not_current");
  }
  if (
    item.signalClass === "search_interest" ||
    item.signalClass === "rank_proxy" ||
    item.signalClass === "public_review"
  ) {
    limitations.push("signal_is_not_verified_sales");
  }
  if (conflicts.has(item.evidenceId)) {
    limitations.push("conflict_present_no_certainty_inflation");
  }
  if (
    item.independenceClass === "duplicate" ||
    item.independenceClass === "unknown"
  ) {
    limitations.push("independence_not_proven");
  }
  return limitations;
}

/**
 * Build typed findings strictly from accepted normalized evidence.
 */
export function synthesizeDeterministicFindings(input: {
  accepted: readonly NormalizedEvidenceItem[];
  conflicts: readonly ResearchConflict[];
}): {
  findings: readonly ValidatedResearchFinding[];
  researchAnswer: string;
  limitations: readonly string[];
} {
  const conflictIds = new Set<string>();
  for (const c of input.conflicts) {
    for (const id of c.evidenceIds) conflictIds.add(id);
  }

  const findings: ValidatedResearchFinding[] = input.accepted.map((item) => ({
    findingId: `mkt1d-finding:${item.evidenceId}`,
    evidenceId: item.evidenceId,
    claimClass: item.claimClass,
    signalClass: item.signalClass,
    label: item.label,
    value: item.rawValue,
    unit: item.unit,
    countryCode: item.countryCode,
    currencyCode: item.currencyCode,
    matchQuality: item.matchQuality,
    freshnessClass: item.freshnessClass,
    observationClass: observationClassFor(item),
    confidenceClass:
      conflictIds.has(item.evidenceId) ||
      item.independenceClass !== "independent" ||
      item.matchQuality !== "exact"
        ? item.confidenceClass === "high"
          ? "medium"
          : item.confidenceClass
        : item.confidenceClass,
    certaintyInflated: false,
    limitations: limitationsFor(item, conflictIds),
    syntheticOriginPreserved: true,
    isRealMerchantOrMarketFact: false,
  }));

  const lines = findings.map((f) => {
    const unit = f.unit ? ` ${f.unit}` : "";
    return `- [${f.signalClass}/${f.claimClass}] ${f.label}: ${f.value}${unit} (${f.countryCode}; match=${f.matchQuality}; obs=${f.observationClass})`;
  });

  const limitations = [
    "AI-MKT-1d offline synthetic research only",
    "Search/rank/review signals are not verified sales",
    "Partial product matches cannot support exact-SKU conclusions",
    "Stale evidence is historical only; unknown observation is not current",
    "Synthetic origin preserved; not promotable to L1 findings",
    "No purchasing, price changes, ads, supplier contact, or inventory mutation",
  ];

  if (input.conflicts.length > 0) {
    limitations.push("Conflicts present — no invented consensus");
  }

  const researchAnswer =
    findings.length === 0
      ? "Insufficient accepted market research evidence to answer."
      : [
          "SYNTHETIC market research summary (not live; not merchant facts):",
          ...lines,
          input.conflicts.length > 0
            ? `Conflicts: ${input.conflicts.map((c) => c.conflictId).join(", ")}`
            : "Conflicts: none",
        ].join("\n");

  return { findings, researchAnswer, limitations };
}

export type ApplyResearchDraftResult =
  | {
      status: "accepted";
      researchAnswer: string;
      findings: readonly ValidatedResearchFinding[];
      limitations: readonly string[];
      generator: "draft_validated";
    }
  | {
      status: "rejected_fallback";
      researchAnswer: string;
      findings: readonly ValidatedResearchFinding[];
      limitations: readonly string[];
      reasons: readonly MarketResearchDraftRejectionCode[];
      detail: string;
      generator: "fallback_deterministic";
    };

/**
 * Optional offline draft polish. Invalid drafts fall back to deterministic evidence-only answer.
 */
export async function applyOptionalResearchDraft(input: {
  draftAdapter: MarketResearchDraftAdapter | undefined;
  evidenceHash: string;
  accepted: readonly NormalizedEvidenceItem[];
  conflicts: readonly ResearchConflict[];
  baselineAnswer: string;
  baselineFindings: readonly ValidatedResearchFinding[];
  baselineLimitations: readonly string[];
  rejectedEvidenceIds?: ReadonlySet<string>;
  maxDraftChars: number;
  signal: AbortSignal;
  timeoutMs: number;
}): Promise<ApplyResearchDraftResult> {
  const fallback = (
    reasons: readonly MarketResearchDraftRejectionCode[],
    detail: string,
  ): ApplyResearchDraftResult => ({
    status: "rejected_fallback",
    researchAnswer: input.baselineAnswer,
    findings: input.baselineFindings,
    limitations: input.baselineLimitations,
    reasons,
    detail,
    generator: "fallback_deterministic",
  });

  if (!input.draftAdapter) {
    return fallback(
      ["DRAFT_UNAVAILABLE"],
      "No draft adapter; caller should use deterministicSynthesisOnly",
    );
  }

  if (assertLiveResearchDraftForbidden(input.draftAdapter)) {
    return fallback(["LIVE_PROVIDER_FORBIDDEN"], "Live draft provider forbidden");
  }

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (input.signal.aborted) {
    return fallback(["DRAFT_TIMEOUT"], "Draft cancelled before start");
  }
  input.signal.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(), input.timeoutMs);

  try {
    const generated = await input.draftAdapter.generate(
      {
        evidenceHash: input.evidenceHash,
        researchAnswerBaseline: input.baselineAnswer,
        evidenceIds: input.accepted.map((e) => e.evidenceId),
        accepted: input.accepted,
      },
      {
        signal: controller.signal,
        timeoutMs: input.timeoutMs,
        maxDraftChars: input.maxDraftChars,
      },
    );

    if (!generated.ok) {
      return fallback([generated.reason], generated.detail);
    }

    const validation = validateMarketResearchAnswerDraft({
      draft: generated.draft,
      evidenceHash: input.evidenceHash,
      accepted: input.accepted,
      conflicts: input.conflicts,
      rejectedEvidenceIds: input.rejectedEvidenceIds,
      maxDraftChars: input.maxDraftChars,
    });

    if (!validation.ok) {
      return {
        status: "rejected_fallback",
        researchAnswer: input.baselineAnswer,
        findings: input.baselineFindings,
        limitations: [
          ...input.baselineLimitations,
          `draft_rejected:${validation.reasons.join(",")}`,
        ],
        reasons: validation.reasons,
        detail: validation.detail,
        generator: "fallback_deterministic",
      };
    }

    // Draft may polish prose only — findings stay evidence-bound deterministic rows.
    return {
      status: "accepted",
      researchAnswer: generated.draft.researchAnswer.trim(),
      findings: input.baselineFindings,
      limitations: input.baselineLimitations,
      generator: "draft_validated",
    };
  } catch {
    return fallback(["DRAFT_TIMEOUT"], "Draft adapter aborted or timed out");
  } finally {
    clearTimeout(timer);
    input.signal.removeEventListener("abort", onAbort);
  }
}

/**
 * Correct entry when no draft adapter is injected.
 */
export function deterministicSynthesisOnly(input: {
  accepted: readonly NormalizedEvidenceItem[];
  conflicts: readonly ResearchConflict[];
}): {
  researchAnswer: string;
  findings: readonly ValidatedResearchFinding[];
  limitations: readonly string[];
  generator: "deterministic";
} {
  const synth = synthesizeDeterministicFindings(input);
  return {
    ...synth,
    generator: "deterministic",
  };
}
