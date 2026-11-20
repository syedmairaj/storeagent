/**
 * AI-INV-1 — evidence hash for cache / golden binding only (not auth).
 */

import { createHash } from "node:crypto";

import {
  EVIDENCE_HASH_PREFIX,
  INVENTORY_EXPLAINER_EVIDENCE_VERSION,
  type InventoryExplainerEvidence,
  type InventoryExplainerFact,
} from "@/lib/inventory-explainer/types";

function canonicalizeFact(fact: InventoryExplainerFact): Record<string, unknown> {
  return {
    id: fact.id,
    label: fact.label,
    value: fact.value,
    source: fact.source,
    asOf: fact.asOf ?? null,
  };
}

/**
 * Stable hash over evidence payload excluding the hash field itself.
 */
export function hashInventoryExplainerEvidencePayload(
  payload: Omit<InventoryExplainerEvidence, "evidenceHash">,
): string {
  const canonical = {
    schemaVersion: INVENTORY_EXPLAINER_EVIDENCE_VERSION,
    organizationId: payload.organizationId,
    storeId: payload.storeId,
    locationId: payload.locationId,
    variantId: payload.variantId,
    grainKey: payload.grainKey,
    sku: payload.sku,
    productTitleSafe: payload.productTitleSafe,
    storeName: payload.storeName,
    locationName: payload.locationName,
    stockObservationsStale: payload.stockObservationsStale,
    stockCondition: payload.stockCondition,
    coverStatus: payload.coverStatus,
    coverAvailability: payload.coverAvailability,
    metricIsHistorical: payload.metricIsHistorical,
    decisionEligibility: payload.decisionEligibility,
    incomingTrust: payload.incomingTrust,
    guidanceSituationId: payload.guidanceSituationId,
    guidanceSignificance: payload.guidanceSignificance,
    untestedHypotheses: [...payload.untestedHypotheses],
    rankedQuestionIds: [...payload.rankedQuestionIds],
    facts: payload.facts.map(canonicalizeFact),
    missingLabels: [...payload.missingLabels],
    nextSteps: payload.nextSteps.map((step) => ({
      code: step.code,
      label: step.label,
    })),
    allowlistedLiterals: [...payload.allowlistedLiterals],
  };

  const digest = createHash("sha256")
    .update(JSON.stringify(canonical), "utf8")
    .digest("hex");

  return `${EVIDENCE_HASH_PREFIX}${digest}`;
}
