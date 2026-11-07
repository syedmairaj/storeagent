import type {
  DecisionCapabilityStatus,
  EvidenceInputStatus,
  EvidencePresence,
  EvidenceSufficiency,
  MerchantDecisionReadiness,
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
  const alignedDemand = presence.grainAlignedKnownDemandCount;

  // Planning / forecast / trusted incoming are never inferred from CSV alone.
  const hasLeadTime = false;
  const hasSafetyDays = false;
  const hasReviewPeriod = false;
  const hasTrustedIncoming = false;
  const hasForecast = false;

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
          : "Connect sales/orders and recompute metrics so demand aligns to SKU, store, and location.",
    }),
    inputStatus(metricsStatus, {
      key: "sku_daily_metrics",
      label: "Derived daily metrics",
      detail:
        metricsStatus === "available"
          ? `${alignedDemand} stock position(s) have matching M5 metrics with known sales velocity.`
          : metricsStatus === "insufficient"
            ? "M5 metric rows exist but none are window-aligned to latest stock grains with known sales_velocity_30d."
            : "No M5 metric rows yet. Velocity, cover, and planning thresholds are not persisted.",
      nextStep:
        metricsStatus === "available"
          ? null
          : "Recompute sku_daily_metrics after trusted sales and inventory evidence exist for the same grains.",
    }),
    inputStatus(hasLeadTime ? "available" : "missing", {
      key: "lead_time",
      label: "Lead time",
      detail: "Lead time is not supplied by CSV inventory import.",
      nextStep:
        "Add trusted supplier lead-time before reorder points can be calculated.",
    }),
    inputStatus(hasSafetyDays ? "available" : "missing", {
      key: "safety_stock_days",
      label: "Safety stock days",
      detail: "Planning safety-stock days are not on CSV inventory rows.",
      nextStep:
        "Configure planning settings before safety stock and ROP can be calculated.",
    }),
    inputStatus(hasReviewPeriod ? "available" : "missing", {
      key: "review_period_days",
      label: "Review period",
      detail: "Review period is not inferred from inventory snapshots.",
      nextStep:
        "Configure review period before target stock can be calculated.",
    }),
    inputStatus(hasTrustedIncoming ? "available" : "missing", {
      key: "trusted_incoming",
      label: "Trusted incoming stock",
      detail:
        "CSV optional incoming columns are observations only. M7 REORDER and REDUCE require trusted incoming state; PROMOTE does not invent or require incoming.",
      nextStep:
        "Connect purchase orders before REORDER/REDUCE can use trusted incoming quantities.",
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
  // Thresholds need cover inputs plus planning parameters (still closed in V1).
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
        ? "Safety stock, reorder point, and target stock can be derived."
        : "Needs grain-aligned demand plus lead time, safety-stock days, and review period. None are invented from CSV.",
    },
    {
      key: "commercial_actions",
      ready: canCommercial,
      label: "REORDER / REDUCE / PROMOTE",
      detail:
        "Commercial evaluation stays disabled. M7 prerequisites are action-specific: REORDER/REDUCE need trusted incoming; PROMOTE needs demand and target stock without inventing incoming. The decision engine is not invoked.",
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
              "Add sales/order history and recompute grain-aligned metrics so demand velocity is known (unknown ≠ zero).",
            ]),
        "Configure lead time, safety-stock days, and review period before reorder/target thresholds unlock.",
        "Connect trusted purchase-order incoming before REORDER or REDUCE can use incoming state (PROMOTE does not require incoming).",
        "Use Actions only as a labeled synthetic demo until commercial evaluation is independently authorized.",
      ];

  const summary = !hasKnownAvailable
    ? hasInventoryRows
      ? "Inventory rows exist but available quantity is unknown. Decisions stay empty — null stock is not zero."
      : "No live inventory evidence yet. Decisions stay empty until stock is imported."
    : canCover
      ? `Live inventory and grain-aligned demand are present (${presence.knownAvailableSkuCount} SKU position(s), ${alignedDemand} with known velocity), but commercial recommendations stay disabled until planning evidence and independent authorization arrive.`
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
