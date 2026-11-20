/**
 * Merchant-first Overview presentation from readiness + attention counts.
 * Pure — no I/O, no M7 actions, no invented financial/confidence figures.
 */

import type { MerchantAttentionSummary } from "@/lib/inventory-intelligence/attention";
import {
  formatObservationDateLabel,
  HIGH_COVER_REVIEW_DAYS,
  inventoryFilterHref,
  LOW_COVER_ATTENTION_DAYS,
} from "@/lib/inventory-intelligence/attention";
import {
  resolveDemandFreshnessGuidance,
  type DemandFreshnessGuidance,
} from "@/lib/inventory-readiness/demand-freshness";
import {
  inventoryEvidenceSourceDetail,
  inventoryEvidenceSourceLabel,
  type InventoryEvidenceSourceKind,
} from "@/lib/inventory-readiness/inventory-source";
import type { MerchantDecisionReadiness } from "@/lib/inventory-readiness/types";
import { classifyMerchantPlanningConfiguration } from "@/lib/planning-inputs/merchant-copy";

export type OverviewPrimaryCta = {
  label: string;
  href: string;
};

export type OverviewSignalEvaluation = "evaluated" | "unavailable";

export type OverviewAttentionSignal = {
  id:
    | "out_of_stock"
    | "low_cover"
    | "high_cover_review"
    | "limited_history"
    | "unknown_demand"
    | "stale_or_pending";
  label: string;
  /** Null when the signal cannot be evaluated (do not show as known zero). */
  count: number | null;
  displayValue: string;
  evaluation: OverviewSignalEvaluation;
  description: string;
  filter:
    | "out_of_stock"
    | "low_cover"
    | "high_cover_review"
    | "limited_history"
    | "unknown_or_missing"
    | "pending_or_stale";
  tone: "critical" | "attention" | "review" | "uncertain";
  hrefEnabled: boolean;
};

export type MerchantOverviewPresentation = {
  scopeLabel: string;
  headline: string;
  supportingSentence: string;
  evidenceHonesty: string;
  dataHealthLabel: string;
  dataHealthDetail: string;
  dataHealthNextAction: string;
  sourceLabel: string;
  sourceDetail: string;
  freshnessLabel: string;
  asOfLabel: string;
  lastObservationLabel: string;
  planningLabel: string;
  commercialFence: string;
  primaryCta: OverviewPrimaryCta;
  secondaryCta: OverviewPrimaryCta | null;
  signals: readonly OverviewAttentionSignal[];
  emptyAttentionMessage: string | null;
  freshness: DemandFreshnessGuidance;
  stockIsStale: boolean;
};

const EMPTY_ATTENTION: MerchantAttentionSummary = {
  positionCount: 0,
  lastObservationDate: null,
  lastRecordedOutOfStockCount: 0,
  calculableCoverCount: 0,
  coverSignalEvaluation: "unavailable",
  lowCoverCount: 0,
  highCoverReviewCount: 0,
  limitedHistoryCount: 0,
  unknownDemandCount: 0,
  staleOrPendingCount: 0,
  knownZeroDemandCount: 0,
  limitedOrUnknownEvidenceCount: 0,
  outOfStockCount: 0,
};

