/**
 * AI-INV-1 — server-owned evidence builder.
 * Maps trusted M5 intelligence + presentation fields; never invents numbers.
 */

import {
  HIGH_COVER_REVIEW_DAYS,
  LIMITED_HISTORY_ELIGIBLE_DAYS,
  LOW_COVER_ATTENTION_DAYS,
} from "@/lib/inventory-intelligence/attention";
import {
  presentSkuAttention,
  type SkuAttentionContext,
} from "@/lib/inventory-intelligence/sku-attention-presentation";
import type { MerchantInventoryIntelligenceRow } from "@/lib/inventory-intelligence/types";
import { hashInventoryExplainerEvidencePayload } from "@/lib/inventory-explainer/evidence-hash";
import { classifyGuidanceSituation } from "@/lib/inventory-explainer/guidance-situation";
import { resolvePrioritizedGuidanceSteps } from "@/lib/inventory-explainer/next-steps";
import {
  INVENTORY_EXPLAINER_EVIDENCE_VERSION,
  type IncomingTrustClass,
  type InventoryExplainerEvidence,
  type InventoryExplainerFact,
} from "@/lib/inventory-explainer/types";
import type { MerchantPlanningInputs } from "@/lib/planning-inputs/types";

const TITLE_SAFE_MAX = 120;

export type BuildInventoryExplainerEvidenceInput = {
  row: MerchantInventoryIntelligenceRow;
  organizationId: string;
  stockObservationsStale: boolean;
  planning?: MerchantPlanningInputs | null;
  /**
   * Store-level incoming attestation / PO presence for this store.
   * Defaults to unknown when omitted.
   */
  incomingTrust?: IncomingTrustClass;
};

function sanitizeProductTitle(title: string | null): string {
  const raw = (title ?? "").trim() || "Untitled product";
  // Strip control chars; cap length for prompts/telemetry.
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, TITLE_SAFE_MAX);
  return cleaned;
}

function pushLiteral(set: Set<string>, value: string | number | null | undefined) {
  if (value === null || value === undefined) {
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return;
    }
    set.add(String(value));
    if (!Number.isInteger(value)) {
      set.add(value.toFixed(1));
      set.add(value.toFixed(2).replace(/\.?0+$/, ""));
    }
    return;
  }
  const trimmed = value.trim();
  if (trimmed.length > 0) {
    set.add(trimmed);
  }
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

/**
 * Build immutable evidence for a single grain. Caller must already have
 * authenticated org membership and resolved the row from server load.
 */
