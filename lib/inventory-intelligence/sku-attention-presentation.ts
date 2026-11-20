/**
 * UX-INV-1b / 1b.1 presentation layer:
 * stock condition ≠ cover availability ≠ decision eligibility.
 * SKU evidence uses trusted row fields only — no risk scores, financial
 * estimates, confidence, or M7 actions.
 */

import {
  HIGH_COVER_REVIEW_DAYS,
  isHighCoverReview,
  isKnownOutOfStock,
  isLimitedHistoryEvidence,
  isLowCoverAttention,
  LOW_COVER_ATTENTION_DAYS,
} from "@/lib/inventory-intelligence/attention";
import type {
  InventoryCoverStatus,
  MerchantInventoryIntelligenceRow,
} from "@/lib/inventory-intelligence/types";

/** Adverse / review stock state — independent of whether cover math succeeded. */
export type StockConditionKind =
  | "out_of_stock"
  | "last_recorded_out_of_stock"
  | "unknown_stock"
  | "review_low_cover"
  | "review_high_cover"
  | "in_stock";

/** Whether days-of-stock could be computed from trusted metrics. */
export type CoverAvailabilityKind = "calculable" | "unavailable";

/**
 * Commercial decision eligibility. UX-INV-1b keeps this hard-off —
 * planning complete / calculable cover ≠ authorized REORDER/REDUCE/etc.
 */
export type DecisionEligibilityKind = "unauthorized";

export type SkuEvidenceFact = {
  id: string;
  label: string;
  value: string;
  /** Trusted field provenance for tests / audits. */
  source: string;
};

export type SkuEvidenceBundle = {
  /** SKU · product · store · location */
  identityLine: string;
  facts: readonly SkuEvidenceFact[];
  missingLabels: readonly string[];
  nextStep: string;
  /** Compact SKU-specific lines for disclosure (no section-level boilerplate). */
  lines: readonly string[];
  /** Plain-language reading of trusted signals — not AI narrative. */
  interpretation: string;
  /** True when velocity/cover/thresholds should be read as historical. */
  metricIsHistorical: boolean;
};

export type SkuAttentionPresentation = {
  stockCondition: StockConditionKind;
  stockConditionLabel: string;
  stockConditionDetail: string | null;
  coverAvailability: CoverAvailabilityKind;
  coverAvailabilityLabel: string;
  coverAvailabilityDetail: string | null;
  decisionEligibility: DecisionEligibilityKind;
  decisionEligibilityLabel: string;
  /** Tone for stock condition (never “healthy” solely because cover is calculable). */
  stockTone: "critical" | "attention" | "review" | "neutral" | "uncertain";
  showLimitedHistoryDisclosure: boolean;
  evidence: SkuEvidenceBundle;
};

export type SkuAttentionContext = {
  /**
   * When true, known-zero available is “last recorded out of stock” —
   * never presented as live OOS.
   */
  stockObservationsStale: boolean;
};

export function resolveStockCondition(
  row: MerchantInventoryIntelligenceRow,
  context: SkuAttentionContext,
): StockConditionKind {
  if (row.availableQuantity === null) {
    return "unknown_stock";
  }
  if (isKnownOutOfStock(row)) {
    return context.stockObservationsStale
      ? "last_recorded_out_of_stock"
      : "out_of_stock";
  }
  if (isLowCoverAttention(row)) {
    return "review_low_cover";
  }
  if (isHighCoverReview(row)) {
    return "review_high_cover";
  }
  return "in_stock";
}

export function resolveCoverAvailability(
  row: MerchantInventoryIntelligenceRow,
): CoverAvailabilityKind {
  return row.coverStatus === "valid" && row.daysOfStock !== null
    ? "calculable"
    : "unavailable";
}

function formatDays(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(1);
}

function formatObserved(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    return "unknown date";
  }
  return new Date(ms).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatVelocity(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(2).replace(/\.?0+$/, "");
}

function knownThreshold(
  value: number | null | undefined,
  reasonCode: string | null | undefined,
): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (reasonCode !== null && reasonCode !== undefined) {
    return null;
  }
  return value;
}

export function coverUnavailableReasonLabel(
  status: InventoryCoverStatus,
): string {
  switch (status) {
    case "zero_demand":
      return "No sales observed";
    case "stale":
      return "Stale metrics";
    case "pending_freshness":
      return "Pending metrics";
    case "unknown_stock":
      return "Unknown stock";
    case "short_history":
      return "Short history";
    case "unknown_demand":
      return "Unknown demand (≠ 0)";
    case "missing_metric":
      return "Missing metrics";
    case "valid":
      return "Cover calculated";
  }
}

