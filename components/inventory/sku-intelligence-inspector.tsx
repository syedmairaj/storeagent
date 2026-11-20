"use client";

import { useEffect, useId, useRef } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";

import {
  presentSkuAttention,
  type SkuAttentionContext,
} from "@/lib/inventory-intelligence/sku-attention-presentation";
import type { MerchantInventoryIntelligenceRow } from "@/lib/inventory-intelligence/types";
import { cn } from "@/lib/utils";

export function SkuIntelligenceInspector({
  row,
  open,
  onOpenChange,
  stockObservationsStale,
  returnFocusRef,
}: {
  row: MerchantInventoryIntelligenceRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stockObservationsStale: boolean;
  /** Element that opened the inspector — receives focus on safe close. */
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const context: SkuAttentionContext = { stockObservationsStale };
  const presentation = row ? presentSkuAttention(row, context) : null;

  useEffect(() => {
    if (!open) {
      return;
    }
    // Prefer close control; Base UI also traps focus inside the modal popup.
    closeRef.current?.focus();
  }, [open, row?.grainKey]);

  return (
    <Dialog.Root
      open={open && row !== null}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          queueMicrotask(() => {
            returnFocusRef?.current?.focus();
          });
        }
      }}
      modal
    >
      <Dialog.Portal>
        <Dialog.Backdrop
          className="fixed inset-0 z-[80] bg-zinc-950/40 motion-safe:transition-opacity motion-safe:duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0"
          data-sku-inspector-backdrop="true"
        />
        <Dialog.Popup
          className={cn(
            "fixed z-[90] flex flex-col overflow-hidden bg-white shadow-2xl outline-none",
            // Mobile: full-screen accessible sheet
            "inset-0",
            // Desktop: right-side drawer
            "md:inset-y-0 md:left-auto md:right-0 md:w-[min(28rem,100vw)] md:border-l md:border-zinc-200",
            "motion-safe:transition-transform motion-safe:duration-200",
            "data-[ending-style]:translate-x-4 data-[ending-style]:opacity-0 data-[starting-style]:translate-x-4 data-[starting-style]:opacity-0",
            "md:data-[ending-style]:translate-x-8 md:data-[starting-style]:translate-x-8",
          )}
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          data-sku-inspector="true"
          data-sku-inspector-grain={row?.grainKey ?? undefined}
        >
          <div className="flex shrink-0 items-start gap-3 border-b border-zinc-200 px-4 py-3 sm:px-5 sm:py-4">
            <div className="min-w-0 flex-1">
              <Dialog.Title
                id={titleId}
                className="text-base font-semibold tracking-[-0.02em] text-zinc-950 sm:text-lg"
                data-sku-inspector-title="true"
              >
                {row?.sku ?? "SKU"}
              </Dialog.Title>
              <Dialog.Description
                id={descriptionId}
                className="mt-0.5 text-sm leading-5 text-zinc-600"
              >
                {row?.productTitle?.trim() || "Untitled product"}
                {row ? ` · ${row.storeName} / ${row.locationName}` : null}
              </Dialog.Description>
            </div>
            <Dialog.Close
              ref={closeRef}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 outline-none transition-[border-color,background-color,color] hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-950 focus:outline-none focus-visible:border-zinc-400 focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2"
              aria-label="Close product inspector"
              data-sku-inspector-close="true"
            >
              <X className="size-5" aria-hidden="true" />
            </Dialog.Close>
          </div>

          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-5 sm:py-5 [-webkit-overflow-scrolling:touch]"
            data-sku-inspector-scroll="true"
          >
            {row && presentation ? (
              <InspectorBody
                presentation={presentation}
                stockObservationsStale={stockObservationsStale}
              />
            ) : null}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function InspectorBody({
  presentation,
  stockObservationsStale,
}: {
  presentation: ReturnType<typeof presentSkuAttention>;
  stockObservationsStale: boolean;
}) {
  const { evidence } = presentation;
  const thresholds = evidence.facts.find((f) => f.id === "thresholds");
  const available = evidence.facts.find((f) => f.id === "available");
  const velocity = evidence.facts.find((f) => f.id === "velocity");
  const cover = evidence.facts.find((f) => f.id === "cover");
  const eligible = evidence.facts.find((f) => f.id === "eligible_days");
  const provenance = evidence.facts.find((f) => f.id === "provenance");

  return (
    <div className="space-y-5">
      {/* Identity lives once in Dialog.Title / Description — not repeated here. */}
      <section data-inspector-section="interpretation">
        <SectionLabel>Reading</SectionLabel>
        <p
          className="mt-1 text-sm leading-6 text-zinc-800"
          data-inspector-interpretation="true"
        >
          {evidence.interpretation}
        </p>
        <p className="mt-2 text-xs leading-5 text-zinc-500">
          {presentation.decisionEligibilityLabel}
        </p>
      </section>

      <section data-inspector-section="stock">
        <SectionLabel>Stock condition</SectionLabel>
        <p
          className="mt-1 text-sm font-semibold text-zinc-950"
          data-inspector-stock-condition="true"
        >
          {presentation.stockConditionLabel}
        </p>
        {presentation.stockConditionDetail ? (
          <p className="mt-0.5 text-xs leading-5 text-zinc-500">
            {presentation.stockConditionDetail}
          </p>
        ) : null}
        <FactRow
          label={
            stockObservationsStale
              ? "Last recorded available"
              : "Available quantity"
          }
          value={available?.value ?? "—"}
          factId="available"
        />
      </section>

      <section data-inspector-section="demand">
        <SectionLabel>
          {evidence.metricIsHistorical
            ? "Historical sales rate"
            : "Observed sales rate"}
        </SectionLabel>
        {evidence.metricIsHistorical ? (
          <p
            className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950"
            data-inspector-historical-notice="true"
          >
            Sales rate and thresholds below are historical while cover is not
            current — not a live buy quantity.
          </p>
        ) : null}
        <FactRow
          label="Velocity (30d)"
          value={velocity?.value ?? "—"}
          factId="velocity"
        />
        {eligible ? (
          <FactRow
            label="Eligible sales days"
            value={eligible.value}
            factId="eligible_days"
          />
        ) : null}
      </section>

      <section data-inspector-section="cover">
        <SectionLabel>Cover</SectionLabel>
        <p
          className="mt-1 text-sm font-medium text-zinc-950"
          data-inspector-cover="true"
        >
          {presentation.coverAvailabilityLabel}
        </p>
        {cover ? (
          <p className="mt-0.5 text-xs text-zinc-500" data-evidence-fact="cover">
            {cover.value}
          </p>
        ) : null}
      </section>

      <section data-inspector-section="thresholds">
        <SectionLabel>
          {evidence.metricIsHistorical
            ? "Historical calculated thresholds"
            : "Calculated thresholds"}
        </SectionLabel>
        {thresholds ? (
          <p
            className="mt-1 text-sm leading-6 text-zinc-700"
            data-evidence-fact="thresholds"
          >
            {thresholds.value}
          </p>
        ) : (
          <p className="mt-1 text-sm text-zinc-500" data-thresholds-missing="true">
            SS / ROP / target are not available as known calculated thresholds
            for this grain.
          </p>
        )}
      </section>

      {evidence.missingLabels.length > 0 ? (
        <section data-inspector-section="missing">
          <SectionLabel>Missing evidence</SectionLabel>
          <p
            className="mt-1 text-sm leading-6 text-zinc-600"
            data-evidence-missing="true"
          >
            {evidence.missingLabels.join("; ")}
          </p>
        </section>
      ) : null}

      <section data-inspector-section="next">
        <SectionLabel>Next safe step</SectionLabel>
        <p
          className="mt-1 text-sm leading-6 text-zinc-700"
          data-evidence-next="true"
        >
          {evidence.nextStep}
        </p>
      </section>

      {provenance ? (
        <details
          className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2"
          data-inspector-section="provenance"
        >
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
            Metric provenance
          </summary>
          <p
            className="mt-2 text-sm leading-6 text-zinc-700"
            data-evidence-fact="provenance"
          >
            {provenance.value}
          </p>
        </details>
      ) : null}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-zinc-500">
      {children}
    </h3>
  );
}

function FactRow({
  label,
  value,
  factId,
}: {
  label: string;
  value: string;
  factId: string;
}) {
  return (
    <div className="mt-2 grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-3 text-sm">
      <span className="text-zinc-400">{label}</span>
      <span className="text-zinc-800" data-evidence-fact={factId}>
        {value}
      </span>
    </div>
  );
}
