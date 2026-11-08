"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LoaderCircle, Sparkles } from "lucide-react";

import { activateMerchantSalesMetricsAction } from "@/lib/metrics-activation/actions";

export function ActivateDemandMetricsButton({
  organizationId,
  storeId,
  locationId,
}: {
  organizationId: string;
  storeId: string;
  locationId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto">
      <button
        type="button"
        disabled={pending || !storeId || !locationId}
        onClick={() => {
          setMessage(null);
          setError(null);
          startTransition(async () => {
            const result = await activateMerchantSalesMetricsAction({
              organizationId,
              storeId,
              locationId,
            });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setMessage(result.note);
            router.refresh();
          });
        }}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Sparkles className="size-4" aria-hidden="true" />
        )}
        {pending ? "Activating demand metrics…" : "Activate demand metrics"}
      </button>
      {message ? (
        <p className="max-w-md text-xs leading-5 text-zinc-600">{message}</p>
      ) : null}
      {error ? (
        <p className="max-w-md text-xs leading-5 text-red-700">{error}</p>
      ) : null}
    </div>
  );
}
