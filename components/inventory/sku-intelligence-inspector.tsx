"use client";

import { useEffect, useId, useRef } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";

import { SkuCommerceAgentPanel } from "@/components/inventory/sku-commerce-agent-panel";
import { SkuExplainerPanel } from "@/components/inventory/sku-explainer-panel";
import {
  presentSkuAttention,
  type SkuAttentionContext,
} from "@/lib/inventory-intelligence/sku-attention-presentation";
import type { MerchantInventoryIntelligenceRow } from "@/lib/inventory-intelligence/types";
import {
  calculatedThresholdsMissingCopy,
  calculatedThresholdsSectionLabel,
} from "@/lib/planning-inputs/replenishment-impact-presentation";
import type { MerchantPlanningInputs } from "@/lib/planning-inputs/types";
import { cn } from "@/lib/utils";

export function SkuIntelligenceInspector({
  row,
  open,
  onOpenChange,
  stockObservationsStale,
  planning = null,
  returnFocusRef,
  commerceAgentVisible = false,
}: {
  row: MerchantInventoryIntelligenceRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stockObservationsStale: boolean;
  /** Persisted org planning days for compact threshold impact (UX-INV-1c). */
  planning?: MerchantPlanningInputs | null;
  /** Element that opened the inspector — receives focus on safe close. */
  returnFocusRef?: React.RefObject<HTMLElement | null>;
  /** Server-resolved commerce-agent soft-enable ∧ allowlist (default hidden). */
  commerceAgentVisible?: boolean;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const context: SkuAttentionContext = { stockObservationsStale, planning };
  const presentation = row ? presentSkuAttention(row, context) : null;

  useEffect(() => {
    if (!open) {
      return;
    }
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
            "inset-0",
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
                row={row}
                presentation={presentation}
                stockObservationsStale={stockObservationsStale}
                commerceAgentVisible={commerceAgentVisible}
              />
            ) : null}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function InspectorBody({
  row,
  presentation,
  stockObservationsStale,
  commerceAgentVisible,
}: {
  row: MerchantInventoryIntelligenceRow;
  presentation: ReturnType<typeof presentSkuAttention>;
  stockObservationsStale: boolean;
  commerceAgentVisible: boolean;
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
      {/* Condition first */}
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
        <p className="mt-2 text-xs leading-5 text-zinc-500">
          {presentation.decisionEligibilityLabel}
        </p>
      </section>

      {/* Next step second */}
      <section data-inspector-section="next">
        <SectionLabel>Next safe step</SectionLabel>
        <p
          className="mt-1 text-sm leading-6 text-zinc-700"
          data-evidence-next="true"
        >
          {evidence.nextStep}
        </p>
      </section>

      <SkuExplainerPanel
        row={row}
        organizationId={row.organizationId}
        stockObservationsStale={stockObservationsStale}
      />

      <SkuCommerceAgentPanel
        key={row.grainKey}
        row={row}
        organizationId={row.organizationId}
        stockObservationsStale={stockObservationsStale}
        visible={commerceAgentVisible}
      />

      {/* Concise fact groups */}
      <section data-inspector-section="facts">
        <SectionLabel>Evidence</SectionLabel>
        <FactRow
          label={
            stockObservationsStale
              ? "Last recorded available"
              : "Available"
          }
          value={available?.value ?? "—"}
          factId="available"
        />
        <FactRow
          label="Cover"
          value={
            cover
              ? `${presentation.coverAvailabilityLabel} · ${cover.value}`
              : presentation.coverAvailabilityLabel
          }
          factId="cover"
        />
        <FactRow
          label={
            evidence.metricIsHistorical ? "Historical velocity" : "Velocity (30d)"
          }
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

      <section data-inspector-section="thresholds">
        <SectionLabel>
          {calculatedThresholdsSectionLabel(evidence.metricIsHistorical)}
        </SectionLabel>
        {evidence.metricIsHistorical ? (
          <p
            className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950"
            data-inspector-historical-notice="true"
          >
            Historical while cover is not current — planning thresholds, not buy
            quantities.
          </p>
        ) : (
          <p className="mt-2 text-xs leading-5 text-zinc-500">
            Planning thresholds — not buy quantities.
          </p>
        )}
        {evidence.planningAssumptionsLine ? (
          <p
            className="mt-2 text-xs leading-5 text-zinc-600"
            data-inspector-planning-assumptions="true"
          >
            {evidence.planningAssumptionsLine}
          </p>
        ) : null}
        {thresholds ? (
          <p
            className="mt-1 text-sm leading-6 text-zinc-700"
            data-evidence-fact="thresholds"
          >
            {thresholds.value}
          </p>
        ) : (
          <p className="mt-1 text-sm text-zinc-500" data-thresholds-missing="true">
            {calculatedThresholdsMissingCopy()}
          </p>
        )}
        <a
          href="#replenishment-settings"
          className="mt-3 inline-flex min-h-11 items-center text-xs font-semibold text-zinc-800 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2"
          data-inspector-replenishment-link="true"
        >
          Review replenishment assumptions
        </a>
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
    <div className="mt-2 grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-3 text-sm sm:grid-cols-[8.5rem_minmax(0,1fr)]">
      <span className="text-zinc-400">{label}</span>
      <span className="min-w-0 break-words text-zinc-800" data-evidence-fact={factId}>
        {value}
      </span>
    </div>
  );
}