function resolveNextStep(
  row: MerchantInventoryIntelligenceRow,
  context: SkuAttentionContext,
): string {
  if (context.stockObservationsStale || row.coverStatus === "stale") {
    return "Upload updated stock for this store/location on the store-local as-of date, then activate demand metrics.";
  }
  if (row.coverStatus === "pending_freshness") {
    return "Wait for demand metrics to finish updating for this SKU grain.";
  }
  if (row.coverStatus === "missing_metric") {
    return "Activate demand metrics after sales and current-day stock exist for this SKU, store, and location.";
  }
  if (
    row.coverStatus === "unknown_demand" ||
    row.coverStatus === "short_history"
  ) {
    return "Accumulate more eligible sales days before treating cover as decision-ready.";
  }
  if (row.coverStatus === "unknown_stock") {
    return "Re-import inventory with a known available quantity for this SKU.";
  }
  if (isKnownOutOfStock(row) || isLowCoverAttention(row)) {
    return "Review this SKU against your replenishment assumptions — commercial recommendations stay unauthorized.";
  }
  if (isHighCoverReview(row)) {
    return "Review high cover against your targets — not an automatic overstock or cash claim.";
  }
  return "Keep stock and sales evidence current for this grain.";
}

/**
 * Concise SKU-specific evidence from trusted row fields only.
 * Shared stale/limited wording belongs at section level — not repeated here.
 */
export function buildSkuEvidence(
  row: MerchantInventoryIntelligenceRow,
  context: SkuAttentionContext,
): SkuEvidenceBundle {
  const product = row.productTitle?.trim() || "Untitled product";
  const identityLine = `${row.sku} · ${product} · ${row.storeName} / ${row.locationName}`;

  const facts: SkuEvidenceFact[] = [];
  const missingLabels: string[] = [];

  facts.push({
    id: "place",
    label: "Place",
    value: `${row.storeName} / ${row.locationName}`,
    source: "row.storeName+row.locationName",
  });

  if (row.availableQuantity === null) {
    missingLabels.push("Available quantity");
    facts.push({
      id: "available",
      label: "Available",
      value: "Unknown — not treated as zero",
      source: "row.availableQuantity",
    });
  } else {
    const qtyLabel = context.stockObservationsStale
      ? `Last recorded ${row.availableQuantity} on ${formatObserved(row.observedAt)}`
      : `${row.availableQuantity} on ${formatObserved(row.observedAt)}`;
    facts.push({
      id: "available",
      label: context.stockObservationsStale
        ? "Last recorded available"
        : "Available",
      value: qtyLabel,
      source: "row.availableQuantity+row.observedAt",
    });
  }

  const metricIsHistorical =
    row.coverStatus === "stale" || row.coverStatus === "pending_freshness";

  if (row.coverStatus === "zero_demand") {
    facts.push({
      id: "velocity",
      label: "Velocity (30d)",
      value: "0 / day · no sales observed",
      source: "row.coverStatus=zero_demand",
    });
  } else if (row.salesVelocity30d === null) {
    missingLabels.push("Sales velocity");
    facts.push({
      id: "velocity",
      label: "Velocity (30d)",
      value: metricIsHistorical
        ? "Unknown on historical metric — not treated as zero"
        : "Unknown — not treated as zero",
      source: "row.salesVelocity30d",
    });
  } else {
    facts.push({
      id: "velocity",
      label: metricIsHistorical
        ? "Historical velocity (30d)"
        : "Velocity (30d)",
      value: `${formatVelocity(row.salesVelocity30d)} / day`,
      source: "row.salesVelocity30d",
    });
  }

  if (row.metricDate || row.asOfMetricDate) {
    const parts: string[] = [];
    if (row.metricDate) {
      parts.push(`metric ${row.metricDate}`);
    }
    if (row.asOfMetricDate) {
      parts.push(`store-local as-of ${row.asOfMetricDate}`);
    }
    if (metricIsHistorical) {
      parts.push("not current cover");
    }
    facts.push({
      id: "provenance",
      label: "Metric provenance",
      value: parts.join(" · "),
      source: "row.metricDate+row.asOfMetricDate",
    });
  } else {
    missingLabels.push("Metric provenance");
  }

  if (row.coverStatus === "valid" && row.daysOfStock !== null) {
    facts.push({
      id: "cover",
      label: "Cover",
      value: `${formatDays(row.daysOfStock)} days (calculable)`,
      source: "row.daysOfStock",
    });
  } else {
    facts.push({
      id: "cover",
      label: "Cover",
      value: `Unavailable · ${coverUnavailableReasonLabel(row.coverStatus)}`,
      source: "row.coverStatus",
    });
  }

  if (row.eligibleDays30d !== null) {
    facts.push({
      id: "eligible_days",
      label: "Eligible sales days",
      value: `${row.eligibleDays30d} of 30`,
      source: "row.eligibleDays30d",
    });
  } else if (
    row.coverStatus === "short_history" ||
    row.coverStatus === "valid" ||
    row.coverStatus === "zero_demand"
  ) {
    missingLabels.push("Eligible sales days");
  }

  const ss = knownThreshold(row.safetyStock, row.safetyStockReasonCode);
  const rop = knownThreshold(row.reorderPoint, row.reorderPointReasonCode);
  const target = knownThreshold(row.targetStock, row.targetStockReasonCode);
  if (ss !== null || rop !== null || target !== null) {
    const bits: string[] = [];
    if (ss !== null) {
      bits.push(`SS ${ss}`);
    }
    if (rop !== null) {
      bits.push(`ROP ${rop}`);
    }
    if (target !== null) {
      bits.push(`Target ${target}`);
    }
    const historyNote = metricIsHistorical
      ? " · historical while cover is not current"
      : "";
    const metricStamp = row.metricDate ? ` · metric ${row.metricDate}` : "";
    facts.push({
      id: "thresholds",
      label: metricIsHistorical
        ? "Historical calculated thresholds"
        : "Calculated thresholds",
      value: `${bits.join(" · ")}${metricStamp}${historyNote} (from planning assumptions — not a buy recommendation)`,
      source: "row.safetyStock+row.reorderPoint+row.targetStock",
    });
  } else {
    missingLabels.push("Calculated SS / ROP / target");
  }

  const nextStep = resolveNextStep(row, context);
  const stockCondition = resolveStockCondition(row, context);

  const interpretation = buildPlainLanguageInterpretation({
    row,
    context,
    stockCondition,
    metricIsHistorical,
  });

  const lines = [
    identityLine,
    ...facts
      .filter((fact) => fact.id !== "place")
      .map((fact) => `${fact.label}: ${fact.value}`),
    missingLabels.length > 0
      ? `Missing: ${missingLabels.join("; ")}`
      : null,
    `Reading: ${interpretation}`,
    `Next: ${nextStep}`,
  ].filter((line): line is string => Boolean(line));

  return {
    identityLine,
    facts,
    missingLabels,
    nextStep,
    lines,
    interpretation,
    metricIsHistorical,
  };
}

