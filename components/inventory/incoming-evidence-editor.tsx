"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, PackageCheck } from "lucide-react";

import { saveStoreIncomingEvidenceAttestationAction } from "@/lib/incoming-evidence/actions";
import type { StoreIncomingEvidenceAttestation } from "@/lib/incoming-evidence/types";
import { cn } from "@/lib/utils";

export function IncomingEvidenceEditor({
  organizationId,
  initial,
  canEdit,
}: {
  organizationId: string;
  initial: readonly StoreIncomingEvidenceAttestation[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [pendingStoreId, setPendingStoreId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
      setNote(
        next
          ? "Marked complete. Empty current-day grains can persist known-zero incoming after metrics refresh — not a purchasing action."
          : "Marked incomplete. Empty PO sets stay incoming unknown until attested again.",
      );
      router.refresh();
    });
  }

  return (
    <div className="rounded-3xl border border-zinc-200 bg-white p-7 shadow-sm sm:p-9">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-zinc-950 text-white">
        <PackageCheck className="size-5" aria-hidden="true" />
      </div>
      <h2 className="mt-8 text-2xl font-semibold tracking-[-0.03em]">
        Incoming evidence completeness
      </h2>
      <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-600">
        Destination-scoped purchase orders feed current-day trusted incoming.
        An empty set is known zero only after you attest that PO evidence for
        the store is complete. Absent or incomplete evidence stays unknown —
        never invented zero. This does not place or approve purchase orders.
      </p>

      <ul className="mt-8 space-y-4">
        {rows.map((row) => {
          const busy = pending && pendingStoreId === row.storeId;
          return (
            <li
              key={row.storeId}
              className="flex flex-col gap-3 border-t border-zinc-100 pt-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-900">
                  {row.storeName}
                </p>
                <p className="mt-1 text-xs leading-5 text-zinc-500">
                  {row.evidenceComplete
                    ? "Attested complete — empty current-day grains may show trusted known-zero incoming."
                    : "Not attested — empty PO sets remain incoming unknown."}
                </p>
              </div>
              <label
                className={cn(
                  "inline-flex min-h-11 items-center gap-3 text-sm font-medium",
                  canEdit ? "text-zinc-900" : "text-zinc-400",
                )}
              >
                <input
                  type="checkbox"
                  checked={row.evidenceComplete}
                  disabled={!canEdit || busy}
                  onChange={(event) =>
                    toggle(row.storeId, event.target.checked)
                  }
                  className="size-4 rounded border-zinc-300"
                />
                {busy ? (
                  <LoaderCircle
                    className="size-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : null}
                Evidence complete
              </label>
            </li>
          );
        })}
      </ul>

      {error ? (
        <p className="mt-6 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      {note ? (
        <p className="mt-6 text-sm text-zinc-600" role="status">
          {note}
        </p>
      ) : null}
      {!canEdit ? (
        <p className="mt-6 text-xs text-zinc-500">
          Only owners and admins can change completeness attestation.
        </p>
      ) : null}
    </div>
  );
}