export function buildMerchantOverviewPresentation(input: {
  organizationId: string;
  storeName: string | null;
  readiness: MerchantDecisionReadiness | null;
  attention: MerchantAttentionSummary | null;
  inventorySourceKind?: InventoryEvidenceSourceKind;
  lastObservationLabel?: string | null;
}): MerchantOverviewPresentation {
  const organizationId = input.organizationId;
  const sourceKind = input.inventorySourceKind ?? "csv";
  const sourceLabel = inventoryEvidenceSourceLabel(sourceKind);
  const sourceDetail = inventoryEvidenceSourceDetail(sourceKind);
  const storeName = input.storeName;
  const scopeLabel = storeName
    ? `${storeName} · organization scope`
    : "Organization scope";

  if (!input.readiness || !storeName) {
    return {
      scopeLabel,
      headline: "Waiting for the first store.",
      supportingSentence:
        "An owner or admin needs to create the first store before inventory evidence can appear.",
      evidenceHonesty:
        "StoreAgent does not invent stock, demand, or commercial recommendations.",
      dataHealthLabel: "No store yet",
      dataHealthDetail:
        "Tenant access remains enforced; store setup is still required.",
      dataHealthNextAction: "Finish first-store setup with an owner or admin.",
      sourceLabel,
      sourceDetail,
      freshnessLabel: "Unavailable",
      asOfLabel: "—",
      lastObservationLabel: "—",
      planningLabel: "Not started",
      commercialFence:
        "Recommendations stay off until separately authorized.",
      primaryCta: {
        label: "Ask an owner to finish setup",
        href: `/app/${organizationId}`,
      },
      secondaryCta: null,
      signals: [],
      emptyAttentionMessage:
        "No inventory attention signals until a store and stock import exist.",
      freshness: resolveDemandFreshnessGuidance({
        hasSalesHistory: false,
        knownAvailableSkuCount: 0,
        hasCurrentDayInventoryObservation: false,
        hasCurrentDayMetrics: false,
        hasPendingMetricWork: false,
        grainAlignedKnownDemandCount: 0,
        hasActivationScope: false,
        asOfMetricDate: null,
      }),
      stockIsStale: false,
    };
  }

  const readiness = input.readiness;
  const attention = input.attention ?? EMPTY_ATTENTION;

  const freshness = resolveDemandFreshnessGuidance({
    hasSalesHistory: readiness.presence.hasSalesHistory,
    knownAvailableSkuCount: readiness.presence.knownAvailableSkuCount,
    hasCurrentDayInventoryObservation:
      readiness.presence.hasCurrentDayInventoryObservation,
    hasCurrentDayMetrics: readiness.presence.hasCurrentDayMetrics,
    hasPendingMetricWork: readiness.presence.hasPendingMetricWork,
    grainAlignedKnownDemandCount:
      readiness.presence.grainAlignedKnownDemandCount,
    hasActivationScope: true,
    asOfMetricDate: readiness.presence.primaryAsOfMetricDate,
    inventoryPlaceFreshnessKind:
      readiness.presence.inventoryPlaceFreshnessKind,
    planning: readiness.presence.planning,
  });

  const salesInput = readiness.inputs.find((item) => item.key === "sales_history");
  const planningKind = classifyMerchantPlanningConfiguration(
    readiness.presence.planning,
  );
  const salesAvailable = salesInput?.status === "available";
  const planningComplete = planningKind === "complete";
  const knownSkus = readiness.presence.knownAvailableSkuCount;
  const alignedDemand = readiness.presence.hasPendingMetricWork
    ? 0
    : readiness.presence.grainAlignedKnownDemandCount;

  const stockIsStale =
    freshness.kind === "missing_current_day_stock" ||
    readiness.presence.inventoryPlaceFreshnessKind === "all_stale" ||
    readiness.presence.inventoryPlaceFreshnessKind === "mixed" ||
    attention.staleOrPendingCount > 0;

  const obsDate =
    attention.lastObservationDate ??
    parseObservationDate(input.lastObservationLabel ?? null);
  const obsLabel =
    input.lastObservationLabel?.trim() ||
    formatObservationDateLabel(obsDate);

  const evidenceHonesty = buildEvidenceHonesty({
    salesAvailable,
    planningComplete,
    planningKind,
    knownSkus,
    alignedDemand,
    salesStatus: salesInput?.status ?? "missing",
    stockIsStale,
    hasSalesHistory: readiness.presence.hasSalesHistory,
  });

  const commercialFence =
    "Recommendations stay off until separately authorized — not a production REORDER / REDUCE / PROMOTE / WATCH queue.";

  const signals = buildSignals(attention, {
    stockIsStale,
    observationLabel: obsLabel,
  });

  const hasInventory = knownSkus > 0;
  const asOfLabel =
    readiness.presence.primaryAsOfMetricDate ?? "Store-local as-of unavailable";

  const headline = buildHeadline({
    hasInventory,
    freshness,
    attention,
    stockIsStale,
    observationLabel: obsLabel,
  });

  const supportingSentence = hasInventory
    ? buildSupportingSentence({
        sourceLabel,
        asOfLabel,
        freshnessKind: freshness.kind,
        knownSkus,
        attention,
        stockIsStale,
        observationLabel: obsLabel,
      })
    : "Import inventory before attention signals can advance — StoreAgent will not invent stock or demand.";

  const dataHealth = resolveDataHealth({
    hasInventory,
    freshnessKind: freshness.kind,
    placeFreshness: readiness.presence.inventoryPlaceFreshnessKind,
    pending: readiness.presence.hasPendingMetricWork,
    attention,
    asOfLabel,
    observationLabel: obsLabel,
    ctaLabel: freshness.ctaLabel,
  });

  const planningLabel =
    planningKind === "complete"
      ? "Planning assumptions set"
      : planningKind === "partial"
        ? "Planning partially set"
        : "Planning assumptions unknown";

  const primaryCta = resolvePrimaryCta({
    organizationId,
    hasInventory,
    freshness,
    attention,
    stockIsStale,
  });

  const secondaryCta: OverviewPrimaryCta = {
    label: "Synthetic Actions demo — not live",
    href: `/app/${organizationId}/actions`,
  };

  return {
    scopeLabel,
    headline,
    supportingSentence,
    evidenceHonesty,
    dataHealthLabel: dataHealth.label,
    dataHealthDetail: dataHealth.detail,
    dataHealthNextAction: dataHealth.nextAction,
    sourceLabel,
    sourceDetail,
    freshnessLabel: freshnessBannerLabel(freshness.kind),
    asOfLabel,
    lastObservationLabel: obsLabel,
    planningLabel,
    commercialFence,
    primaryCta,
    secondaryCta,
    signals,
    emptyAttentionMessage: !hasInventory
      ? "Import CSV inventory to surface grounded stock attention counts."
      : null,
    freshness,
    stockIsStale,
  };
}

