import { calculateValidIncomingPurchaseOrders } from "@/lib/metrics/inventory-math";
import type {
  IncomingPurchaseOrderLineInput,
  MetricReasonCode,
} from "@/lib/metrics/types";
import { storeLocalAsOfDate } from "@/lib/metrics-activation/store-local-as-of";

export type EligibleIncomingEvidence = {
  eligibleIncomingQuantity: number | null;
  eligibleIncomingReasonCode: MetricReasonCode | null;
  incomingStateKnown: boolean;
};

/**
 * Current-day trusted incoming for one org/store/location/variant grain.
 *
 * Completeness contract:
 * - Non-empty destination-scoped lines → frozen incoming-stock-v1 aggregate
 *   (fail closed on any invalid line).
 * - Empty lines + store attestation evidenceComplete=true → known zero.
 * - Empty lines without attestation → unknown (never invent verified zero).
 * - metric_date ≠ store-local as-of → unknown (no historical PO evidence).
 */
export function resolveEligibleIncoming(input: {
  metricDate: string;
  timeZone: string;
  purchaseOrderLines: readonly IncomingPurchaseOrderLineInput[];
  incomingEvidenceComplete: boolean;
  asOfInstant?: Date;
}): EligibleIncomingEvidence {
  const asOf = storeLocalAsOfDate(
    input.timeZone,
    input.asOfInstant ?? new Date(),
  );

  if (input.metricDate !== asOf) {
    return unknownIncoming();
  }

  if (input.purchaseOrderLines.length > 0) {
    const aggregate = calculateValidIncomingPurchaseOrders(
      input.purchaseOrderLines,
    );
    if (
      !aggregate.incomingStateKnown ||
      aggregate.validIncomingQuantity === null
    ) {
      return {
        eligibleIncomingQuantity: null,
        eligibleIncomingReasonCode:
          aggregate.reasonCode ?? "INCOMING_STATE_UNKNOWN",
        incomingStateKnown: false,
      };
    }

    return {
      eligibleIncomingQuantity: aggregate.validIncomingQuantity,
      eligibleIncomingReasonCode: null,
      incomingStateKnown: true,
    };
  }

  if (input.incomingEvidenceComplete) {
    return {
      eligibleIncomingQuantity: 0,
      eligibleIncomingReasonCode: null,
      incomingStateKnown: true,
    };
  }

  return unknownIncoming();
}

export function inventoryPositionFromParts(
  availableQuantity: number | null,
  eligibleIncomingQuantity: number | null,
): number | null {
  if (availableQuantity === null || eligibleIncomingQuantity === null) {
    return null;
  }
  return availableQuantity + eligibleIncomingQuantity;
}

function unknownIncoming(): EligibleIncomingEvidence {
  return {
    eligibleIncomingQuantity: null,
    eligibleIncomingReasonCode: "INCOMING_STATE_UNKNOWN",
    incomingStateKnown: false,
  };
}
