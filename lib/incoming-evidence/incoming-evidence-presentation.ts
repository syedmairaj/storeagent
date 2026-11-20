/**
 * UX-INV-1c / 1c.1 — merchant presentation for incoming-stock evidence states.
 * Presentation only: unknown ≠ verified zero; never invents trusted incoming.
 *
 * Scope clarity:
 * - Completeness checkbox is **store-level** attestation.
 * - Trusted PO incoming quantities are **destination-location** scoped.
 * - Store confirmation never invents destination facts or PO lines.
 */

import type { StoreIncomingEvidenceAttestation } from "@/lib/incoming-evidence/types";
import type { TrustedIncomingEvidencePresence } from "@/lib/inventory-readiness/types";

/** Org-level merchant state derived from trusted readiness presence only. */
export type IncomingOrgEvidenceKind =
  | "unknown"
  | "incomplete"
  | "verified_zero"
  | "recorded_incoming";

export type IncomingOrgEvidencePresentation = {
  kind: IncomingOrgEvidenceKind;
  eyebrow: string;
  headline: string;
  supporting: string;
  statusLabel: string;
  statusDetail: string;
  nextStep: string;
  commercialFence: string;
  /** Explicit store vs destination scope line. */
  scopeNote: string;
};

export type IncomingStoreEvidenceKind =
  | "unknown"
  | "confirmed_complete";

export type IncomingStoreEvidencePresentation = {
  kind: IncomingStoreEvidenceKind;
  statusLabel: string;
  statusDetail: string;
  toggleLabel: string;
  toggleHint: string;
  nextStep: string;
};

const COMMERCIAL_FENCE =
  "This never places or approves purchase orders. Commercial recommendations stay unauthorized.";

const SCOPE_NOTE =
  "The checkbox is a store-level confirmation. Trusted incoming quantities still come only from destination-scoped purchase-order lines — never from this checkbox alone.";

/**
 * Map trusted readiness presence → merchant-facing org incoming state.
 * Empty/unverified PO sets never become verified zero here.
 */
export function presentOrgIncomingEvidence(
  presence: TrustedIncomingEvidencePresence,
): IncomingOrgEvidencePresentation {
  const eyebrow = "Incoming stock evidence";
  const headline = "Incoming stock";

  if (presence.positiveIncomingGrainCount > 0) {
    return {
      kind: "recorded_incoming",
      eyebrow,
      headline,
      supporting:
        "Trusted current-day incoming comes from destination-scoped purchase orders. CSV snapshot incoming is not used here.",
      statusLabel: "Incoming recorded",
      statusDetail: `${presence.positiveIncomingGrainCount} current grain(s) show positive trusted incoming${
        presence.knownZeroGrainCount > 0
          ? `; ${presence.knownZeroGrainCount} show confirmed zero incoming`
          : ""
      }.`,
      nextStep:
        "Review SKUs with recorded incoming against available stock — purchasing stays off.",
      commercialFence: COMMERCIAL_FENCE,
      scopeNote: SCOPE_NOTE,
    };
  }

  if (presence.knownZeroGrainCount > 0) {
    return {
      kind: "verified_zero",
      eyebrow,
      headline,
      supporting:
        "A store-level completeness confirmation lets an empty current-day destination PO set count as no incoming expected. That verified zero is distinct from “no PO evidence” and from pending metrics.",
      statusLabel: "No incoming expected (confirmed)",
      statusDetail: `${presence.knownZeroGrainCount} current grain(s) show trusted known-zero incoming after store completeness confirmation and metrics refresh.`,
      nextStep:
        "Keep destination PO evidence current. Clear store confirmation if open POs should return incoming to not confirmed.",
      commercialFence: COMMERCIAL_FENCE,
      scopeNote: SCOPE_NOTE,
    };
  }

  if (
    presence.hasPurchaseOrderItemRows ||
    presence.evidenceCompleteStoreCount > 0
  ) {
    const pendingMetrics =
      presence.evidenceCompleteStoreCount > 0 &&
      presence.knownIncomingGrainCount === 0;

    return {
      kind: "incomplete",
      eyebrow,
      headline,
      supporting: pendingMetrics
        ? "Store completeness is marked, but current-day metrics do not yet show known incoming. Pending metrics are not verified zero."
        : "Destination-scoped PO rows exist, but store completeness is not confirmed — empty sets stay not confirmed, not zero.",
      statusLabel: pendingMetrics
        ? "Waiting on metrics refresh"
        : "Incoming evidence incomplete",
      statusDetail:
        presence.hasPurchaseOrderItemRows &&
        presence.evidenceCompleteStoreCount === 0
          ? "PO rows are present at destination locations, but this store’s completeness is not confirmed."
          : "Store completeness is confirmed, but known incoming has not appeared on current-day metrics yet — not the same as verified zero.",
      nextStep: pendingMetrics
        ? "Wait for metrics refresh. Do not treat pending metrics as zero incoming."
        : "Confirm completeness only when this store’s destination-scoped PO set is truly complete.",
      commercialFence: COMMERCIAL_FENCE,
      scopeNote: SCOPE_NOTE,
    };
  }

  return {
    kind: "unknown",
    eyebrow,
    headline,
    supporting:
      "Incoming is not confirmed. No store completeness and no trusted destination PO incoming yet — that is distinct from verified zero.",
    statusLabel: "Incoming not confirmed",
    statusDetail:
      "No trusted purchase-order incoming yet. An empty or missing destination PO set stays not confirmed — never invented as zero.",
    nextStep:
      "Import destination-scoped purchase orders, or confirm store completeness only when an empty set should count as no incoming expected.",
    commercialFence: COMMERCIAL_FENCE,
    scopeNote: SCOPE_NOTE,
  };
}

export function presentStoreIncomingAttestation(
  row: StoreIncomingEvidenceAttestation,
): IncomingStoreEvidencePresentation {
  if (row.evidenceComplete) {
    return {
      kind: "confirmed_complete",
      statusLabel: "Store completeness confirmed",
      statusDetail:
        "You confirmed this store’s destination-scoped PO evidence is complete. Empty current-day destination sets may show no incoming expected only after metrics refresh — not a purchasing action.",
      toggleLabel: "Store PO evidence complete",
      toggleHint:
        "Uncheck to clear this store confirmation. Incoming returns to not confirmed for empty destination sets until confirmed again.",
      nextStep:
        "After metrics refresh, check whether known-zero incoming appears for empty destination grains.",
    };
  }

  return {
    kind: "unknown",
    statusLabel: "Store completeness not confirmed",
    statusDetail:
      "Empty destination-scoped PO sets for this store stay incoming not confirmed. Missing evidence is never treated as zero.",
    toggleLabel: "Confirm store PO evidence is complete",
    toggleHint:
      "Attests that destination-scoped purchase orders for this store are complete (including a deliberate empty set). Does not create PO lines or change destination quantities by itself.",
    nextStep:
      "Import destination-scoped POs, or confirm only when the empty set should count as no incoming expected.",
  };
}

export function incomingAttestationSaveNote(evidenceComplete: boolean): string {
  return evidenceComplete
    ? "Store completeness confirmed. Empty destination sets can show no incoming expected only after metrics refresh — not confirmed alone is never zero."
    : "Store completeness cleared. Empty destination PO sets stay incoming not confirmed until confirmed again.";
}
