/**
 * AI-INV-1.1 — SKU-specific guidance situation from server evidence only.
 * Never invents causes, demand, profit, lost sales, forecasts, or buy qty.
 */

import {
  isHighCoverReview,
  isKnownOutOfStock,
  isLimitedHistoryEvidence,
  isLowCoverAttention,
  LIMITED_HISTORY_ELIGIBLE_DAYS,
} from "@/lib/inventory-intelligence/attention";
import type { MerchantInventoryIntelligenceRow } from "@/lib/inventory-intelligence/types";
import type {
  IncomingTrustClass,
  InventoryExplainerQuestionId,
} from "@/lib/inventory-explainer/types";

export const GUIDANCE_SITUATION_VERSION =
  "inventory-explainer-guidance-situation-v1" as const;

export type GuidanceSituationId =
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

export type GuidanceSituation = {
  id: GuidanceSituationId;
  /** One-line merchant significance — observed evidence only. */
  significance: string;
  /** Untested hypotheses for zero-sales / demand investigation (never confirmed). */
  untestedHypotheses: readonly string[];
  /** Ranked contextual question ids for this SKU (most useful first). */
  rankedQuestionIds: readonly InventoryExplainerQuestionId[];
};

function hasPositiveVelocity(row: MerchantInventoryIntelligenceRow): boolean {
  return (
    row.salesVelocity30d !== null &&
    Number.isFinite(row.salesVelocity30d) &&
    row.salesVelocity30d > 0
  );
}

function hasKnownZeroVelocity(row: MerchantInventoryIntelligenceRow): boolean {
  return (
    row.coverStatus === "zero_demand" ||
    (row.salesVelocity30d !== null &&
      Number.isFinite(row.salesVelocity30d) &&
      row.salesVelocity30d === 0)
  );
}

const ZERO_SALES_UNTESTED_HYPOTHESES = [
  "Insufficient eligible sales history for a stable read (untested)",
  "Listing visibility or discoverability gap (untested)",
  "Conversion friction on product page (untested)",
  "Listing quality / media / copy issues (untested)",
  "Price positioning relative to alternatives (untested)",
  "Seasonality or timing outside the observed window (untested)",
  "Shoppers preferring a different variant or color (untested)",
] as const;

/**
 * Classify the primary merchant-guidance situation for one grain.
 */
