import type {
  ProviderNormalizationResult,
  ProviderReconciliationContext,
  ProviderReconciliationReasonCode,
  ProviderSyncRecordDisposition,
} from "./types";

export function classifyProviderSyncDisposition<TCanonical>(
  result: ProviderNormalizationResult<TCanonical>,
): ProviderSyncRecordDisposition {
  switch (result.disposition) {
    case "accepted":
      return "accepted";

    case "skipped":
      return "skipped";

    case "quarantined":
      return "quarantined";
  }
}

export function buildProviderReconciliationContext(
  result: Extract<
    ProviderNormalizationResult<unknown>,
    { disposition: "quarantined" }
  >,
  reasonCode:
    ProviderReconciliationReasonCode =
      "NORMALIZATION_QUARANTINED",
): ProviderReconciliationContext {
  return {
    provider:
      result.provider,

    resourceType:
      result.resourceType,

    externalId:
      result.externalId,

    externalParentId:
      result.externalParentId,

    adapterVersion:
      result.adapterVersion,

    reasonCode,

    issues:
      [...result.issues],
  };
}

export function reconciliationReasonForBindingConflict():
  ProviderReconciliationReasonCode {
  return "BINDING_CONFLICT";
}

/**
 * A quarantined record is not automatically a durable
 * DataQualityIssue.
 *
 * This helper only answers whether the quarantine carries
 * evidence that may require durable remediation.
 */
export function quarantineMayRequireDurableDataQualityIssue(
  context: ProviderReconciliationContext,
): boolean {
  return (
    context.reasonCode ===
      "BINDING_CONFLICT" ||
    context.reasonCode ===
      "IDENTITY_AMBIGUOUS" ||
    context.reasonCode ===
      "RELATIONSHIP_UNRESOLVED" ||
    context.issues.some(
      (issue) =>
        issue.code ===
          "RELATIONSHIP_UNRESOLVED" ||
        issue.code ===
          "AMBIGUOUS_INVENTORY_SEMANTICS",
    )
  );
}