function parseObservationDate(label: string | null): string | null {
  if (!label || label === "—") {
    return null;
  }
  const ms = Date.parse(label);
  if (Number.isNaN(ms)) {
    return null;
  }
  return new Date(ms).toISOString().slice(0, 10);
}

function buildHeadline(input: {
  hasInventory: boolean;
  freshness: DemandFreshnessGuidance;
  attention: MerchantAttentionSummary;
  stockIsStale: boolean;
  observationLabel: string;
}): string {
  if (!input.hasInventory) {
    return "Import stock to see what needs attention.";
  }
  if (input.freshness.kind === "missing_current_day_stock" || input.stockIsStale) {
    // Short mobile-friendly headline; last-recorded OOS lives in supporting evidence.
    return "Your stock update is due.";
  }
  if (input.freshness.kind !== "ready") {
    return input.freshness.headline.endsWith(".")
      ? input.freshness.headline.slice(0, -1)
      : input.freshness.headline;
  }
  if (input.attention.lastRecordedOutOfStockCount > 0) {
    const n = input.attention.lastRecordedOutOfStockCount;
    return n === 1
      ? "1 position is out of stock."
      : `${n} positions are out of stock.`;
  }
  if (
    input.attention.coverSignalEvaluation === "evaluated" &&
    input.attention.lowCoverCount > 0
  ) {
    const n = input.attention.lowCoverCount;
    return n === 1
      ? "1 position has low cover."
      : `${n} positions have low cover.`;
  }
  if (input.attention.limitedHistoryCount > 0) {
    return "Review limited sales history before trusting cover.";
  }
  if (
    input.attention.coverSignalEvaluation === "evaluated" &&
    input.attention.highCoverReviewCount > 0
  ) {
    const n = input.attention.highCoverReviewCount;
    return n === 1
      ? "1 position has high cover to review."
      : `${n} positions have high cover to review.`;
  }
  return "Stock evidence is ready for review.";
}