export function buildInventoryExplainerEvidence(
  input: BuildInventoryExplainerEvidenceInput,
): InventoryExplainerEvidence {
  const {
    row,
    organizationId,
    stockObservationsStale,
    planning = null,
    incomingTrust = "unknown",
  } = input;

  if (row.organizationId !== organizationId) {
    throw new Error("TENANT_SCOPE_MISMATCH");
  }

  const context: SkuAttentionContext = {
    stockObservationsStale,
    planning,
  };
  const presentation = presentSkuAttention(row, context);
  const { evidence } = presentation;

  const facts: InventoryExplainerFact[] = [];

  facts.push({
    id: "identity",
    label: "SKU place",
    value: evidence.identityLine,
    source: "row.sku+store+location",
  });

  facts.push({
    id: "stock_condition",
    label: "Stock condition",
    value: presentation.stockConditionLabel,
    source: "presentSkuAttention.stockCondition",
  });

  const availableFact = evidence.facts.find((f) => f.id === "available");
  if (availableFact) {
    facts.push({
      id: "available",
      label: availableFact.label,
      value: availableFact.value,
      source: availableFact.source,
      asOf: row.observedAt,
    });
  }

  facts.push({
    id: "observed_at",
    label: "Observed at",
    value: row.observedAt,
    source: "row.observedAt",
    asOf: row.observedAt,
  });

  const velocityFact = evidence.facts.find((f) => f.id === "velocity");
  if (velocityFact) {
    facts.push({
      id: "velocity",
      label: velocityFact.label,
      value: velocityFact.value,
      source: velocityFact.source,
      asOf: row.metricDate,
    });
  }

  const eligibleFact = evidence.facts.find((f) => f.id === "eligible_days");
  if (eligibleFact) {
    facts.push({
      id: "eligible_days",
      label: eligibleFact.label,
      value: eligibleFact.value,
      source: eligibleFact.source,
      asOf: row.metricDate,
    });
  }

  const coverFact = evidence.facts.find((f) => f.id === "cover");
  if (coverFact) {
    facts.push({
      id: "cover",
      label: coverFact.label,
      value: coverFact.value,
      source: coverFact.source,
      asOf: row.metricDate,
    });
  }

  facts.push({
    id: "cover_status",
    label: "Cover status",
    value: row.coverStatus,
    source: "row.coverStatus",
  });

  const ss = knownThreshold(row.safetyStock, row.safetyStockReasonCode);
  const rop = knownThreshold(row.reorderPoint, row.reorderPointReasonCode);
  const target = knownThreshold(row.targetStock, row.targetStockReasonCode);

  if (ss !== null) {
    facts.push({
      id: "safety_stock",
      label: "Safety stock (threshold)",
      value: String(ss),
      source: "row.safetyStock",
      asOf: row.metricDate,
    });
  }
  if (rop !== null) {
    facts.push({
      id: "reorder_point",
      label: "Reorder point (threshold)",
      value: String(rop),
      source: "row.reorderPoint",
      asOf: row.metricDate,
    });
  }
  if (target !== null) {
    facts.push({
      id: "target_stock",
      label: "Target stock (threshold)",
      value: String(target),
      source: "row.targetStock",
      asOf: row.metricDate,
    });
  }

  if (evidence.planningAssumptionsLine) {
    facts.push({
      id: "planning_assumptions",
      label: "Saved planning assumptions",
      value: evidence.planningAssumptionsLine,
      source: "organization_planning_inputs",
    });
  }

  const incomingLabel =
    incomingTrust === "attested_complete"
      ? "Store incoming attested complete — not a trusted PO quantity"
      : incomingTrust === "trusted_po_presence"
        ? "Trusted purchase-order presence noted — provider-observed ≠ trusted PO qty"
        : "Incoming unknown — not treated as zero; provider-observed ≠ trusted PO";

  facts.push({
    id: "incoming_trust",
    label: "Incoming trust",
    value: incomingLabel,
    source: "incomingTrust",
  });

  const provenance = evidence.facts.find((f) => f.id === "provenance");
  if (provenance) {
    facts.push({
      id: "metric_provenance",
      label: provenance.label,
      value: provenance.value,
      source: provenance.source,
      asOf: row.metricDate ?? row.asOfMetricDate,
    });
  }

  if (evidence.missingLabels.length > 0) {
    facts.push({
      id: "missing",
      label: "Missing evidence",
      value: evidence.missingLabels.join("; "),
      source: "buildSkuEvidence.missingLabels",
    });
  }

  const guidance = classifyGuidanceSituation({
    row,
    stockObservationsStale,
    incomingTrust,
  });

  const nextSteps = resolvePrioritizedGuidanceSteps({
    situationId: guidance.id,
    incomingTrust,
  });

  facts.push({
    id: "next_step",
    label: "Next safe step",
    value: nextSteps.map((s) => s.label).join(" · ") || evidence.nextStep,
    source: "resolvePrioritizedGuidanceSteps",
  });

  const literals = new Set<string>();
  pushLiteral(literals, row.sku);
  pushLiteral(literals, row.storeName);
  pushLiteral(literals, row.locationName);
  pushLiteral(literals, row.availableQuantity);
  pushLiteral(literals, row.onHandQuantity);
  pushLiteral(literals, row.salesVelocity30d);
  pushLiteral(literals, row.eligibleDays30d);
  pushLiteral(literals, row.coverageRatio30d);
  pushLiteral(literals, row.daysOfStock);
  pushLiteral(literals, ss);
  pushLiteral(literals, rop);
  pushLiteral(literals, target);
  pushLiteral(literals, planning?.leadTimeDays);
  pushLiteral(literals, planning?.safetyStockDays);
  pushLiteral(literals, planning?.reviewPeriodDays);
  pushLiteral(literals, row.metricDate);
  pushLiteral(literals, row.asOfMetricDate);
  pushLiteral(literals, row.observedAt);
  pushLiteral(literals, row.coverStatus);
  pushLiteral(literals, presentation.stockConditionLabel);
  // Window / band constants that appear in trusted presentation copy.
  pushLiteral(literals, "30");
  pushLiteral(literals, "0");
  pushLiteral(literals, LIMITED_HISTORY_ELIGIBLE_DAYS);
  pushLiteral(literals, LOW_COVER_ATTENTION_DAYS);
  pushLiteral(literals, HIGH_COVER_REVIEW_DAYS);
  for (const fact of facts) {
    // Extract digit sequences from fact values for validation.
    const matches = fact.value.match(/-?\d+(?:\.\d+)?/g) ?? [];
    for (const m of matches) {
      pushLiteral(literals, m);
    }
  }

  const payload: Omit<InventoryExplainerEvidence, "evidenceHash"> = {
    schemaVersion: INVENTORY_EXPLAINER_EVIDENCE_VERSION,
    organizationId,
    storeId: row.storeId,
    locationId: row.locationId,
    variantId: row.variantId,
    grainKey: row.grainKey,
    sku: row.sku,
    productTitleSafe: sanitizeProductTitle(row.productTitle),
    storeName: row.storeName,
    locationName: row.locationName,
    stockObservationsStale,
    stockCondition: presentation.stockCondition,
    coverStatus: row.coverStatus,
    coverAvailability: presentation.coverAvailability,
    metricIsHistorical: evidence.metricIsHistorical,
    decisionEligibility: "unauthorized",
    incomingTrust,
    guidanceSituationId: guidance.id,
    guidanceSignificance: guidance.significance,
    untestedHypotheses: guidance.untestedHypotheses,
    rankedQuestionIds: guidance.rankedQuestionIds,
    facts,
    missingLabels: evidence.missingLabels,
    nextSteps,
    allowlistedLiterals: [...literals].sort(),
  };

  return {
    ...payload,
    evidenceHash: hashInventoryExplainerEvidencePayload(payload),
  };
}
