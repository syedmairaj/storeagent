"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Package } from "lucide-react";

import { saveStoreIncomingEvidenceAttestationAction } from "@/lib/incoming-evidence/actions";
import {
  incomingAttestationSaveNote,
  presentOrgIncomingEvidence,
  presentStoreIncomingAttestation,
} from "@/lib/incoming-evidence/incoming-evidence-presentation";
import type { StoreIncomingEvidenceAttestation } from "@/lib/incoming-evidence/types";
import type { TrustedIncomingEvidencePresence } from "@/lib/inventory-readiness/types";
import { cn } from "@/lib/utils";

export function IncomingEvidenceEditor({
  organizationId,
  initial,
  canEdit,
  trustedIncoming,
}: {
  organizationId: string;
  initial: readonly StoreIncomingEvidenceAttestation[];
  canEdit: boolean;
  /** Optional readiness presence for org-level state framing. */
  trustedIncoming?: TrustedIncomingEvidencePresence | null;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [prevInitial, setPrevInitial] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pendingStoreId, setPendingStoreId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // After save → router.refresh(), rehydrate from server props so uncheck
  // restores the truthful unknown/incomplete attestation state.
  // Adjust during render (not useEffect) to avoid cascading setState-in-effect.
  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setRows(initial);
  }

  const orgPresentation = useMemo(() => {
    const presence: TrustedIncomingEvidencePresence = trustedIncoming ?? {
      hasPurchaseOrderItemRows: false,
      evidenceCompleteStoreCount: rows.filter((r) => r.evidenceComplete).length,
      knownIncomingGrainCount: 0,
      knownZeroGrainCount: 0,
      positiveIncomingGrainCount: 0,
    };
    // When server presence is omitted, derive a conservative org view from
    // local attestations only — never invent verified zero or recorded qty.
    if (!trustedIncoming) {
      const completeCount = rows.filter((r) => r.evidenceComplete).length;
      if (completeCount > 0) {
        return presentOrgIncomingEvidence({
          ...presence,
          evidenceCompleteStoreCount: completeCount,
        });
      }
      return presentOrgIncomingEvidence(presence);
    }
    return presentOrgIncomingEvidence(trustedIncoming);
  }, [trustedIncoming, rows]);

  function toggle(storeId: string, next: boolean) {
    if (!canEdit || pending) {
      return;
    }
    setError(null);
    setNote(null);
    setPendingStoreId(storeId);

    startTransition(async () => {
      const result = await saveStoreIncomingEvidenceAttestationAction({
        organizationId,
        storeId,
        evidenceComplete: next,
      });
      setPendingStoreId(null);

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setRows((current) =>
        current.map((row) =>
          row.storeId === storeId
            ? {
                ...row,
                evidenceComplete: result.evidenceComplete,
                updatedAt: new Date().toISOString(),
              }
            : row,
        ),
      );
      setNote(incomingAttestationSaveNote(next));
      router.refresh();
    });
  }

  return (
    <section
      id="incoming-evidence"
      aria-labelledby="incoming-evidence-heading"
      data-incoming-evidence="true"
      data-incoming-org-kind={orgPresentation.kind}
      className="scroll-mt-24 rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-zinc-950 text-white">
              <Package className="size-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                {orgPresentation.eyebrow}
              </p>
              <h2
                id="incoming-evidence-heading"
                className="mt-1 text-xl font-semibold tracking-[-0.03em] text-zinc-950 sm:text-2xl"
              >
                {orgPresentation.headline}
              </h2>
            </div>
          </div>
          <p className="mt-3 text-sm leading-6 text-zinc-600">
            {orgPresentation.supporting}
          </p>
          <p
            className="mt-2 text-xs leading-5 text-zinc-500"
            data-incoming-scope-note="true"
          >
            {orgPresentation.scopeNote}
          </p>
        </div>
        {!canEdit ? (
          <p className="shrink-0 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-600">
            View only — owner/admin can confirm
          </p>
        ) : null}
      </div>

      <div
        className={cn(
          "mt-5 rounded-2xl border px-4 py-3",
          orgPresentation.kind === "unknown" &&
            "border-amber-200 bg-amber-50/70",
          orgPresentation.kind === "incomplete" &&
            "border-amber-200 bg-amber-50/70",
          orgPresentation.kind === "verified_zero" &&
            "border-zinc-200 bg-zinc-50",
          orgPresentation.kind === "recorded_incoming" &&
            "border-zinc-200 bg-zinc-50",
        )}
        data-incoming-org-status="true"
        data-incoming-org-kind={orgPresentation.kind}
      >
        <p
          className="text-sm font-semibold text-zinc-950"
          data-incoming-org-status-label="true"
        >
          {orgPresentation.statusLabel}
        </p>
        <p className="mt-1 text-xs leading-5 text-zinc-600">
          {orgPresentation.statusDetail}
        </p>
        <p
          className="mt-2 text-xs leading-5 text-zinc-500"
          data-incoming-org-next="true"
        >
          Next: {orgPresentation.nextStep}
        </p>
        <p className="mt-2 text-xs leading-5 text-zinc-400">
          {orgPresentation.commercialFence}
        </p>
      </div>

      <ul className="mt-6 space-y-0">
        {rows.map((row) => {
          const busy = pending && pendingStoreId === row.storeId;
          const storePresentation = presentStoreIncomingAttestation(row);
          const checkboxId = `incoming-complete-${row.storeId}`;
          return (
            <li
              key={row.storeId}
              className="border-t border-zinc-100 py-4 first:border-t-0 first:pt-0"
              data-incoming-store={row.storeId}
              data-incoming-store-kind={storePresentation.kind}
              data-evidence-complete={row.evidenceComplete ? "true" : "false"}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-900">
                    {row.storeName}
                  </p>
                  <p
                    className="mt-1 text-xs font-semibold text-zinc-800"
                    data-incoming-store-status="true"
                  >
                    {storePresentation.statusLabel}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-zinc-500">
                    {storePresentation.statusDetail}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-zinc-400">
                    Next: {storePresentation.nextStep}
                  </p>
                </div>
                <div className="shrink-0 sm:max-w-xs sm:text-right">
                  <label
                    htmlFor={checkboxId}
                    className={cn(
                      "inline-flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl border px-3 py-2.5 text-left text-sm font-medium outline-none transition",
                      "focus-within:ring-2 focus-within:ring-zinc-950 focus-within:ring-offset-2",
                      canEdit
                        ? "border-zinc-200 bg-white text-zinc-900 hover:border-zinc-300"
                        : "cursor-not-allowed border-zinc-100 bg-zinc-50 text-zinc-400",
                      row.evidenceComplete && canEdit
                        ? "border-zinc-900 bg-zinc-950 text-white hover:border-zinc-800"
                        : null,
                    )}
                  >
                    <input
                      id={checkboxId}
                      type="checkbox"
                      checked={row.evidenceComplete}
                      disabled={!canEdit || busy}
                      onChange={(event) =>
                        toggle(row.storeId, event.target.checked)
                      }
                      className="mt-0.5 size-4 shrink-0 rounded border-zinc-300"
                      aria-describedby={`${checkboxId}-hint`}
                    />
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        {busy ? (
                          <LoaderCircle
                            className="size-4 animate-spin"
                            aria-hidden="true"
                          />
                        ) : null}
                        {storePresentation.toggleLabel}
                      </span>
                      <span
                        id={`${checkboxId}-hint`}
                        className={cn(
                          "mt-1 block text-xs font-normal leading-5",
                          row.evidenceComplete && canEdit
                            ? "text-zinc-300"
                            : "text-zinc-500",
                        )}
                      >
                        {storePresentation.toggleHint}
                      </span>
                    </span>
                  </label>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {error ? (
        <p className="mt-4 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      {note ? (
        <p className="mt-4 text-sm text-zinc-600" role="status">
          {note}
        </p>
      ) : null}
      {!canEdit ? (
        <p className="mt-4 text-xs text-zinc-500">
          Only owners and admins can confirm incoming evidence completeness.
        </p>
      ) : null}
    </section>
  );
}
