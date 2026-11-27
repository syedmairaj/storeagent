/**
 * AI-MKT-1d — deterministic evidence binding hash for accepted normalized rows.
 */

import { createHash } from "node:crypto";

import type { NormalizedEvidenceItem } from "@/lib/market-research/normalize/types";
import type { ResearchConflict } from "@/lib/market-research/types";

const HASH_PREFIX = "sha256:" as const;

function canonicalizeItem(item: NormalizedEvidenceItem): Record<string, unknown> {
  return {
    evidenceId: item.evidenceId,
    organizationId: item.organizationId,
    clientRequestId: item.clientRequestId,
    snippetId: item.snippetId,
    originClass: item.originClass,
    claimClass: item.claimClass,
    signalClass: item.signalClass,
    label: item.label,
    rawValue: item.rawValue,
    unit: item.unit,
    countryCode: item.countryCode,
    currencyCode: item.currencyCode,
    matchQuality: item.matchQuality,
    geoMatchQuality: item.geoMatchQuality,
    freshnessClass: item.freshnessClass,
    confidenceClass: item.confidenceClass,
    retrievedAt: item.retrievedAt,
    observationPeriodStart: item.observationPeriodStart,
    observationPeriodEnd: item.observationPeriodEnd,
    observationKnown: item.observationKnown,
    sourceId: item.sourceId,
    adapterId: item.adapterId,
    sourcePolicyVersion: item.sourcePolicyVersion,
    licenseOk: item.licenseOk,
    citationUrls: [...item.citationUrls],
    independenceClass: item.independenceClass,
    syntheticOriginPreserved: item.syntheticOriginPreserved,
    isRealMerchantOrMarketFact: item.isRealMerchantOrMarketFact,
  };
}

/**
 * Stable hash over accepted evidence (+ conflicts). Used to bind drafts.
 */
export function hashAcceptedResearchEvidence(input: {
  organizationId: string;
  clientRequestId: string;
  sourceId: string;
  adapterId: string;
  sourcePolicyVersion: string;
  accepted: readonly NormalizedEvidenceItem[];
  conflicts?: readonly ResearchConflict[];
}): string {
  const canonical = {
    schema: "market-research-evidence-hash-v1",
    organizationId: input.organizationId,
    clientRequestId: input.clientRequestId,
    sourceId: input.sourceId,
    adapterId: input.adapterId,
    sourcePolicyVersion: input.sourcePolicyVersion,
    accepted: [...input.accepted]
      .map(canonicalizeItem)
      .sort((a, b) => String(a.evidenceId).localeCompare(String(b.evidenceId))),
    conflicts: [...(input.conflicts ?? [])]
      .map((c) => ({
        conflictId: c.conflictId,
        evidenceIds: [...c.evidenceIds].sort(),
        summary: c.summary,
      }))
      .sort((a, b) => a.conflictId.localeCompare(b.conflictId)),
  };

  const digest = createHash("sha256")
    .update(JSON.stringify(canonical), "utf8")
    .digest("hex");

  return `${HASH_PREFIX}${digest}`;
}

export function hashTargetProductFingerprint(target: unknown): string {
  const digest = createHash("sha256")
    .update(JSON.stringify(target ?? null), "utf8")
    .digest("hex");
  return `${HASH_PREFIX}${digest.slice(0, 32)}`;
}

export function isSha256EvidenceHash(value: string): boolean {
  return /^sha256:[a-f0-9]{64}$/.test(value);
}
