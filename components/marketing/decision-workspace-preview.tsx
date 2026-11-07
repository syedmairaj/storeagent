"use client";

import { useId, useState, useTransition } from "react";
import { ArrowUpRight } from "lucide-react";

import { DECISION_TYPE_UI } from "@/components/marketing/decision-type-meta";
import type { DemoActionItem } from "@/lib/demo/m7-decision-demo-fixtures";
import { getM7DecisionDemoFixtureRoot } from "@/lib/demo/m7-decision-demo-fixtures";
import {
  explainDemoReasonCode,
  formatDemoConfidenceLabel,
  formatDemoDataQualityScore,
  formatDemoPriorityLabel,
  formatDemoUnknownNumber,
} from "@/lib/demo/m7-decision-demo-format";
import { cn } from "@/lib/utils";

function coverageLabel(action: DemoActionItem): string {
  const days = action.evidence.daysOfStock;
  if (days === null || !Number.isFinite(days)) return "Coverage unknown";
  if (days < 7) return "Thin coverage";
  if (days < 30) return "Moderate coverage";
  if (days < 90) return "Elevated coverage";
  return "Heavy coverage";
}

function stockRiskLine(action: DemoActionItem): string {
  const available = action.evidence.availableQuantity;
  const reorder = action.evidence.reorderPointUnits;
  const ui = DECISION_TYPE_UI[action.actionType];

  if (
    action.actionType === "REORDER" &&
    typeof available === "number" &&
    typeof reorder === "number"
  ) {
    return `${ui.riskLabel}: available ${formatDemoUnknownNumber(available)} vs reorder point ${formatDemoUnknownNumber(reorder)} (synthetic).`;
  }

  if (
    action.actionType === "REDUCE" ||
    action.actionType === "PROMOTE"
  ) {
    return `${ui.riskLabel}: ${formatDemoUnknownNumber(action.evidence.daysOfStock, { digits: 1 })} days of stock, age ${formatDemoUnknownNumber(action.evidence.inventoryAgeDays)} days (synthetic).`;
  }

  return `${ui.riskLabel}: hold until evidence is complete enough to act (synthetic).`;
}

/**
 * Interactive synthetic Actions preview for marketing.
 * Selection updates evidence from M7 fixtures. No fake Accept/Edit/Defer.
 */
