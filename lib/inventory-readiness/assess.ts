import type {
  DecisionCapabilityStatus,
  EvidenceInputStatus,
  EvidencePresence,
  EvidenceSufficiency,
  MerchantDecisionReadiness,
  TrustedIncomingEvidencePresence,
} from "@/lib/inventory-readiness/types";

function inputStatus(
  status: EvidenceSufficiency,
  fields: Omit<EvidenceInputStatus, "present" | "status">,
): EvidenceInputStatus {
  return {
    ...fields,
    status,
    present: status === "available",
  };
}

/**
 * Pure readiness assessment from tenant-scoped evidence presence.
 *
 * Does not call decideInventoryAction, invent velocity, or emit
 * REORDER / REDUCE / PROMOTE / WATCH recommendations.
 *
 * Cover requires grain-aligned known demand velocity — never org-wide
 * order_items or sku_daily_metrics head counts alone.
 *
 * Trusted incoming is required for REORDER and REDUCE in M7, not PROMOTE.
 * Commercial evaluation stays disabled for this milestone.
 */
export function assessMerchantDecisionReadiness(input: {
  organizationId: string;
  presence: EvidencePresence;
}): MerchantDecisionReadiness {
  const { presence, organizationId } = input;

  const hasInventoryRows = presence.inventorySnapshotCount > 0;
  const hasKnownAvailable = presence.knownAvailableSkuCount > 0;
  const hasSalesRows = presence.hasSalesHistory;
  const hasMetricRows = presence.hasSkuDailyMetrics;
  const metricsPending = presence.hasPendingMetricWork;
  const alignedDemand = metricsPending
    ? 0
    : presence.grainAlignedKnownDemandCount;

  // Planning days come only from durable merchant inputs (null ≠ 0).
  // Forecast is never inferred. Trusted incoming comes only from current-day
  // PO evidence (+ completeness attestation for known zero) — never CSV
  // snapshot incomingQuantity.
  const planning = presence.planning;
  const hasLeadTime = planning.leadTimeDays !== null;
  const hasSafetyDays = planning.safetyStockDays !== null;
  const hasReviewPeriod = planning.reviewPeriodDays !== null;
  const incoming = presence.trustedIncoming;
  const hasTrustedIncoming = incoming.knownIncomingGrainCount > 0;
  const hasForecast = false;
  const trustedIncomingStatus: EvidenceSufficiency = hasTrustedIncoming
    ? "available"
    : incoming.hasPurchaseOrderItemRows ||
        incoming.evidenceCompleteStoreCount > 0
      ? "insufficient"
      : "missing";

  const inventoryStatus: EvidenceSufficiency = !hasInventoryRows
    ? "missing"
    : hasKnownAvailable
      ? "available"
      : "insufficient";

  const salesStatus: EvidenceSufficiency = !hasSalesRows
    ? "missing"
    : alignedDemand > 0
      ? "available"
      : "insufficient";

  const metricsStatus: EvidenceSufficiency = !hasMetricRows
    ? "missing"
    : metricsPending
      ? "insufficient"
      : alignedDemand > 0
        ? "available"
        : "insufficient";

  const inputs: EvidenceInputStatus[] = [
    inputStatus(inventoryStatus, {
      key: "inventory_snapshots",
      label: "Inventory observations",
      detail:
        inventoryStatus === "available"
          ? `${presence.knownAvailableSkuCount} SKU position(s) with known available quantity across ${presence.distinctStoreCount} store(s).`
          : inventoryStatus === "insufficient"
            ? "Inventory rows exist but available quantity is unknown on every latest position — null is not treated as zero."
            : "No durable inventory snapshots for this organization yet.",
      nextStep:
        inventoryStatus === "available"
          ? null
          : inventoryStatus === "insufficient"
            ? "Re-import CSV rows with a known available quantity for each SKU."
            : "Import a CSV with SKU and available quantity.",
    }),
    inputStatus(salesStatus, {
      key: "sales_history",
      label: "Sales history",
      detail:
        salesStatus === "available"
          ? "Order history supports grain-aligned demand velocity for cover."
          : salesStatus === "insufficient"
            ? "Order rows exist, but demand is not grain-aligned to stock positions with known velocity — unknown ≠ zero."
            : "No sales evidence. Demand velocity stays unknown — not zero.",
      nextStep:
        salesStatus === "available"
          ? null
          : "Import sales history CSV (or connect orders), then activate demand metrics so demand aligns to SKU, store, and location.",
    }),
    inputStatus(metricsStatus, {
      key: "sku_daily_metrics",
      label: "Derived daily metrics",
      detail:
        metricsStatus === "available"
          ? `${alignedDemand} stock position(s) have matching current demand metrics with known sales velocity.`
          : metricsStatus === "insufficient"
            ? metricsPending
              ? "Demand metrics are still updating from recent sales or stock changes. Cover stays blocked until current demand finishes."
              : "Demand metric rows exist but none are current and matched to latest stock with known sales velocity. Stale or unmatched metrics do not unlock cover."
            : "No demand metric rows yet. Velocity, cover, and planning thresholds are not persisted.",
      nextStep:
        metricsStatus === "available"
          ? null
          : metricsPending
            ? "Activate demand metrics again if the update is still pending."
            : "Activate demand metrics after trusted sales and inventory exist for the same SKU, store, and location.",
    }),
    inputStatus(hasLeadTime ? "available" : "missing", {
      key: "lead_time",
      label: "Lead time",
      detail: hasLeadTime
        ? planning.leadTimeDays === 0
          ? "Merchant organization assumption: lead time is explicitly 0 days (known zero). Not a verified supplier or SKU fact."
          : `Merchant organization assumption: lead time is ${planning.leadTimeDays} day(s). Not a verified supplier or SKU fact.`
        : "Lead time is unknown. CSV inventory import does not supply it, and no merchant assumption is configured.",
      nextStep: hasLeadTime
        ? null
        : "Configure a merchant lead-time assumption before reorder points can be calculated.",
    }),
    inputStatus(hasSafetyDays ? "available" : "missing", {
      key: "safety_stock_days",
      label: "Safety stock days",
      detail: hasSafetyDays
        ? planning.safetyStockDays === 0
          ? "Merchant organization assumption: safety-stock days is explicitly 0 (known zero)."
          : `Merchant organization assumption: safety-stock days is ${planning.safetyStockDays}.`
        : "Safety-stock days are unknown. They are not on CSV inventory rows, and no merchant assumption is configured.",
      nextStep: hasSafetyDays
        ? null
        : "Configure a merchant safety-stock-days assumption before safety stock and ROP can be calculated.",
    }),
    inputStatus(hasReviewPeriod ? "available" : "missing", {
      key: "review_period_days",
      label: "Review period",
      detail: hasReviewPeriod
        ? planning.reviewPeriodDays === 0
          ? "Merchant organization assumption: review period is explicitly 0 days (known zero)."
          : `Merchant organization assumption: review period is ${planning.reviewPeriodDays} day(s).`
        : "Review period is unknown. It is not inferred from inventory snapshots, and no merchant assumption is configured.",
      nextStep: hasReviewPeriod
        ? null
        : "Configure a merchant review-period assumption before target stock can be calculated.",
    }),
    inputStatus(trustedIncomingStatus, {
      key: "trusted_incoming",
      label: "Trusted incoming stock",
      detail:
        trustedIncomingStatus === "available"
          ? describeTrustedIncoming(incoming)
          : trustedIncomingStatus === "insufficient"
            ? "Purchase-order rows or completeness attestation exist, but current-day metrics do not yet show known incoming (unknown stays unknown; empty sets are not verified zero without attestation). CSV snapshot incoming is not trusted."
            : "No trusted purchase-order incoming yet. CSV optional incoming columns are observations only — not M5 eligible incoming. Empty or absent PO records are not verified zero.",
      nextStep:
        trustedIncomingStatus === "available"
          ? null
          : "Import destination-scoped purchase orders, then attest store PO evidence complete only when the empty set should count as known zero. Historical metric dates stay unknown without as-of history.",
    }),
    inputStatus(hasForecast ? "available" : "missing", {
      key: "forecast",
      label: "Published forecast",
      detail:
        "Production forecast eligibility remains closed; no forecast is invented.",
      nextStep:
        "Forecast-backed decisions stay unavailable until M6 production eligibility is approved.",
    }),
  ];

  const canStock = hasKnownAvailable;
  // Cover needs known stock AND grain-aligned known demand — never org head counts.
  const canCover = hasKnownAvailable && alignedDemand > 0;
  // Thresholds need cover inputs plus all three planning days.
  // Presence unlocks capability evidence only — M5 formulas are not recomputed here
  // and commercial evaluation stays independently gated.
  const canReorderThresholds =
    canCover && hasLeadTime && hasSafetyDays && hasReviewPeriod;
  // Milestone gate: commercial engine is not invoked / not independently authorized.
  // Action-specific M7 rules are preserved in copy; do not blanket-unlock on incoming.
  const canCommercial = false;

  const capabilities: DecisionCapabilityStatus[] = [
    {
      key: "stock_positions",
      ready: canStock,
      label: "Stock positions",
      detail: canStock
        ? "Latest available quantities from inventory snapshots are visible."
        : "Import inventory before stock positions can be shown.",
    },
    {
      key: "cover_days",
      ready: canCover,
      label: "Days of stock (cover)",
      detail: canCover
        ? "Cover can use available stock with grain-aligned known demand velocity."
        : "Needs known available quantity plus SKU/store/location-aligned metrics with known velocity — org-wide sales or metric row counts are not enough.",
    },
    {
      key: "reorder_thresholds",
      ready: canReorderThresholds,
      label: "Reorder / target thresholds",
      detail: canReorderThresholds
        ? "Merchant planning assumptions and grain-aligned demand are present for future threshold math. This is not an executable M7 commercial action."
        : "Needs grain-aligned demand plus merchant planning assumptions for lead time, safety-stock days, and review period. None are invented from CSV.",
    },
    {
      key: "commercial_actions",
      ready: canCommercial,
      label: "REORDER / REDUCE / PROMOTE",
      detail:
        "Commercial evaluation stays disabled. Configured planning assumptions are not executable M7 actions. REORDER/REDUCE need trusted incoming; PROMOTE needs demand and target stock without inventing incoming. The decision engine is not invoked.",
    },
  ];

  const nextSteps = !hasKnownAvailable
    ? [
        hasInventoryRows
          ? "Re-import CSV rows with a known available quantity for each SKU."
          : "Import a CSV with SKU and available quantity to create durable inventory snapshots.",
      ]
    : [
        ...(alignedDemand > 0
          ? []
          : [
              "Import sales history CSV, then activate demand metrics so store-local current grain-aligned velocity is known (unknown ≠ zero; stale metrics do not count).",
            ]),
        ...(hasLeadTime && hasSafetyDays && hasReviewPeriod
          ? []
          : [
              "Configure lead time, safety-stock days, and review period before reorder/target thresholds unlock.",
            ]),
        ...(hasTrustedIncoming
          ? []
          : [
              "Import destination-scoped purchase orders (and attest completeness for known-zero empty sets) before REORDER or REDUCE can use incoming state. PROMOTE does not require incoming.",
            ]),
        "Use Actions only as a labeled synthetic demo until commercial evaluation is independently authorized.",
      ];

  const summary = !hasKnownAvailable
    ? hasInventoryRows
      ? "Inventory rows exist but available quantity is unknown. Decisions stay empty — null stock is not zero."
      : "No live inventory evidence yet. Decisions stay empty until stock is imported."
    : canCover
      ? canReorderThresholds
        ? `Live inventory, grain-aligned demand, and planning days are present (${presence.knownAvailableSkuCount} SKU position(s), ${alignedDemand} with known velocity). Commercial recommendations stay disabled until independent authorization arrives.`
        : `Live inventory and grain-aligned demand are present (${presence.knownAvailableSkuCount} SKU position(s), ${alignedDemand} with known velocity), but commercial recommendations stay disabled until planning evidence and independent authorization arrive.`
      : `Live inventory is present (${presence.knownAvailableSkuCount} SKU position(s)), but commercial recommendations stay blocked until grain-aligned demand and planning evidence arrive.`;

  return {
    organizationId,
    presence,
    inputs,
    capabilities,
    commercialActionsEligible: canCommercial,
    summary,
    nextSteps,
  };
}

function describeTrustedIncoming(
  incoming: TrustedIncomingEvidencePresence,
): string {
  const parts: string[] = [];
  if (incoming.positiveIncomingGrainCount > 0) {
    parts.push(
      `${incoming.positiveIncomingGrainCount} current grain(s) with positive trusted incoming`,
    );
  }
  if (incoming.knownZeroGrainCount > 0) {
    parts.push(
      `${incoming.knownZeroGrainCount} with trusted known-zero incoming`,
    );
  }
  const body =
    parts.length > 0
      ? parts.join("; ")
      : `${incoming.knownIncomingGrainCount} current grain(s) with known trusted incoming`;
  return `${body}. CSV snapshot incoming is not used. This does not authorize REORDER/REDUCE/PROMOTE commercial actions.`;
}
