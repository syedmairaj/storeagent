"use client";

import { useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  CircleDashed,
  Clock3,
  HelpCircle,
} from "lucide-react";

import {
  filterIntelligenceRows,
} from "@/lib/inventory-intelligence/prioritize";
import type {
  InventoryCoverStatus,
  InventoryIntelligenceFilter,
  MerchantInventoryIntelligenceRow,
} from "@/lib/inventory-intelligence/types";
import { cn } from "@/lib/utils";

const FILTERS: { id: InventoryIntelligenceFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "needs_attention", label: "Needs attention" },
  { id: "valid_cover", label: "Known cover" },
  { id: "pending_or_stale", label: "Pending / stale" },
  { id: "unknown_or_missing", label: "Unknown demand" },
  { id: "zero_demand", label: "Zero demand" },
];

export function InventoryIntelligenceWorkspace({
  rows,
}: {
  rows: readonly MerchantInventoryIntelligenceRow[];
  /** @deprecated Pending copy lives on readiness freshness; kept optional for callers. */
  hasPendingMetricWork?: boolean;
}) {
  const [filter, setFilter] = useState<InventoryIntelligenceFilter>("all");

  const visible = useMemo(
    () => filterIntelligenceRows(rows, filter),
    [rows, filter],
  );

  const storeCount = useMemo(
    () => new Set(rows.map((row) => row.storeId)).size,
    [rows],
  );
  const locationCount = useMemo(
    () => new Set(rows.map((row) => `${row.storeId}:${row.locationId}`)).size,
    [rows],
  );

  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-[-0.03em] text-zinc-950 sm:text-xl">
            SKU demand and cover
          </h2>
          <p className="mt-1 text-sm leading-6 text-zinc-600">
            Latest imported stock with matching demand metrics. Unknown ≠ zero.
            No reorder recommendations are generated here.
            {storeCount > 1 || locationCount > 1
              ? ` Showing ${storeCount} store(s) · ${locationCount} location(s).`
              : null}
          </p>
        </div>
        <p className="text-xs font-medium tabular-nums text-zinc-500">
          {visible.length} of {rows.length} positions
        </p>
      </div>

      <div
        className="flex flex-wrap gap-2"
        role="toolbar"
        aria-label="Filter inventory positions"
      >
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            aria-pressed={filter === item.id}
            className={cn(
              "inline-flex min-h-9 items-center rounded-full border px-3 text-xs font-medium transition-colors",
              filter === item.id
                ? "border-zinc-950 bg-zinc-950 text-white"
                : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div
        className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm [-webkit-overflow-scrolling:touch]"
        data-responsive-inventory-table="true"
      >
        <table className="min-w-[40rem] w-full text-left text-sm md:min-w-full">
          <thead className="bg-zinc-50 text-[0.65rem] uppercase tracking-[0.12em] text-zinc-500">
            <tr>
              <th className="px-3 py-2.5 sm:px-4">SKU / product</th>
              <th className="px-3 py-2.5 sm:px-4">Place</th>
              <th className="px-3 py-2.5 sm:px-4">Available</th>
              <th className="px-3 py-2.5 sm:px-4">Velocity</th>
              <th className="px-3 py-2.5 sm:px-4">Cover</th>
              <th className="hidden px-3 py-2.5 lg:table-cell lg:px-4">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-sm text-zinc-500"
                >
                  No positions match this filter.
                </td>
              </tr>
            ) : (
              visible.map((row) => (
                <tr key={row.grainKey} className="border-t border-zinc-100">
                  <td className="px-3 py-3 align-top sm:px-4">
                    <div className="font-medium text-zinc-950">{row.sku}</div>
                    <div className="mt-0.5 text-xs text-zinc-500">
                      {row.productTitle ?? "Untitled product"}
                    </div>
                    <div className="mt-1 space-y-1 text-[0.65rem] text-zinc-400 lg:hidden">
                      <div>
                        {statusLabel(row.coverStatus)}
                        {isLimitedHistory(row) ? " · Limited history" : ""}
                      </div>
                      <details data-mobile-evidence="true">
                        <summary className="cursor-pointer text-zinc-500 underline-offset-2 hover:underline">
                          Evidence
                        </summary>
                        <p className="mt-1 leading-5 text-zinc-600">
                          {row.evidenceLabel}
                        </p>
                      </details>
                    </div>
                  </td>
                  <td className="px-3 py-3 align-top text-zinc-700 sm:px-4">
                    <div>{row.storeName}</div>
                    <div className="mt-0.5 text-xs text-zinc-500">
                      {row.locationName}
                    </div>
                  </td>
                  <td className="px-3 py-3 align-top tabular-nums sm:px-4">
                    {row.availableQuantity === null ? (
                      <span className="text-zinc-400">Unknown</span>
                    ) : (
                      row.availableQuantity
                    )}
                    <div className="mt-0.5 text-[0.65rem] text-zinc-400">
                      {formatObserved(row.observedAt)}
                    </div>
                  </td>
                  <td className="px-3 py-3 align-top sm:px-4">
                    <VelocityCell row={row} />
                  </td>
                  <td className="px-3 py-3 align-top sm:px-4">
                    <CoverCell row={row} />
                  </td>
                  <td className="hidden px-3 py-3 align-top lg:table-cell lg:px-4">
                    <div className="flex items-start gap-2">
                      <StatusIcon status={row.coverStatus} />
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-500">
                          {statusLabel(row.coverStatus)}
                        </div>
                        <details className="mt-1 max-w-[14rem]">
                          <summary className="cursor-pointer text-xs text-zinc-500 underline-offset-2 hover:underline">
                            Evidence
                          </summary>
                          <p className="mt-1 text-xs leading-5 text-zinc-600">
                            {row.evidenceLabel}
                          </p>
                        </details>
                      </div>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function isLimitedHistory(row: MerchantInventoryIntelligenceRow): boolean {
  return (
    row.eligibleDays30d !== null &&
    row.eligibleDays30d < 7 &&
    (row.coverStatus === "valid" ||
      row.coverStatus === "zero_demand" ||
      row.coverStatus === "short_history")
  );
}

function VelocityCell({ row }: { row: MerchantInventoryIntelligenceRow }) {
  const limited = isLimitedHistory(row);

  if (row.coverStatus === "zero_demand" || row.salesVelocity30d === 0) {
    return (
      <div>
        <div className="font-medium tabular-nums text-zinc-950">0 / day</div>
        <div className="mt-0.5 text-[0.65rem] text-zinc-500">
          No sales in window
        </div>
        {row.eligibleDays30d !== null ? (
          <LimitedHistoryBadge days={row.eligibleDays30d} emphasize={limited} />
        ) : null}
      </div>
    );
  }

  if (row.salesVelocity30d === null) {
    return (
      <div>
        <div className="font-medium text-zinc-400">Unknown</div>
        <div className="mt-0.5 text-[0.65rem] text-zinc-500">
          {row.coverStatus === "short_history"
            ? "Not forecast confidence"
            : "Not treated as zero"}
        </div>
        {row.eligibleDays30d !== null ? (
          <LimitedHistoryBadge days={row.eligibleDays30d} emphasize />
        ) : row.coverStatus === "short_history" ? (
          <LimitedHistoryBadge days={null} emphasize />
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <div className="font-medium tabular-nums text-zinc-950">
        {formatVelocity(row.salesVelocity30d)} / day
      </div>
      {row.eligibleDays30d !== null ? (
        <LimitedHistoryBadge
          days={row.eligibleDays30d}
          emphasize={limited}
        />
      ) : null}
      {row.metricDate ? (
        <div className="mt-0.5 text-[0.65rem] text-zinc-400">
          Metric {row.metricDate}
          {row.asOfMetricDate && row.metricDate !== row.asOfMetricDate
            ? ` · as-of ${row.asOfMetricDate}`
            : ""}
        </div>
      ) : null}
    </div>
  );
}

function LimitedHistoryBadge({
  days,
  emphasize,
}: {
  days: number | null;
  emphasize?: boolean;
}) {
  const label =
    days === null
      ? "Limited history"
      : days < 7
        ? `Limited history · ${days}/30 eligible days`
        : `${days}/30 eligible days`;

  return (
    <div
      className={cn(
        "mt-1 inline-flex rounded-md px-1.5 py-0.5 text-[0.65rem] font-medium",
        emphasize
          ? "bg-amber-50 text-amber-900 ring-1 ring-amber-200"
          : "bg-zinc-100 text-zinc-600",
      )}
      data-limited-history={emphasize ? "true" : "false"}
      title="Eligible observation days in the 30-day velocity window — not a forecast confidence score."
    >
      {label}
    </div>
  );
}

function CoverCell({ row }: { row: MerchantInventoryIntelligenceRow }) {
  if (row.coverStatus === "valid" && row.daysOfStock !== null) {
    return (
      <div className="font-semibold tabular-nums tracking-[-0.02em] text-zinc-950">
        {formatDays(row.daysOfStock)}
        <span className="ml-1 text-xs font-medium text-zinc-500">days</span>
      </div>
    );
  }

  return (
    <div className="text-sm font-medium text-zinc-500">
      {coverUnavailableLabel(row.coverStatus)}
    </div>
  );
}

function coverUnavailableLabel(status: InventoryCoverStatus): string {
  switch (status) {
    case "zero_demand":
      return "Unavailable (zero demand)";
    case "stale":
      return "Unavailable (stale)";
    case "pending_freshness":
      return "Unavailable (pending)";
    case "unknown_stock":
      return "Unavailable (unknown stock)";
    case "short_history":
      return "Unavailable (short history)";
    case "unknown_demand":
      return "Unavailable (unknown ≠ 0)";
    case "missing_metric":
      return "Unavailable (missing metrics)";
    default:
      return "Unavailable";
  }
}

function StatusIcon({ status }: { status: InventoryCoverStatus }) {
  const className = "mt-0.5 size-3.5 shrink-0";
  switch (status) {
    case "valid":
      return <CheckCircle2 className={cn(className, "text-emerald-700")} />;
    case "pending_freshness":
    case "stale":
      return <Clock3 className={cn(className, "text-amber-600")} />;
    case "zero_demand":
      return <CircleDashed className={cn(className, "text-zinc-400")} />;
    case "short_history":
    case "unknown_demand":
    case "unknown_stock":
    case "missing_metric":
      return <HelpCircle className={cn(className, "text-zinc-400")} />;
    default:
      return <AlertCircle className={cn(className, "text-amber-600")} />;
  }
}

function statusLabel(status: InventoryCoverStatus): string {
  switch (status) {
    case "pending_freshness":
      return "Pending";
    case "unknown_stock":
      return "Unknown stock";
    case "missing_metric":
      return "Missing metrics";
    case "stale":
      return "Stale";
    case "short_history":
      return "Short history";
    case "unknown_demand":
      return "Unknown demand";
    case "zero_demand":
      return "Zero demand";
    case "valid":
      return "Known cover";
  }
}

function formatVelocity(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(2).replace(/\.?0+$/, "");
}

function formatDays(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(1);
}

function formatObserved(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}