export function DecisionWorkspacePreview({
  className,
  id,
}: {
  className?: string;
  id?: string;
}) {
  const fixture = getM7DecisionDemoFixtureRoot();
  const actions = fixture.actions.slice(0, 4);
  const [selectedId, setSelectedId] = useState(actions[0]?.id ?? "");
  const [pending, startTransition] = useTransition();
  const labelId = useId();

  const selected =
    actions.find((a) => a.id === selectedId) ?? actions[0];
  if (!selected) return null;

  const selectedUi = DECISION_TYPE_UI[selected.actionType];
  const SelectedIcon = selectedUi.Icon;

  return (
    <div
      id={id}
      className={cn(
        "relative mx-auto w-full max-w-[38rem] scroll-mt-24 lg:max-w-none",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="absolute -inset-4 rounded-[1.85rem] bg-[radial-gradient(ellipse_at_28%_18%,color-mix(in_srgb,var(--sa-insight)_20%,transparent),transparent_55%),radial-gradient(ellipse_at_85%_75%,color-mix(in_srgb,var(--sa-signal)_16%,transparent),transparent_48%)]"
      />
      <div
        className={cn(
          "relative overflow-hidden rounded-[1.35rem] border border-[var(--sa-frame)] bg-[var(--sa-porcelain)] shadow-[0_32px_64px_-30px_color-mix(in_srgb,var(--sa-ink)_48%,transparent),0_0_0_1px_color-mix(in_srgb,var(--sa-ink)_4%,transparent)] transition-opacity duration-200",
          pending && "opacity-90",
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--sa-frame)] bg-[color-mix(in_srgb,var(--sa-ink)_3%,var(--sa-porcelain))] px-3.5 py-2.5 sm:px-4">
          <div className="min-w-0">
            <p
              id={labelId}
              className="truncate text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-[var(--sa-ink-muted)]"
            >
              Decision workspace
            </p>
            <p className="truncate text-sm font-semibold text-[var(--sa-ink)]">
              {fixture.storeLabel}
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-[color-mix(in_srgb,var(--sa-signal)_55%,var(--sa-frame))] bg-[color-mix(in_srgb,var(--sa-signal)_28%,var(--sa-porcelain))] px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-[0.08em] text-[var(--sa-ink)]">
            Synthetic demo
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <ul
            className="divide-y divide-[var(--sa-frame)] border-b border-[var(--sa-frame)] sm:border-b-0 sm:border-r"
            role="listbox"
            aria-labelledby={labelId}
            aria-label="Synthetic decision queue"
          >
            {actions.map((action) => {
              const ui = DECISION_TYPE_UI[action.actionType];
              const Icon = ui.Icon;
              const active = action.id === selected.id;
              return (
                <li key={action.id} role="none">
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={cn(
                      "relative flex w-full gap-3 px-3.5 py-3 text-left transition-colors focus-visible:z-10 sm:px-4",
                      active
                        ? "bg-[color-mix(in_srgb,var(--sa-insight)_9%,var(--sa-porcelain))]"
                        : "hover:bg-[var(--sa-ink-soft)]",
                    )}
                    onClick={() =>
                      startTransition(() => setSelectedId(action.id))
                    }
                  >
                    <span
                      className={cn(
                        "mt-1 h-8 w-1 shrink-0 rounded-full transition-opacity",
                        ui.accent,
                        !active && "opacity-35",
                      )}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-1.5">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-[0.06em]",
                            ui.chip,
                          )}
                        >
                          <Icon className="size-3" aria-hidden="true" />
                          {ui.label}
                        </span>
                        <span className="text-[0.65rem] font-medium uppercase tracking-wide text-[var(--sa-ink-muted)]">
                          {formatDemoPriorityLabel(action.priority)}
                        </span>
                      </div>
                      <p className="truncate text-sm font-semibold text-[var(--sa-ink)]">
                        {action.productTitle}
                      </p>
                      <p className="truncate text-xs text-[var(--sa-ink-muted)]">
                        {action.variantTitle}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>

          <div
            key={selected.id}
            className="sa-panel-swap flex flex-col gap-3 bg-[color-mix(in_srgb,var(--sa-ink)_2.5%,var(--sa-porcelain))] p-3.5 sm:p-4"
          >
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-[0.06em]",
                    selectedUi.chip,
                  )}
                >
                  <SelectedIcon className="size-3" aria-hidden="true" />
                  {selectedUi.label}
                </span>
                <span className="text-[0.7rem] font-medium text-[var(--sa-ink-muted)]">
                  Confidence ·{" "}
                  {formatDemoConfidenceLabel(selected.confidence)}{" "}
                  <span className="font-normal">(fixture)</span>
                </span>
              </div>
              <h3 className="font-display text-lg leading-snug tracking-[-0.02em] text-[var(--sa-ink)]">
                {selected.productTitle}
              </h3>
              <p className="mt-1 text-xs text-[var(--sa-ink-muted)]">
                {selected.variantTitle}
              </p>
            </div>

            <p className="text-sm leading-relaxed text-[var(--sa-ink)]">
              {selected.conciseReason}
            </p>

            <p className="rounded-lg border border-[var(--sa-frame)] bg-[var(--sa-porcelain)] px-3 py-2 text-xs leading-relaxed text-[var(--sa-ink-muted)]">
              {stockRiskLine(selected)} · {coverageLabel(selected)}
            </p>

            <dl className="grid grid-cols-2 gap-2 rounded-xl border border-[var(--sa-frame)] bg-[var(--sa-porcelain)] p-3">
              <div>
                <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-[var(--sa-ink-muted)]">
                  Available
                </dt>
                <dd className="text-sm font-semibold tabular-nums">
                  {formatDemoUnknownNumber(
                    selected.evidence.availableQuantity,
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-[var(--sa-ink-muted)]">
                  Days of stock
                </dt>
                <dd className="text-sm font-semibold tabular-nums">
                  {formatDemoUnknownNumber(
                    selected.evidence.daysOfStock,
                    { digits: 1 },
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-[var(--sa-ink-muted)]">
                  Reorder point
                </dt>
                <dd className="text-sm font-semibold tabular-nums">
                  {formatDemoUnknownNumber(
                    selected.evidence.reorderPointUnits,
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-[var(--sa-ink-muted)]">
                  Suggested qty
                </dt>
                <dd className="text-sm font-semibold tabular-nums">
                  {selected.recommendedQuantity != null
                    ? formatDemoUnknownNumber(selected.recommendedQuantity)
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-[var(--sa-ink-muted)]">
                  Velocity
                </dt>
                <dd className="text-sm font-semibold tabular-nums">
                  {formatDemoUnknownNumber(
                    selected.evidence.demandVelocity,
                    { digits: 1 },
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.08em] text-[var(--sa-ink-muted)]">
                  Data health
                </dt>
                <dd className="text-sm font-semibold tabular-nums">
                  {formatDemoDataQualityScore(
                    selected.evidence.dataQualityScore,
                  )}
                </dd>
              </div>
            </dl>

            <div>
              <p className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-[var(--sa-ink-muted)]">
                Supporting signals
              </p>
              <ul className="space-y-1">
                {selected.evidence.reasonCodes.slice(0, 3).map((code) => (
                  <li
                    key={code}
                    className="text-xs leading-snug text-[var(--sa-ink)]"
                  >
                    <span className="text-[var(--sa-insight)]">·</span>{" "}
                    {explainDemoReasonCode(code)}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-auto border-t border-[var(--sa-frame)] pt-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-[var(--sa-ink-muted)]">
                  Merchant review
                </p>
                <span className="rounded-full bg-[color-mix(in_srgb,var(--sa-insight)_14%,transparent)] px-2 py-0.5 text-[0.65rem] font-semibold text-[var(--sa-ink)]">
                  Pending review
                </span>
              </div>
              <a
                href="/login?next=/app"
                className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--sa-ink)] px-4 py-2.5 text-[0.8rem] font-semibold text-[var(--sa-porcelain)] transition-[transform,background] hover:bg-[color-mix(in_srgb,var(--sa-ink)_90%,var(--sa-insight))] active:translate-y-px"
              >
                Open interactive demo
                <ArrowUpRight
                  className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                  aria-hidden="true"
                />
              </a>
              <p className="mt-2 text-[0.7rem] leading-snug text-[var(--sa-ink-muted)]">
                Accept, edit, and defer run in the signed-in synthetic Actions
                workspace — not as fake buttons here.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
