import type {
  InventoryActionEvidence,
} from "@/lib/commerce-domain/types";

import type {
  InventoryActionEvidenceInput,
} from "./types";

/**
 * Builds the immutable evidence payload that will be stored
 * with a persisted InventoryAction.
 *
 * No metrics are recalculated here.
 */
export function buildInventoryActionEvidence(
  input: InventoryActionEvidenceInput,
): InventoryActionEvidence {
  const {
    decisionInput,
    reasonCodes,
  } = input;

  return {
    availableQuantity:
      decisionInput.availableQuantity,

    incomingQuantity:
      decisionInput.incomingStateKnown
        ? decisionInput.validIncomingQuantity
        : null,

    demandVelocity:
      decisionInput.demandVelocity,

    daysOfStock:
      decisionInput.daysOfStock,

    leadTimeDays:
      decisionInput.leadTimeDays,

    safetyStockUnits:
      decisionInput.safetyStockUnits,

    reorderPointUnits:
      decisionInput.reorderPointUnits,

    targetStockUnits:
      decisionInput.targetStockUnits,

    inventoryAgeDays:
      decisionInput.inventoryAgeDays,

    forecastExpectedDemandUnits:
      decisionInput.forecastExpectedDemandUnits,

    dataQualityScore:
      decisionInput.dataQualityScore,

    reasonCodes: [...reasonCodes],
  };
}
