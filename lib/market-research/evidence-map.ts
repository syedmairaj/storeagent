/**
 * AI-MKT-1a — map ResearchEvidenceItem → EvidenceRecord-compatible fields.
 *
 * Does not modify L1 EvidenceRecord contracts. signalClass is preserved in
 * label metadata (prefix) rather than overloading claimClass.
 * retrievedAt maps to observedAt/asOf only when observation is known; otherwise
 * freshness stays unknown (retrieval ≠ observation).
 */

import type { EvidenceRecord } from "@/lib/commerce-agent/types";
import { resolveEvidenceTimeClasses } from "@/lib/market-research/scope";
import type { ResearchEvidenceItem } from "@/lib/market-research/types";

export type MapResearchEvidenceInput = {
  item: ResearchEvidenceItem;
  organizationId: string;
  storeId?: string;
  variantId?: string;
  sku?: string;
};

/**
 * Produce an EvidenceRecord-compatible object without mutating L1 types.
 * licenseOk is taken only from server-evaluated provenance (already false when
 * parsed from untrusted input until rights engine sets it).
 */
export function mapResearchEvidenceToEvidenceRecord(
  input: MapResearchEvidenceInput,
): EvidenceRecord {
  const { item, organizationId } = input;
  const time = resolveEvidenceTimeClasses({
    retrievedAt: item.provenance.retrievedAt,
    observationPeriodStart: item.provenance.observationPeriodStart,
    observationPeriodEnd: item.provenance.observationPeriodEnd,
  });

  const citation = item.provenance.sourceUrls[0];
  const label =
    item.signalClass && !item.label.startsWith(`[${item.signalClass}]`)
      ? `[${item.signalClass}] ${item.label}`
      : item.label;

  // Prefer actual observation end/start for asOf when known; else leave asOf
  // as retrieval wall-clock but keep freshnessClass unknown.
  const asOf = time.observationKnown
    ? (item.provenance.observationPeriodEnd ??
      item.provenance.observationPeriodStart ??
      item.provenance.retrievedAt)
    : item.provenance.retrievedAt;

  const observedAt = time.observationKnown
    ? (item.provenance.observationPeriodEnd ??
      item.provenance.observationPeriodStart ??
      null)
    : null;

  return {
    evidenceId: item.evidenceId,
    claimClass: item.claimClass,
    label,
    value: item.value,
    unit: item.unit ?? null,
    sourceSystem: item.provenance.sourceId,
    sourceRef: citation,
    observedAt,
    asOf,
    organizationId,
    storeId: input.storeId,
    variantId: input.variantId,
    sku: input.sku,
    countryCode: item.countryCode,
    currencyCode: item.currencyCode ?? null,
    matchQuality: item.matchQuality,
    freshnessClass: time.observationKnown
      ? time.freshnessClass
      : item.freshnessClass === "unknown"
        ? "unknown"
        : item.freshnessClass === "stale"
          ? "stale"
          : "unknown",
    licenseOk: item.provenance.licenseOk === true,
  };
}
