"use client";

import { type FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Save } from "lucide-react";

import { saveMerchantPlanningInputsAction } from "@/lib/planning-inputs/actions";
import { formatPlanningDayForInput } from "@/lib/planning-inputs/parse";
import type { MerchantPlanningInputs } from "@/lib/planning-inputs/types";
import { cn } from "@/lib/utils";

function DayField({
  id,
  label,
  hint,
  value,
  disabled,
  onChange,
  onClear,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  disabled: boolean;
  onChange: (next: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={id}
          className="text-sm font-medium text-zinc-900"
        >
          {label}
        </label>
        <button
          type="button"
          onClick={onClear}
          disabled={disabled || value === ""}
          className="text-xs font-medium text-zinc-500 underline-offset-2 hover:text-zinc-800 hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline"
        >
          Clear to unknown
        </button>
      </div>
      <input
        id={id}
        name={id}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        placeholder="Unknown"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "mt-2 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-950 outline-none transition",
          "placeholder:text-zinc-400",
          "focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200",
          "disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-500",
        )}
      />
      <p className="mt-1.5 text-xs leading-5 text-zinc-500">{hint}</p>
    </div>
  );
}

export function PlanningInputsEditor({
  organizationId,
  initial,
  canEdit,
}: {
  organizationId: string;
  initial: MerchantPlanningInputs;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [leadTimeDays, setLeadTimeDays] = useState(
    formatPlanningDayForInput(initial.leadTimeDays),
  );
  const [safetyStockDays, setSafetyStockDays] = useState(
    formatPlanningDayForInput(initial.safetyStockDays),
  );
  const [reviewPeriodDays, setReviewPeriodDays] = useState(
    formatPlanningDayForInput(initial.reviewPeriodDays),
  );
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit) {
      return;
    }
    setError(null);
    setSavedNote(null);

    startTransition(async () => {
      const result = await saveMerchantPlanningInputsAction({
        organizationId,
        leadTimeDays,
        safetyStockDays,
        reviewPeriodDays,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      setLeadTimeDays(formatPlanningDayForInput(result.value.leadTimeDays));
      setSafetyStockDays(
        formatPlanningDayForInput(result.value.safetyStockDays),
      );
      setReviewPeriodDays(
        formatPlanningDayForInput(result.value.reviewPeriodDays),
      );
      setSavedNote(result.metricsRefresh.note);
      router.refresh();
    });
  }

  return (
    <section
      aria-labelledby="planning-inputs-heading"
      data-planning-inputs="true"
      className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Merchant assumptions
          </p>
          <h2
            id="planning-inputs-heading"
            className="mt-2 text-xl font-semibold tracking-[-0.03em] text-zinc-950 sm:text-2xl"
          >
            Planning inputs
          </h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Organization-default planning days are merchant assumptions for
            future threshold math — not verified supplier or SKU facts. Leave a
            field blank when unknown; StoreAgent never treats missing as zero.
            Commercial actions stay disabled.
          </p>
        </div>
        {!canEdit ? (
          <p className="shrink-0 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-600">
            View only — owner/admin can edit
          </p>
        ) : null}
      </div>

      <form
        method="post"
        onSubmit={handleSubmit}
        className="mt-6 space-y-5"
        data-can-edit={canEdit ? "true" : "false"}
      >
        <div className="grid gap-5 sm:grid-cols-3">
          <DayField
            id="lead-time-days"
            label="Lead time (days)"
            hint="Assumed organization default lead time. 0 means same-day replenishment — not a verified supplier fact."
            value={leadTimeDays}
            disabled={!canEdit || pending}
            onChange={setLeadTimeDays}
            onClear={() => setLeadTimeDays("")}
          />
          <DayField
            id="safety-stock-days"
            label="Safety stock (days)"
            hint="Assumed extra cover days. Blank keeps safety stock unknown."
            value={safetyStockDays}
            disabled={!canEdit || pending}
            onChange={setSafetyStockDays}
            onClear={() => setSafetyStockDays("")}
          />
          <DayField
            id="review-period-days"
            label="Review period (days)"
            hint="Assumed review cadence for target stock. Blank stays unknown."
            value={reviewPeriodDays}
            disabled={!canEdit || pending}
            onChange={setReviewPeriodDays}
            onClear={() => setReviewPeriodDays("")}
          />
        </div>

        {error ? (
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
          >
            {error}
          </p>
        ) : null}
        {savedNote ? (
          <p
            role="status"
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
          >
            {savedNote}
          </p>
        ) : null}

        {canEdit ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-5 text-zinc-500">
              Partial saves are allowed. Clearing a field and saving restores
              unknown for that input only.
            </p>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-zinc-950 px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending ? (
                <LoaderCircle
                  className="size-4 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Save className="size-4" aria-hidden="true" />
              )}
              {pending ? "Saving…" : "Save planning inputs"}
            </button>
          </div>
        ) : null}
      </form>
    </section>
  );
}