function buildEvidenceHonesty(input: {
  salesAvailable: boolean;
  planningComplete: boolean;
  planningKind: "all_blank" | "partial" | "complete";
  knownSkus: number;
  alignedDemand: number;
  salesStatus: "available" | "missing" | "insufficient";
  /** When true, distinguish current-day alignment from historical metrics. */
  stockIsStale: boolean;
  hasSalesHistory: boolean;
}): string {
  if (input.salesAvailable && input.planningComplete) {
    return `Sales and planning inputs are present for ${input.alignedDemand} SKU position(s).`;
  }
  if (input.salesAvailable && input.planningKind === "partial") {
    return `Demand is present for ${input.alignedDemand} position(s); some replenishment assumptions are still unknown.`;
  }
  if (input.salesAvailable) {
    return `Demand is present for ${input.alignedDemand} position(s); planning assumptions are still unknown.`;
  }
  if (input.salesStatus === "insufficient" && input.stockIsStale && input.hasSalesHistory) {
    return "Sales history exists. Current-day demand is not grain-aligned while stock is behind store-local as-of — historical velocity is not current cover. Unknown ≠ zero.";
  }
  if (input.salesStatus === "insufficient") {
    return "Sales rows exist, but demand is not yet grain-aligned to current stock. Unknown ≠ zero.";
  }
  if (input.knownSkus > 0) {
    return "Stock is present, but sales evidence is still missing for cover.";
  }
  return "Sales and planning evidence are not ready yet.";
}

function buildSignals(
  attention: MerchantAttentionSummary,
  context: { stockIsStale: boolean; observationLabel: string },
): OverviewAttentionSignal[] {
  const coverUnavailable = attention.coverSignalEvaluation === "unavailable";
  const oosLabel = context.stockIsStale
    ? "Last recorded out of stock"
    : "Out of stock";
  const oosDescription = context.stockIsStale
    ? `Last recorded available quantity was zero on ${context.observationLabel}. Not live availability.`
    : "Known available quantity is zero on the latest observation. Unknown stock is not counted.";

  const outOfStock: OverviewAttentionSignal = {
    id: "out_of_stock",
    label: oosLabel,
    count: attention.lastRecordedOutOfStockCount,
    displayValue: String(attention.lastRecordedOutOfStockCount),
    evaluation: "evaluated",
    description: oosDescription,
    filter: "out_of_stock",
    tone: "critical",
    hrefEnabled: true,
  };
  const lowCover: OverviewAttentionSignal = {
    id: "low_cover",
    label: "Low cover",
    count: coverUnavailable ? null : attention.lowCoverCount,
    displayValue: coverUnavailable ? "—" : String(attention.lowCoverCount),
    evaluation: coverUnavailable ? "unavailable" : "evaluated",
    description: coverUnavailable
      ? "Unavailable — cover is not calculable while stock or metrics are not current."
      : `Review heuristic: calculable cover under ${LOW_COVER_ATTENTION_DAYS} days (not SS/ROP formulas, not REORDER).`,
    filter: "low_cover",
    tone: "attention",
    hrefEnabled: !coverUnavailable,
  };
  const highCover: OverviewAttentionSignal = {
    id: "high_cover_review",
    label: "High cover review",
    count: coverUnavailable ? null : attention.highCoverReviewCount,
    displayValue: coverUnavailable
      ? "—"
      : String(attention.highCoverReviewCount),
    evaluation: coverUnavailable ? "unavailable" : "evaluated",
    description: coverUnavailable
      ? "Unavailable — cover is not calculable while stock or metrics are not current."
      : `Review heuristic: calculable cover at or above ${HIGH_COVER_REVIEW_DAYS} days (not overstock-risk-v1, not REDUCE).`,
    filter: "high_cover_review",
    tone: "review",
    hrefEnabled: !coverUnavailable,
  };
  const limitedHistory: OverviewAttentionSignal = {
    id: "limited_history",
    label: "Limited sales history",
    count: attention.limitedHistoryCount,
    displayValue: String(attention.limitedHistoryCount),
    evaluation: "evaluated",
    description:
      "Sparse eligible days in the 30-day velocity window — independent of stock freshness; not forecast confidence.",
    filter: "limited_history",
    tone: "uncertain",
    hrefEnabled: true,
  };
  const unknownDemand: OverviewAttentionSignal = {
    id: "unknown_demand",
    label: "Unknown demand",
    count: attention.unknownDemandCount,
    displayValue: String(attention.unknownDemandCount),
    evaluation: "evaluated",
    description:
      "Unknown stock, unknown demand, or missing metrics — distinct from known zero and from limited sales history.",
    filter: "unknown_or_missing",
    tone: "uncertain",
    hrefEnabled: true,
  };
  const staleOrPending: OverviewAttentionSignal = {
    id: "stale_or_pending",
    label: "Stale / pending cover",
    count: attention.staleOrPendingCount,
    displayValue: String(attention.staleOrPendingCount),
    evaluation: "evaluated",
    description:
      "Cover blocked because demand metrics are pending or behind store-local as-of.",
    filter: "pending_or_stale",
    tone: "attention",
    hrefEnabled: true,
  };

  // Stale: actionable observations first; unavailable cover bands stay honest but last.
  if (coverUnavailable || context.stockIsStale) {
    return [
      outOfStock,
      limitedHistory,
      staleOrPending,
      unknownDemand,
      lowCover,
      highCover,
    ];
  }

  return [
    outOfStock,
    lowCover,
    highCover,
    limitedHistory,
    unknownDemand,
    staleOrPending,
  ];
}

