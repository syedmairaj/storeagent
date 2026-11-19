import Link from "next/link";
import {
  ArrowRight,
  CircleAlert,
  CircleDashed,
  FileSpreadsheet,
  PackageSearch,
  ShieldCheck,
} from "lucide-react";

import { inventoryFilterHref } from "@/lib/inventory-intelligence/attention";
import type { MerchantOverviewPresentation } from "@/lib/inventory-readiness/overview-presentation";
import { cn } from "@/lib/utils";

export function MerchantOverviewDashboard({
  organizationId,
  presentation,
  hasStore,
  canManageSetup,
}: {
  organizationId: string;
  presentation: MerchantOverviewPresentation;
  hasStore: boolean;
  canManageSetup: boolean;
}) {
  return (
    <div
      className="sa-overview-root w-full min-w-0"
      data-merchant-overview="true"
      data-overview-freshness={presentation.freshness.kind}
      data-overview-stock-stale={presentation.stockIsStale ? "true" : "false"}
      data-overview-layout="responsive"
      data-commercial-queue="false"
    >
      <header
        className="relative border-b border-zinc-200/80 pb-6 sm:pb-8 lg:pb-10"
        data-overview-header="true"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_left,_rgba(24,24,27,0.06),_transparent_55%),linear-gradient(180deg,#fafafa_0%,#ffffff_70%)]"
        />

        <div className="flex flex-wrap items-center gap-2">
          <p
            className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-full border border-zinc-200 bg-white/90 px-3 text-xs font-medium text-zinc-600 shadow-sm"
            data-overview-scope="true"
          >
            <PackageSearch className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{presentation.scopeLabel}</span>
          </p>
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-zinc-500">
            Overview
          </p>
        </div>

        <div className="mt-4 max-w-3xl sm:mt-5">
          <h1
            className="text-balance text-[1.65rem] font-semibold leading-tight tracking-[-0.035em] text-zinc-950 motion-safe:animate-[sa-overview-fade_420ms_ease-out] sm:text-3xl sm:leading-snug md:text-4xl"
            data-overview-headline="true"
          >
            {presentation.headline}
          </h1>
          <p
            className="mt-3 max-w-2xl text-sm leading-6 text-zinc-600 motion-safe:animate-[sa-overview-fade_520ms_ease-out] sm:mt-4 sm:text-base sm:leading-7"
            data-overview-support="true"
          >
            {presentation.supportingSentence}
          </p>
        </div>

        <div className="mt-5 flex flex-col gap-2.5 sm:mt-7 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
          {hasStore || canManageSetup ? (
            <Link
              href={presentation.primaryCta.href}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-zinc-950 px-5 text-sm font-semibold text-white transition hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950 sm:w-auto"
              data-overview-primary-cta="true"
            >
              <FileSpreadsheet className="size-4" aria-hidden="true" />
              {presentation.primaryCta.label}
            </Link>
          ) : (
            <p className="inline-flex min-h-11 items-center text-sm font-medium text-zinc-400">
              Ask an owner or admin to finish first-store setup
            </p>
          )}
          {presentation.secondaryCta ? (
            <Link
              href={presentation.secondaryCta.href}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-zinc-200 bg-white px-5 text-sm font-medium text-zinc-700 transition hover:border-zinc-300 hover:text-zinc-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-400 sm:w-auto"
              data-overview-secondary-cta="true"
              data-synthetic-actions="true"
            >
              {presentation.secondaryCta.label}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          ) : null}
        </div>

        <p
          className="mt-3 max-w-2xl text-[0.7rem] leading-5 text-zinc-500 sm:mt-4 sm:text-xs"
          data-overview-commercial-fence="true"
          data-overview-evidence-honesty="true"
        >
          {presentation.commercialFence} {presentation.evidenceHonesty}
        </p>
      </header>

      <section
        className="grid min-w-0 gap-4 py-6 sm:gap-5 sm:py-8 lg:py-10 xl:grid-cols-[minmax(0,1.45fr)_minmax(17rem,0.7fr)] xl:items-start"
        aria-label="Inventory attention and data health"
        data-overview-body="true"
        data-overview-desktop-columns="xl"
      >
        <div className="min-w-0 space-y-4 sm:space-y-5">
          <div
            className="rounded-[1.5rem] border border-zinc-200 bg-white p-4 shadow-sm sm:rounded-[1.75rem] sm:p-6 lg:p-7"
            data-overview-attention="true"
          >
            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-end sm:justify-between sm:gap-2">
              <div className="min-w-0">
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-zinc-500 sm:text-[0.7rem]">
                  Attention summary
                </p>
                <h2 className="mt-1 text-lg font-semibold tracking-[-0.03em] text-zinc-950 sm:mt-1.5 sm:text-xl lg:text-2xl">
                  What deserves review first
                </h2>
              </div>
              <p className="text-[0.65rem] font-medium text-zinc-500 sm:text-xs">
                Evaluated counts · unavailable = —
              </p>
            </div>

            {presentation.signals.length > 0 ? (
              <ul
                className="mt-4 grid min-w-0 gap-2.5 sm:mt-6 sm:grid-cols-2 sm:gap-3 xl:grid-cols-3"
                role="list"
                data-overview-signal-list="true"
              >
                {presentation.signals.map((signal, index) => {
                  const href = inventoryFilterHref(
                    organizationId,
                    signal.filter,
                  );
                  const unavailable = signal.evaluation === "unavailable";
                  const actionable =
                    !unavailable && (signal.count ?? 0) > 0;
                  const body = (
                    <>
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className={cn(
                            "min-w-0 text-sm font-semibold leading-snug text-inherit",
                            unavailable && "text-zinc-500",
                          )}
                        >
                          {signal.label}
                        </span>
                        <SignalGlyph
                          tone={signal.tone}
                          active={actionable}
                          unavailable={unavailable}
                        />
                      </div>
                      <div className="mt-2 flex items-end justify-between gap-2 sm:mt-3">
                        <span
                          className={cn(
                            "font-semibold tabular-nums tracking-[-0.04em]",
                            unavailable
                              ? "text-2xl text-zinc-400 sm:text-3xl"
                              : "text-3xl text-inherit",
                          )}
                          data-overview-signal-evaluation={signal.evaluation}
                        >
                          {signal.displayValue}
                        </span>
                        <span className="max-w-[9.5rem] text-right text-[0.65rem] leading-4 opacity-80 sm:max-w-[11rem] sm:text-[0.7rem]">
                          {unavailable
                            ? "Not evaluable"
                            : signal.hrefEnabled
                              ? "Open evidence"
                              : "Evidence only"}
                        </span>
                      </div>
                    </>
                  );

                  const className = cn(
                    "flex min-h-11 min-w-0 flex-col justify-between rounded-2xl border transition motion-safe:animate-[sa-overview-rise_480ms_ease-out] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950",
                    unavailable
                      ? "border-zinc-200/80 bg-zinc-50/70 px-3 py-3 text-zinc-500 sm:px-4 sm:py-3.5"
                      : actionable
                        ? cn(toneClasses(signal.tone), "px-3.5 py-3.5 sm:px-4 sm:py-4")
                        : "border-zinc-100 bg-zinc-50/80 px-3.5 py-3.5 text-zinc-400 sm:px-4 sm:py-4",
                  );

                  return (
                    <li
                      key={signal.id}
                      className="min-w-0"
                      data-overview-signal-priority={
                        unavailable ? "supporting" : "actionable"
                      }
                    >
                      {signal.hrefEnabled ? (
                        <Link
                          href={href}
                          className={cn(className, "group")}
                          style={{ animationDelay: `${index * 40}ms` }}
                          aria-label={`${signal.label}: ${signal.displayValue}. ${signal.description}`}
                          data-overview-signal={signal.id}
                          data-overview-signal-count={signal.count ?? "null"}
                          data-overview-signal-evaluation={signal.evaluation}
                        >
                          {body}
                        </Link>
                      ) : (
                        <div
                          className={className}
                          style={{ animationDelay: `${index * 40}ms` }}
                          role="status"
                          aria-label={`${signal.label}: ${signal.displayValue}. ${signal.description}`}
                          data-overview-signal={signal.id}
                          data-overview-signal-count={signal.count ?? "null"}
                          data-overview-signal-evaluation={signal.evaluation}
                        >
                          {body}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div
                className="mt-4 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-6 text-center sm:mt-6 sm:py-8"
                data-overview-attention-empty="true"
                role="status"
              >
                <CircleDashed
                  className="mx-auto size-5 text-zinc-400"
                  aria-hidden="true"
                />
                <p className="mt-3 text-sm font-medium text-zinc-700">
                  {presentation.emptyAttentionMessage ??
                    "No attention signals available yet."}
                </p>
              </div>
            )}
          </div>

          <div
            className="rounded-[1.5rem] border border-dashed border-amber-200 bg-amber-50/60 px-4 py-3.5 sm:rounded-[1.75rem] sm:p-5 lg:p-6"
            data-overview-current-state="true"
            data-synthetic-actions-note="true"
          >
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-amber-800 sm:text-[0.7rem]">
              Synthetic only
            </p>
            <p
              className="mt-2 text-xs leading-5 text-amber-950 sm:mt-3 sm:text-sm sm:leading-6"
              data-overview-current-state-body="true"
            >
              The Actions demo is fixture-driven and labeled synthetic — not a
              production recommendation queue.
            </p>
          </div>
        </div>

        <aside className="min-w-0 space-y-3 sm:space-y-4" data-overview-aside="true">
          <div
            className="rounded-[1.5rem] border border-zinc-200 bg-zinc-50/80 p-4 sm:rounded-[1.75rem] sm:p-5 lg:p-6"
            data-overview-data-health="true"
          >
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-zinc-500 sm:text-[0.7rem]">
              Data health
            </p>
            <div className="mt-2.5 flex items-start gap-3 sm:mt-3">
              <span
                className={cn(
                  "mt-1 inline-flex size-2.5 shrink-0 rounded-full",
                  healthDotClass(presentation.freshness.kind),
                )}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <h2 className="text-base font-semibold tracking-[-0.03em] text-zinc-950 sm:text-lg">
                  {presentation.dataHealthLabel}
                </h2>
                <p className="mt-1 text-sm leading-6 text-zinc-600">
                  {presentation.dataHealthDetail}
                </p>
                <p
                  className="mt-2 text-sm font-medium leading-6 text-zinc-800"
                  data-overview-data-health-next="true"
                >
                  Next: {presentation.dataHealthNextAction}
                </p>
              </div>
            </div>

            <dl className="mt-4 grid gap-2 sm:mt-5 sm:gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <HealthRow
                label="Source"
                value={presentation.sourceLabel}
                hint={presentation.sourceDetail}
              />
              <HealthRow label="Freshness" value={presentation.freshnessLabel} />
              <HealthRow
                label="Store-local as-of"
                value={presentation.asOfLabel}
              />
              <HealthRow
                label="Last observation"
                value={presentation.lastObservationLabel}
              />
              <HealthRow label="Planning" value={presentation.planningLabel} />
            </dl>
          </div>

          <p
            className="px-1 text-xs leading-5 text-zinc-500"
            data-overview-tenant-meta="true"
          >
            <ShieldCheck
              className="mr-1 inline size-3.5 align-text-top text-zinc-400"
              aria-hidden="true"
            />
            Organization secured · tenant boundary details in Settings.
          </p>
        </aside>
      </section>

      <style>{`
        @keyframes sa-overview-fade {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes sa-overview-rise {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .sa-overview-root [style*="animation-delay"] {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}

function SignalGlyph({
  tone,
  active,
  unavailable,
}: {
  tone: OverviewAttentionSignalTone;
  active: boolean;
  unavailable?: boolean;
}) {
  if (unavailable) {
    return <CircleDashed className="size-3.5 shrink-0 text-zinc-400 sm:size-4" aria-hidden="true" />;
  }
  if (!active) {
    return <CircleDashed className="size-3.5 shrink-0 text-zinc-300 sm:size-4" aria-hidden="true" />;
  }
  if (tone === "uncertain") {
    return <CircleDashed className="size-3.5 shrink-0 sm:size-4" aria-hidden="true" />;
  }
  return <CircleAlert className="size-3.5 shrink-0 sm:size-4" aria-hidden="true" />;
}

type OverviewAttentionSignalTone =
  MerchantOverviewPresentation["signals"][number]["tone"];

function toneClasses(tone: OverviewAttentionSignalTone): string {
  switch (tone) {
    case "critical":
      return "border-rose-200 bg-rose-50 text-rose-950 hover:border-rose-300";
    case "attention":
      return "border-amber-200 bg-amber-50 text-amber-950 hover:border-amber-300";
    case "review":
      return "border-sky-200 bg-sky-50 text-sky-950 hover:border-sky-300";
    case "uncertain":
      return "border-zinc-200 bg-zinc-50 text-zinc-800 hover:border-zinc-300";
  }
}

function healthDotClass(
  kind: MerchantOverviewPresentation["freshness"]["kind"],
): string {
  switch (kind) {
    case "ready":
      return "bg-emerald-600";
    case "activate_metrics":
    case "missing_current_day_stock":
      return "bg-amber-500";
    default:
      return "bg-zinc-400";
  }
}

function HealthRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-zinc-200/80 bg-white px-3 py-2 sm:py-2.5">
      <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-zinc-500">
        {label}
      </dt>
      <dd className="mt-0.5 truncate font-medium text-zinc-950 sm:mt-1" title={hint ?? value}>
        {value}
      </dd>
    </div>
  );
}
