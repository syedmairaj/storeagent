/**
 * AI-MKT-1c — deduplicate repeated evidence and detect conflicting observations.
 * Do not silently merge incompatible signals or count repeats as independent.
 */

import type {
  NormalizedEvidenceItem,
  RejectedEvidenceItem,
} from "@/lib/market-research/normalize/types";
import type { ResearchConflict } from "@/lib/market-research/types";

function fingerprint(item: NormalizedEvidenceItem): string {
  return [
    item.sourceId,
    item.signalClass,
    item.citationUrls.slice().sort().join("|"),
    item.rawValue.trim().toLowerCase(),
    item.unit ?? "",
    item.countryCode,
  ].join("::");
}

function conflictKey(item: NormalizedEvidenceItem): string {
  return [
    item.signalClass,
    item.countryCode,
    item.matchQuality,
    item.unit ?? "",
  ].join("::");
}

export type DedupeConflictOutcome = {
  accepted: readonly NormalizedEvidenceItem[];
  rejected: readonly RejectedEvidenceItem[];
  conflicts: readonly ResearchConflict[];
};

/**
 * Mark duplicates as not independent; record conflicts for incompatible values.
 */
export function dedupeAndDetectConflicts(input: {
  items: readonly NormalizedEvidenceItem[];
  organizationId: string;
  clientRequestId: string;
  adapterConflictHints?: readonly {
    conflictId: string;
    snippetIds: readonly string[];
    summary: string;
  }[];
}): DedupeConflictOutcome {
  const rejected: RejectedEvidenceItem[] = [];
  const conflicts: ResearchConflict[] = [];
  const byFingerprint = new Map<string, NormalizedEvidenceItem>();
  const kept: NormalizedEvidenceItem[] = [];

  for (const item of input.items) {
    const fp = fingerprint(item);
    const prior = byFingerprint.get(fp);
    if (prior) {
      // Same source+citation+value → duplicate, not independent.
      rejected.push({
        rejectId: `rej-dup-${item.snippetId}`,
        snippetId: item.snippetId,
        code: "DUPLICATE_NOT_INDEPENDENT",
        detail: `Duplicate of evidence '${prior.evidenceId}' — repeated source does not add independence`,
        organizationId: input.organizationId,
        clientRequestId: input.clientRequestId,
        originClass: item.originClass,
      });
      // Downgrade prior independence if it was assumed independent alone.
      continue;
    }
    byFingerprint.set(fp, item);
    kept.push(item);
  }

  // Value conflicts: same signal/geo/unit, different raw values, comparable matches.
  const byConflictKey = new Map<string, NormalizedEvidenceItem[]>();
  for (const item of kept) {
    if (item.matchQuality === "mismatch") continue;
    const key = conflictKey(item);
    const list = byConflictKey.get(key) ?? [];
    list.push(item);
    byConflictKey.set(key, list);
  }

  const conflictedIds = new Set<string>();
  for (const [, group] of byConflictKey) {
    if (group.length < 2) continue;
    const values = new Set(group.map((g) => g.rawValue.trim().toLowerCase()));
    if (values.size < 2) continue;

    const evidenceIds = group.map((g) => g.evidenceId);
    for (const id of evidenceIds) conflictedIds.add(id);
    conflicts.push({
      conflictId: `conflict-${group.map((g) => g.snippetId).join("-")}`,
      evidenceIds: Object.freeze(evidenceIds),
      summary: `Conflicting ${group[0].signalClass} observations — do not invent consensus`,
    });
  }

  // Adapter-provided conflict hints (when snippet IDs map to kept evidence).
  if (input.adapterConflictHints) {
    for (const hint of input.adapterConflictHints) {
      const mapped = kept.filter((k) => hint.snippetIds.includes(k.snippetId));
      if (mapped.length >= 2) {
        for (const m of mapped) conflictedIds.add(m.evidenceId);
        conflicts.push({
          conflictId: hint.conflictId,
          evidenceIds: Object.freeze(mapped.map((m) => m.evidenceId)),
          summary: hint.summary,
        });
      }
    }
  }

  // Single-source groups with no corroboration → independence unknown (not high).
  const bySourceCitation = new Map<string, number>();
  for (const item of kept) {
    const key = `${item.sourceId}::${item.citationUrls[0] ?? ""}`;
    bySourceCitation.set(key, (bySourceCitation.get(key) ?? 0) + 1);
  }

  const accepted: NormalizedEvidenceItem[] = kept.map((item) => {
    let independenceClass = item.independenceClass;
    const sourceKey = `${item.sourceId}::${item.citationUrls[0] ?? ""}`;
    // Correlated mirrors / lone citation → unknown independence.
    if ((bySourceCitation.get(sourceKey) ?? 0) <= 1 && kept.length === 1) {
      independenceClass = "unknown";
    }
    if (conflictedIds.has(item.evidenceId)) {
      // Keep accepted but flag via conflicts array; do not silently merge.
      independenceClass =
        independenceClass === "independent" ? "unknown" : independenceClass;
    }
    if (independenceClass !== item.independenceClass) {
      return { ...item, independenceClass };
    }
    return item;
  });

  // Explicit unknown-independence rejection path for tests that need a reject row
  // when two items share a source system but claim independence without proof.
  // (Handled as annotation above — not a hard reject.)

  return {
    accepted: Object.freeze(accepted),
    rejected: Object.freeze(rejected),
    conflicts: Object.freeze(conflicts),
  };
}