function buildSupportingSentence(input: {
  sourceLabel: string;
  asOfLabel: string;
  freshnessKind: DemandFreshnessGuidance["kind"];
  knownSkus: number;
  attention: MerchantAttentionSummary;
  stockIsStale: boolean;
  observationLabel: string;
}): string {
  if (
    input.freshnessKind === "missing_current_day_stock" ||
    input.stockIsStale
  ) {
    const oos = input.attention.lastRecordedOutOfStockCount;
    const oosEvidence =
      oos > 0
        ? oos === 1
          ? `1 position was last recorded out of stock on ${input.observationLabel}. `
          : `${oos} positions were last recorded out of stock on ${input.observationLabel}. `
        : `Last observation ${input.observationLabel}. `;
    return `${oosEvidence}Cover and low/high bands stay unavailable until same-day stock is uploaded (${input.sourceLabel} · as-of ${input.asOfLabel}).`;
  }
  if (input.freshnessKind !== "ready") {
    return `${input.sourceLabel} · as-of ${input.asOfLabel} · ${input.knownSkus} known stock position(s). Finish the next data step before treating cover as current.`;
  }
  if (
    input.attention.positionCount > 0 &&
    input.attention.limitedHistoryCount >= input.attention.positionCount
  ) {
    return `${input.sourceLabel} · as-of ${input.asOfLabel}. Demand metrics are current, but every position still has limited sales history.`;
  }
  if (input.attention.limitedHistoryCount > 0) {
    return `${input.sourceLabel} · as-of ${input.asOfLabel}. ${input.attention.limitedHistoryCount} position(s) still have limited sales history.`;
  }
  return `${input.sourceLabel} · as-of ${input.asOfLabel}. Demand metrics match current stock.`;
}

