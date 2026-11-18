"use client";

import { type FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Save } from "lucide-react";

import { saveMerchantPlanningInputsAction } from "@/lib/planning-inputs/actions";
import { REPLENISHMENT_FIELD_COPY } from "@/lib/planning-inputs/merchant-copy";
import { formatPlanningDayForInput } from "@/lib/planning-inputs/parse";
import type { MerchantPlanningInputs } from "@/lib/planning-inputs/types";
import { cn } from "@/lib/utils";

function DayField({
  id,
  label,
  hint,
  placeholder,
  value,
  disabled,
  onChange,
  onClear,
}: {
  id: string;
  label: string;
  hint: string;
  placeholder: string;
  value: string;
  disabled: boolean;
  onChange: (next: string) => void;
  onClear: () => void;
}) {
  const hintId = `${id}-hint`;
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-zinc-900">
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
        placeholder={placeholder}
        value={value}
        disabled={disabled}
        aria-describedby={hintId}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "mt-2 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-950 outline-none transition",
          "placeholder:text-zinc-400",
          "focus:border-zinc-400 focus:ring-2 focus:ring-zinc-200",
          "disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-500",
        )}
      />
      <p id={hintId} className="mt-1.5 text-xs leading-5 text-zinc-500">
        {hint}
      </p>
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
      aria-labelledby="replenishment-settings-heading"
      data-planning-inputs="true"
      data-replenishment-settings="true"
      className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Merchant assumptions
          </p>
          <h2
            id="replenishment-settings-heading"
            className="mt-1.5 text-xl font-semibold tracking-[-0.03em] text-zinc-950 sm:text-2xl"
          >
            Replenishment settings
          </h2>
          <p className="mt-1.5 text-sm leading-6 text-zinc-600">
            Organization defaults for reorder math — merchant assumptions, not
            verified supplier or SKU facts. Leave a field blank when unknown;
            StoreAgent never treats missing as zero. Examples in the fields are
            illustrations only. Commercial actions stay disabled.
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
        className="mt-5 space-y-4"
        data-can-edit={canEdit ? "true" : "false"}
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <DayField
            id={REPLENISHMENT_FIELD_COPY.leadTimeDays.id}
            label={REPLENISHMENT_FIELD_COPY.leadTimeDays.label}
            hint={REPLENISHMENT_FIELD_COPY.leadTimeDays.hint}
            placeholder={REPLENISHMENT_FIELD_COPY.leadTimeDays.placeholder}
            value={leadTimeDays}
            disabled={!canEdit || pending}
            onChange={setLeadTimeDays}
            onClear={() => setLeadTimeDays("")}
          />
          <DayField
            id={REPLENISHMENT_FIELD_COPY.safetyStockDays.id}
            label={REPLENISHMENT_FIELD_COPY.safetyStockDays.label}
            hint={REPLENISHMENT_FIELD_COPY.safetyStockDays.hint}
            placeholder={REPLENISHMENT_FIELD_COPY.safetyStockDays.placeholder}
            value={safetyStockDays}
            disabled={!canEdit || pending}
            onChange={setSafetyStockDays}
            onClear={() => setSafetyStockDays("")}
          />
          <DayField
            id={REPLENISHMENT_FIELD_COPY.reviewPeriodDays.id}
            label={REPLENISHMENT_FIELD_COPY.reviewPeriodDays.label}
            hint={REPLENISHMENT_FIELD_COPY.reviewPeriodDays.hint}
            placeholder={REPLENISHMENT_FIELD_COPY.reviewPeriodDays.placeholder}
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
              unknown for that setting only.
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
              {pending ? "Saving…" : "Save replenishment settings"}
            </button>
          </div>
        ) : null}
      </form>
    </section>
  );
}