export function classifyGuidanceSituation(input: {
  row: MerchantInventoryIntelligenceRow;
  stockObservationsStale: boolean;
  incomingTrust: IncomingTrustClass;
}): GuidanceSituation {
  const { row, stockObservationsStale } = input;
  const place = `${row.storeName} / ${row.locationName}`;
  const shortHistory =
    row.coverStatus === "short_history" || isLimitedHistoryEvidence(row);

  // Stale / pending take priority for cover truthfulness when observations lag.
  if (row.coverStatus === "pending_freshness") {
    return {
      id: "pending_metrics",
      significance: `${row.sku} at ${place} still has demand metrics updating — treat cover and thresholds as not current.`,
      untestedHypotheses: [],
      rankedQuestionIds: [
        "missing_data",
        "cover_unavailable",
        "verify_before_replenishing",
        "why_flagged",
        "sales_rate_meaning",
      ],
    };
  }

  if (row.coverStatus === "stale" || stockObservationsStale) {
    if (isKnownOutOfStock(row) && hasPositiveVelocity(row)) {
      return {
        id: "recorded_oos_with_positive_sales",
        significance: `${row.sku} at ${place} was last recorded at zero available while historical sales were positive — verify whether stock is still unavailable before treating this as a buying signal.`,
        untestedHypotheses: [],
        rankedQuestionIds: [
          "why_flagged",
          "verify_before_replenishing",
          "sales_rate_meaning",
          "missing_data",
          "cover_unavailable",
        ],
      };
    }

    if (hasKnownZeroVelocity(row) && !isKnownOutOfStock(row)) {
      return {
        id: "in_stock_zero_observed_sales",
        significance: `${row.sku} at ${place} shows recorded available stock with known-zero sales in the velocity window, and cover is not current — investigate demand/visibility with fresh evidence; zero observed sales is not a confirmed preference conclusion.`,
        untestedHypotheses: [...ZERO_SALES_UNTESTED_HYPOTHESES],
        rankedQuestionIds: [
          "sales_rate_meaning",
          "why_flagged",
          "verify_before_replenishing",
          "missing_data",
          "cover_unavailable",
        ],
      };
    }

    return {
      id: "stale_stock_or_metrics",
      significance: `${row.sku} at ${place} has stale or lagged stock/metric evidence — stale is not treated as current cover or live availability.`,
      untestedHypotheses: [],
      rankedQuestionIds: [
        "cover_unavailable",
        "missing_data",
        "verify_before_replenishing",
        "why_flagged",
        "sales_rate_meaning",
      ],
    };
  }

  if (row.coverStatus === "missing_metric") {
    return {
      id: "missing_metrics",
      significance: `${row.sku} at ${place} is missing current demand metrics — guidance stays limited until metrics activate.`,
      untestedHypotheses: [],
      rankedQuestionIds: [
        "missing_data",
        "verify_before_replenishing",
        "why_flagged",
        "cover_unavailable",
        "sales_rate_meaning",
      ],
    };
  }

  if (row.coverStatus === "unknown_stock" || row.availableQuantity === null) {
    return {
      id: "unknown_stock",
      significance: `${row.sku} at ${place} has unknown available quantity — unknown is not treated as zero.`,
      untestedHypotheses: [],
      rankedQuestionIds: [
        "missing_data",
        "why_flagged",
        "cover_unavailable",
        "verify_before_replenishing",
        "sales_rate_meaning",
      ],
    };
  }

  if (
    row.coverStatus === "unknown_demand" ||
    (row.salesVelocity30d === null && row.coverStatus !== "zero_demand")
  ) {
    return {
      id: "unknown_or_missing_demand",
      significance: `${row.sku} at ${place} has unknown demand evidence — unknown is distinct from known-zero sales.`,
      untestedHypotheses: [],
      rankedQuestionIds: [
        "sales_rate_meaning",
        "missing_data",
        "cover_unavailable",
        "why_flagged",
        "verify_before_replenishing",
      ],
    };
  }

  if (isKnownOutOfStock(row) && hasPositiveVelocity(row)) {
    return {
      id: "recorded_oos_with_positive_sales",
      significance: `${row.sku} at ${place} has known available quantity zero with positive historical sales rate — confirm live availability and evidence freshness before any replenishment review.`,
      untestedHypotheses: [],
      rankedQuestionIds: [
        "why_flagged",
        "verify_before_replenishing",
        "sales_rate_meaning",
        "missing_data",
        "cover_unavailable",
      ],
    };
  }

  if (isKnownOutOfStock(row)) {
    return {
      id: "recorded_oos_without_positive_sales",
      significance: `${row.sku} at ${place} has known available quantity zero without a positive sales-rate signal — verify stock truth before interpreting demand.`,
      untestedHypotheses: hasKnownZeroVelocity(row)
        ? [...ZERO_SALES_UNTESTED_HYPOTHESES]
        : [],
      rankedQuestionIds: [
        "why_flagged",
        "missing_data",
        "verify_before_replenishing",
        "sales_rate_meaning",
        "cover_unavailable",
      ],
    };
  }

  if (hasKnownZeroVelocity(row)) {
    return {
      id: "in_stock_zero_observed_sales",
      significance: `${row.sku} at ${place} has recorded available stock and known-zero sales in the 30-day window — that is an observed sales gap, not a confirmed preference or quality conclusion.`,
      untestedHypotheses: [...ZERO_SALES_UNTESTED_HYPOTHESES],
      rankedQuestionIds: [
        "sales_rate_meaning",
        "why_flagged",
        "verify_before_replenishing",
        "missing_data",
        "cover_unavailable",
      ],
    };
  }

  if (shortHistory) {
    const eligible =
      row.eligibleDays30d !== null
        ? `${row.eligibleDays30d} of 30 eligible days`
        : `under ${LIMITED_HISTORY_ELIGIBLE_DAYS} eligible days`;
    return {
      id: "in_stock_short_history",
      significance: `${row.sku} at ${place} has limited sales history (${eligible}) — treat velocity and cover cautiously until more eligible days accumulate.`,
      untestedHypotheses: [],
      rankedQuestionIds: [
        "sales_rate_meaning",
        "cover_unavailable",
        "missing_data",
        "why_flagged",
        "verify_before_replenishing",
      ],
    };
  }

  if (isLowCoverAttention(row)) {
    return {
      id: "low_cover_review",
      significance: `${row.sku} at ${place} has calculable low cover — a review heuristic from trusted velocity and quantity, not a purchase authorization.`,
      untestedHypotheses: [],
      rankedQuestionIds: [
        "why_flagged",
        "verify_before_replenishing",
        "sales_rate_meaning",
        "cover_unavailable",
        "missing_data",
      ],
    };
  }

  if (isHighCoverReview(row)) {
    return {
      id: "high_cover_review",
      significance: `${row.sku} at ${place} has calculable high cover — a review signal only, not an overstock or cash claim.`,
      untestedHypotheses: [],
      rankedQuestionIds: [
        "why_flagged",
        "sales_rate_meaning",
        "verify_before_replenishing",
        "missing_data",
        "cover_unavailable",
      ],
    };
  }

  return {
    id: "in_stock_stable_review",
    significance: `${row.sku} at ${place} has trusted stock and metric fields available for review — commercial recommendations stay unauthorized.`,
    untestedHypotheses: [],
    rankedQuestionIds: [
      "why_flagged",
      "sales_rate_meaning",
      "verify_before_replenishing",
      "missing_data",
      "cover_unavailable",
    ],
  };
}