function resolveDataHealth(input: {
  hasInventory: boolean;
  freshnessKind: DemandFreshnessGuidance["kind"];
  placeFreshness: MerchantDecisionReadiness["presence"]["inventoryPlaceFreshnessKind"];
  pending: boolean;
  attention: MerchantAttentionSummary;
  asOfLabel: string;
  observationLabel: string;
  ctaLabel: string | null;
}): { label: string; detail: string; nextAction: string } {
  if (!input.hasInventory) {
    return {
      label: "Awaiting inventory",
      detail: "No known available SKU positions yet.",
      nextAction: "Import a CSV with SKU and available quantity.",
    };
  }
  if (input.pending || input.freshnessKind === "activate_metrics") {
    return {
      label: "Metrics updating",
      detail: "Stock may be present, but cover stays blocked until current demand metrics finish.",
      nextAction: input.ctaLabel
        ? `${input.ctaLabel}.`
        : "Activate demand metrics for the authorized store and location.",
    };
  }
  if (
    input.freshnessKind === "missing_current_day_stock" ||
    input.placeFreshness === "all_stale" ||
    input.placeFreshness === "mixed"
  ) {
    const usable =
      input.attention.lastRecordedOutOfStockCount > 0
        ? `${input.attention.lastRecordedOutOfStockCount} last-recorded out-of-stock position(s) from ${input.observationLabel} remain visible for review.`
        : `Last stock observation ${input.observationLabel} can still be reviewed.`;
    return {
      label: "Stock observations stale",
      detail: `${usable} Low/high cover are unavailable because observations are not on store-local ${input.asOfLabel}. Limited history and unknown demand stay separate from freshness.`,
      nextAction: "Upload updated stock for each stale store/location, then activate demand metrics.",
    };
  }
  if (input.freshnessKind !== "ready") {
    return {
      label: "Evidence incomplete",
      detail: "Finish the next data step before treating cover as current.",
      nextAction: input.ctaLabel ?? "Continue the next import or metrics step.",
    };
  }
  if (
    input.attention.positionCount > 0 &&
    input.attention.limitedHistoryCount >= input.attention.positionCount
  ) {
    return {
      label: "Limited sales history",
      detail: `All ${input.attention.positionCount} position(s) have sparse eligible days. Metrics can be current while history stays limited — not high-confidence cover.`,
      nextAction: "Review SKU evidence; accumulate more sales days before trusting cover bands.",
    };
  }
  if (input.attention.limitedHistoryCount > 0 || input.attention.unknownDemandCount > 0) {
    return {
      label: "Ready with gaps",
      detail: `${input.attention.limitedHistoryCount} limited-history · ${input.attention.unknownDemandCount} unknown-demand · ${input.attention.calculableCoverCount} calculable cover.`,
      nextAction: "Open Inventory evidence for the gaps that matter first.",
    };
  }
  return {
    label: "Evidence current",
    detail: "Demand metrics match imported stock for the store-local as-of date.",
    nextAction: "Review attention signals or open Inventory evidence.",
  };
}

function resolvePrimaryCta(input: {
  organizationId: string;
  hasInventory: boolean;
  freshness: DemandFreshnessGuidance;
  attention: MerchantAttentionSummary;
  stockIsStale: boolean;
}): OverviewPrimaryCta {
  const { organizationId, freshness } = input;
  if (!input.hasInventory || freshness.ctaHref === "inventory-import") {
    return {
      label: freshness.ctaLabel ?? "Import inventory",
      href: `/app/${organizationId}/inventory/import`,
    };
  }
  if (freshness.ctaHref === "sales-import") {
    return {
      label: freshness.ctaLabel ?? "Import sales history",
      href: `/app/${organizationId}/inventory/sales-import`,
    };
  }
  if (input.stockIsStale || freshness.kind === "missing_current_day_stock") {
    return {
      label: "Upload updated stock",
      href: `/app/${organizationId}/inventory/import`,
    };
  }
  if (input.attention.lastRecordedOutOfStockCount > 0) {
    return {
      label: input.stockIsStale
        ? "Review last-recorded out of stock"
        : "Review out of stock",
      href: inventoryFilterHref(organizationId, "out_of_stock"),
    };
  }
  if (
    input.attention.coverSignalEvaluation === "evaluated" &&
    input.attention.lowCoverCount > 0
  ) {
    return {
      label: "Review low cover",
      href: inventoryFilterHref(organizationId, "low_cover"),
    };
  }
  if (input.attention.limitedHistoryCount > 0) {
    return {
      label: "Review limited sales history",
      href: inventoryFilterHref(organizationId, "limited_history"),
    };
  }
  if (
    input.attention.coverSignalEvaluation === "evaluated" &&
    input.attention.highCoverReviewCount > 0
  ) {
    return {
      label: "Review high-cover positions",
      href: inventoryFilterHref(organizationId, "high_cover_review"),
    };
  }
  return {
    label: freshness.ctaLabel ?? "Open inventory evidence",
    href: inventoryFilterHref(organizationId, "all"),
  };
}

function freshnessBannerLabel(
  kind: DemandFreshnessGuidance["kind"],
): string {
  switch (kind) {
    case "ready":
      return "Current";
    case "activate_metrics":
      return "Metrics pending";
    case "missing_current_day_stock":
      return "Stock stale";
    case "missing_sales":
      return "Sales missing";
    case "missing_inventory":
      return "Inventory missing";
  }
}
