"use client";

import { useState, useTransition } from "react";

import {
  DECISION_ORDER,
  DECISION_TYPE_UI,
} from "@/components/marketing/decision-type-meta";
import { formatStoryMetric } from "@/components/marketing/decision-story-meta";
import type { DemoActionType } from "@/lib/demo/m7-decision-demo-fixtures";
import { getM7DecisionDemoFixtureRoot } from "@/lib/demo/m7-decision-demo-fixtures";
import { explainDemoReasonCode } from "@/lib/demo/m7-decision-demo-format";
import { cn } from "@/lib/utils";

function actionForType(type: DemoActionType) {
  const fixture = getM7DecisionDemoFixtureRoot();
  return fixture.actions.find((a) => a.actionType === type);
}

export function FourDecisionsExplorer() {
  const [active, setActive] = useState<DemoActionType>("REORDER");
  const [pending, startTransition] = useTransition();
  const action = actionForType(active);
  const ui = DECISION_TYPE_UI[active];
  const Icon = ui.Icon;

  const select = (type: DemoActionType) => {
    startTransition(() => setActive(type));
  };

  const onTabListKeyDown = (e: React.KeyboardEvent) => {
    const idx = DECISION_ORDER.indexOf(active);
    if (e.key === "ArrowDown" || e.key === "ArrowRight") {
      e.preventDefault();
      select(DECISION_ORDER[(idx + 1) % DECISION_ORDER.length]!);
    } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
      e.preventDefault();
      select(
        DECISION_ORDER[(idx - 1 + DECISION_ORDER.length) % DECISION_ORDER.length]!,
      );
    } else if (e.key === "Home") {
      e.preventDefault();
      select(DECISION_ORDER[0]!);
    } else if (e.key === "End") {
      e.preventDefault();
      select(DECISION_ORDER[DECISION_ORDER.length - 1]!);
    }
  };

  return (
    <div
      id="four-decisions-explorer"
      role="region"
      aria-label="Four decisions comparison explorer"
      className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-10"
    >
      <div
        role="tablist"
        aria-label="Compare inventory decisions"
        aria-orientation="vertical"
        className="flex flex-col gap-2"
        onKeyDown={onTabListKeyDown}
      >
        {DECISION_ORDER.map((type) => {
          const meta = DECISION_TYPE_UI[type];
          const TabIcon = meta.Icon;
          const selected = type === active;
          return (
            <button
              key={type}
              type="button"
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              id={`decision-tab-${type}`}
              aria-controls="decision-panel"
              className={cn(
                "group flex w-full items-start gap-3 rounded-2xl border px-4 py-3.5 text-left transition-[border-color,background,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sa-insight)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--sa-porcelain)] sm:px-5 sm:py-4",
                selected
                  ? "border-[var(--sa-ink)] bg-[var(--sa-ink)] text-[var(--sa-porcelain)] shadow-[0_18px_40px_-24px_color-mix(in_srgb,var(--sa-ink)_55%,transparent)]"
                  : "border-[var(--sa-frame)] bg-[var(--sa-porcelain)] text-[var(--sa-ink)] hover:border-[color-mix(in_srgb,var(--sa-ink)_28%,var(--sa-frame))] hover:bg-[color-mix(in_srgb,var(--sa-ink)_3%,var(--sa-porcelain))]",
              )}
              onClick={() => select(type)}
            >
              <span
                className={cn(
                  "mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors",
                  selected
                    ? "bg-[color-mix(in_srgb,var(--sa-porcelain)_14%,transparent)]"
                    : "bg-[color-mix(in_srgb,var(--sa-ink)_5%,transparent)]",
                )}
              >
                <TabIcon className="size-4" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block font-display text-lg font-semibold tracking-[-0.02em]">
                  {meta.label}
                </span>
                <span
                  className={cn(
                    "mt-0.5 block text-sm leading-snug",
                    selected
                      ? "text-[color-mix(in_srgb,var(--sa-porcelain)_78%,transparent)]"
                      : "text-[var(--sa-ink-muted)]",
                  )}
                >
                  {meta.shortPitch}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div
        id="decision-panel"
        role="tabpanel"
        aria-labelledby={`decision-tab-${active}`}
        className={cn(
          "rounded-2xl border border-[var(--sa-frame)] bg-[color-mix(in_srgb,var(--sa-stone)_22%,var(--sa-porcelain))] p-5 transition-opacity duration-200 sm:p-7",
          pending && "opacity-90",
        )}
      >
        {action ? (
          <div key={action.id} className="sa-panel-swap">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.7rem] font-bold uppercase tracking-[0.06em]",
                  ui.chip,
                )}
              >
                <Icon className="size-3.5" aria-hidden="true" />
                {ui.label}
              </span>
              <span className="rounded-full border border-[var(--sa-frame)] bg-[var(--sa-porcelain)] px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-[0.08em] text-[var(--sa-ink-muted)]">
                Demo sample data
              </span>
            </div>

            <h3 className="font-display text-[1.35rem] font-semibold leading-snug tracking-[-0.02em] text-[var(--sa-ink)] sm:text-2xl">
              {action.productTitle}
            </h3>
            <p className="mt-1 text-sm text-[var(--sa-ink-muted)]">
              {action.variantTitle}
            </p>

            <p className="mt-4 text-[0.95rem] leading-relaxed text-[var(--sa-ink)]">
              {action.conciseReason}
            </p>

            <p className="mt-3 text-sm font-medium text-[var(--sa-ink-muted)]">
              Business risk: {ui.riskLabel}. Explained with stock and sales
              signals — not invented dollar savings.
            </p>

            <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                {
                  label: "Available",
                  value: formatStoryMetric(
                    action.evidence.availableQuantity,
                    "units",
                  ),
                },
                {
                  label: "Days of stock",
                  value: formatStoryMetric(action.evidence.daysOfStock, "days"),
                },
                {
                  label: "Age",
                  value: formatStoryMetric(
                    action.evidence.inventoryAgeDays,
                    "days",
                  ),
                },
                {
                  label: "Suggested qty",
                  value:
                    action.recommendedQuantity != null
                      ? formatStoryMetric(action.recommendedQuantity, "units")
                      : "—",
                },
              ].map((row) => (
                <div
                  key={row.label}
                  className="rounded-xl border border-[var(--sa-frame)] bg-[var(--sa-porcelain)] px-3 py-2.5"
                >
                  <dt className="text-[0.62rem] font-semibold uppercase tracking-[0.08em] text-[var(--sa-ink-muted)]">
                    {row.label}
                  </dt>
                  <dd className="mt-0.5 text-base font-semibold tabular-nums text-[var(--sa-ink)]">
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="mt-5">
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-[var(--sa-ink-muted)]">
                Why StoreAgent recommends this
              </p>
              <ul className="mt-2 space-y-1.5">
                {action.evidence.reasonCodes.map((code) => (
                  <li
                    key={code}
                    className="text-sm leading-snug text-[var(--sa-ink)]"
                  >
                    {explainDemoReasonCode(code)}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <p className="text-sm text-[var(--sa-ink-muted)]">
            No sample scenario for this decision type.
          </p>
        )}
      </div>
    </div>
  );
}
