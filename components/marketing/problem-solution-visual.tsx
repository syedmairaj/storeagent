"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Ban,
  Clock3,
  HelpCircle,
  PackageMinus,
  ShieldCheck,
} from "lucide-react";

import {
  formatStoryMetric,
  formatStoryNumber,
  getStoryScenarios,
} from "@/components/marketing/decision-story-meta";
import { cn } from "@/lib/utils";

/**
 * Expressive problem → solution illustration using the same sample fixtures
 * as the hero story (no invented dollars).
 * Manual selection only — no independent auto-rotation.
 */
export function ProblemSolutionVisual() {
  const scenarios = getStoryScenarios();
  const reorder = scenarios.find((s) => s.type === "REORDER")!;
  const reduce = scenarios.find((s) => s.type === "REDUCE")!;
  const promote = scenarios.find((s) => s.type === "PROMOTE")!;
  const watch = scenarios.find((s) => s.type === "WATCH")!;
  const [active, setActive] = useState(0);

  const problems = [
    {
      icon: AlertTriangle,
      title: "Low stock",
      detail: `${reorder.action.productTitle}: ${formatStoryMetric(reorder.action.evidence.availableQuantity, "units")} vs reorder point ${formatStoryNumber(reorder.action.evidence.reorderPointUnits)}`,
    },
    {
      icon: PackageMinus,
      title: "Excess coverage",
      detail: `${reduce.action.productTitle}: ${formatStoryMetric(reduce.action.evidence.daysOfStock, "days of stock")}`,
    },
    {
      icon: Clock3,
      title: "Aging inventory",
      detail: `${promote.action.productTitle}: age ${formatStoryMetric(promote.action.evidence.inventoryAgeDays, "days")}`,
    },
    {
      icon: HelpCircle,
      title: "Missing information",
      detail: `${watch.action.productTitle}: velocity and cover unknown`,
    },
  ];

  const solutions = [
    {
      action: "Reorder",
      risk: "Sales at risk from thin cover",
      evidence: reorder.action.conciseReason,
      review: "You review before anything is ordered",
    },
    {
      action: "Reduce",
      risk: "Capital tied up in slow movers",
      evidence: reduce.action.conciseReason,
      review: "You decide whether to cut commitment",
    },
    {
      action: "Promote",
      risk: "Aging / markdown pressure",
      evidence: promote.action.conciseReason,
      review: "You choose how to move the stock",
    },
    {
      action: "Watch",
      risk: "Avoid a premature buy or cut",
      evidence: watch.action.conciseReason,
      review: "Holding is the recommendation — you stay in control",
    },
  ];

  const sol = solutions[active]!;
  const ProblemIcon = problems[active]!.icon;

  return (
    <div className="mt-8 grid gap-4 lg:grid-cols-2 lg:gap-6">
      <div className="rounded-2xl border border-[color-mix(in_srgb,var(--sa-porcelain)_14%,transparent)] bg-[color-mix(in_srgb,var(--sa-porcelain)_6%,transparent)] p-4 sm:p-5">
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.14em] text-[var(--sa-stone)]">
          Without clarity
        </p>
        <ul className="mt-3 space-y-2">
          {problems.map((p, i) => {
            const Icon = p.icon;
            const on = i === active;
            return (
              <li key={p.title}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                    on
                      ? "bg-[color-mix(in_srgb,var(--sa-porcelain)_12%,transparent)]"
                      : "hover:bg-[color-mix(in_srgb,var(--sa-porcelain)_6%,transparent)]",
                  )}
                  onClick={() => setActive(i)}
                  aria-pressed={on}
                >
                  <Icon
                    className={cn(
                      "mt-0.5 size-4 shrink-0",
                      on ? "text-[var(--sa-signal)]" : "text-[var(--sa-stone)]",
                    )}
                    aria-hidden="true"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-[var(--sa-porcelain)]">
                      {p.title}
                    </span>
                    <span className="mt-0.5 block text-xs leading-snug text-[color-mix(in_srgb,var(--sa-porcelain)_62%,transparent)]">
                      {p.detail}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
          <li className="flex items-start gap-3 px-3 py-2 text-xs text-[color-mix(in_srgb,var(--sa-porcelain)_55%,transparent)]">
            <Ban className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Operational uncertainty until someone digs through spreadsheets.
          </li>
        </ul>
      </div>

      <div
        key={active}
        className="rounded-2xl border border-[color-mix(in_srgb,var(--sa-signal)_35%,transparent)] bg-[color-mix(in_srgb,var(--sa-porcelain)_8%,transparent)] p-4 sm:p-5"
      >
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.14em] text-[var(--sa-signal)]">
          With StoreAgent
        </p>
        <div className="mt-3 flex items-center gap-2">
          <ProblemIcon className="size-4 text-[var(--sa-signal)]" aria-hidden="true" />
          <p className="font-display text-lg font-semibold text-[var(--sa-porcelain)]">
            Clear action: {sol.action}
          </p>
        </div>
        <dl className="mt-4 space-y-3 text-sm">
          <div>
            <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-[var(--sa-stone)]">
              Supporting evidence
            </dt>
            <dd className="mt-1 text-[color-mix(in_srgb,var(--sa-porcelain)_82%,transparent)]">
              {sol.evidence}
            </dd>
          </div>
          <div>
            <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-[var(--sa-stone)]">
              Relevant risk
            </dt>
            <dd className="mt-1 text-[color-mix(in_srgb,var(--sa-porcelain)_82%,transparent)]">
              {sol.risk}
            </dd>
          </div>
          <div className="flex items-start gap-2 rounded-xl bg-[color-mix(in_srgb,var(--sa-signal)_12%,transparent)] px-3 py-2.5">
            <ShieldCheck
              className="mt-0.5 size-4 shrink-0 text-[var(--sa-signal)]"
              aria-hidden="true"
            />
            <div>
              <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-[var(--sa-signal)]">
                Merchant review
              </dt>
              <dd className="mt-0.5 text-[color-mix(in_srgb,var(--sa-porcelain)_88%,transparent)]">
                {sol.review}
              </dd>
            </div>
          </div>
        </dl>
        <p className="mt-3 text-[0.65rem] text-[color-mix(in_srgb,var(--sa-porcelain)_48%,transparent)]">
          Demo with sample data — not live store results or invented savings.
        </p>
      </div>
    </div>
  );
}