function buildPlainLanguageInterpretation(input: {
  row: MerchantInventoryIntelligenceRow;
  context: SkuAttentionContext;
  stockCondition: StockConditionKind;
  metricIsHistorical: boolean;
}): string {
  const { row, context, stockCondition, metricIsHistorical } = input;
  const place = `${row.storeName} / ${row.locationName}`;

  if (stockCondition === "last_recorded_out_of_stock") {
    return `${row.sku} at ${place} was last recorded at zero available on ${formatObserved(row.observedAt)}. That is not live out of stock while observations are behind store-local as-of.`;
  }
  if (stockCondition === "out_of_stock") {
    return `${row.sku} at ${place} has known available quantity zero on the latest observation (${formatObserved(row.observedAt)}).`;
  }
  if (stockCondition === "unknown_stock") {
    return `${row.sku} at ${place} has unknown available quantity — StoreAgent does not treat unknown as zero.`;
  }
  if (metricIsHistorical) {
    return `${row.sku} at ${place} still has historical metric fields, but cover is not current while stock or metrics are behind store-local as-of.`;
  }
  if (row.coverStatus === "zero_demand") {
    return `${row.sku} at ${place} has no sales observed in the 30-day velocity window. That is distinct from unknown demand.`;
  }
  if (stockCondition === "review_low_cover" && row.daysOfStock !== null) {
    return `${row.sku} at ${place} has calculable cover of ${formatDays(row.daysOfStock)} days — under the ${LOW_COVER_ATTENTION_DAYS}-day review heuristic, not a canonical ROP.`;
  }
  if (stockCondition === "review_high_cover" && row.daysOfStock !== null) {
    return `${row.sku} at ${place} has calculable cover of ${formatDays(row.daysOfStock)} days — a high-cover review signal only, not an overstock or cash claim.`;
  }
  if (context.stockObservationsStale) {
    return `${row.sku} at ${place} can be reviewed from the last observation, but current cover stays unavailable until same-day stock aligns.`;
  }
  return `${row.sku} at ${place} has trusted stock and metric fields available for review. Commercial recommendations stay unauthorized.`;
}

/**
 * Merchant-facing presentation for one intelligence row.
 * Separates stock health, cover calculability, and commercial eligibility.
 */
export function presentSkuAttention(
  row: MerchantInventoryIntelligenceRow,
  context: SkuAttentionContext,
): SkuAttentionPresentation {
  const stockCondition = resolveStockCondition(row, context);
  const coverAvailability = resolveCoverAvailability(row);
  const limited = isLimitedHistoryEvidence(row);
  const evidence = buildSkuEvidence(row, context);

  let stockConditionLabel: string;
  let stockConditionDetail: string | null = null;
  let stockTone: SkuAttentionPresentation["stockTone"];

  switch (stockCondition) {
    case "out_of_stock":
      stockConditionLabel = "Out of stock";
      stockConditionDetail = `Known available quantity is zero · observed ${formatObserved(row.observedAt)}`;
      stockTone = "critical";
      break;
    case "last_recorded_out_of_stock":
      stockConditionLabel = "Last recorded out of stock";
      stockConditionDetail = `Not live availability · last recorded ${formatObserved(row.observedAt)}`;
      stockTone = "critical";
      break;
    case "unknown_stock":
      stockConditionLabel = "Unknown stock";
      stockConditionDetail = "Available quantity is unknown — not treated as zero.";
      stockTone = "uncertain";
      break;
    case "review_low_cover":
      stockConditionLabel = "Review low cover";
      stockConditionDetail = `Display heuristic: calculable cover under ${LOW_COVER_ATTENTION_DAYS} days — not canonical ROP.`;
      stockTone = "attention";
      break;
    case "review_high_cover":
      stockConditionLabel = "Review high cover";
      stockConditionDetail = `Display heuristic: calculable cover ≥ ${HIGH_COVER_REVIEW_DAYS} days — not overstock or cash claim.`;
      stockTone = "review";
      break;
    case "in_stock":
      stockConditionLabel = "In stock";
      stockConditionDetail =
        row.availableQuantity === null
          ? null
          : `${row.availableQuantity} available · observed ${formatObserved(row.observedAt)}`;
      stockTone = "neutral";
      break;
  }

  let coverAvailabilityLabel: string;
  let coverAvailabilityDetail: string | null = null;

  if (coverAvailability === "calculable" && row.daysOfStock !== null) {
    coverAvailabilityLabel = `Stock cover available · ${formatDays(row.daysOfStock)} days`;
    coverAvailabilityDetail =
      "Cover is calculable from known velocity — not a healthy-stock claim by itself.";
  } else {
    coverAvailabilityLabel = `Cover unavailable · ${coverUnavailableReasonLabel(row.coverStatus)}`;
    coverAvailabilityDetail =
      row.coverStatus === "zero_demand"
        ? "No sales observed in the velocity window. Distinct from unknown demand and short history."
        : null;
  }

  return {
    stockCondition,
    stockConditionLabel,
    stockConditionDetail,
    coverAvailability,
    coverAvailabilityLabel,
    coverAvailabilityDetail,
    decisionEligibility: "unauthorized",
    decisionEligibilityLabel:
      "Commercial recommendations stay unauthorized — not a REORDER / REDUCE / PROMOTE / WATCH queue.",
    stockTone,
    showLimitedHistoryDisclosure: limited,
    evidence,
  };
}

/** Attention sort rank — lower sorts first. Stock condition before cover comfort. */
export function skuAttentionSortRank(
  row: MerchantInventoryIntelligenceRow,
): number {
  if (isKnownOutOfStock(row)) {
    return 10;
  }
  if (isLowCoverAttention(row)) {
    return 20;
  }
  switch (row.coverStatus) {
    case "pending_freshness":
      return 30;
    case "stale":
      return 40;
    case "short_history":
      return 50;
    case "unknown_demand":
      return 60;
    case "unknown_stock":
      return 70;
    case "missing_metric":
      return 80;
    case "valid":
      return isHighCoverReview(row) ? 90 : 100;
    case "zero_demand":
      return 110;
  }
}
