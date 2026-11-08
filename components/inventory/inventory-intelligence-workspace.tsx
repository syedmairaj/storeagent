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
  hasPendingMetricWork,
}: {
  rows: readonly MerchantInventoryIntelligenceRow[];
  hasPendingMetricWork: boolean;
}) {
  const [filter, setFilter] = useState<InventoryIntelligenceFilter>("all");

  const visible = useMemo(
    () => filterIntelligenceRows(rows, filter),
    [rows, filter],
  );

  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 max-w-2xl">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Inventory intelligence
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-zinc-950 sm:text-2xl">
            SKU demand and cover
          </h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            Uses your latest stock observations with current demand metrics for
            the same store and location. Unknown demand is never shown as zero.
            No reorder recommendations are generated here.
          </p>
          {hasPendingMetricWork ? (
            <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950">
              Demand metrics are still updating. Cover stays blocked until
              current metrics finish.
            </p>
          ) : null}
        </div>
        <p className="text-xs font-medium tabular-nums text-zinc-500">
          {visible.length} of {rows.length} positions
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
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

      <div className="overflow-x-auto rounded-3xl border border-zinc-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-zinc-50 text-[0.65rem] uppercase tracking-[0.12em] text-zinc-500">
            <tr>
              <th className="px-4 py-3 sm:px-5">SKU / product</th>
              <th className="px-4 py-3 sm:px-5">Place</th>
              <th className="px-4 py-3 sm:px-5">Available</th>
              <th className="px-4 py-3 sm:px-5">Velocity</th>
              <th className="px-4 py-3 sm:px-5">Cover</th>
              <th className="px-4 py-3 sm:px-5">Evidence</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-5 py-10 text-center text-sm text-zinc-500"
                >
                  No positions match this filter.
                </td>
              </tr>
            ) : (
              visible.map((row) => (
                <tr key={row.grainKey} className="border-t border-zinc-100">
                  <td className="px-4 py-4 align-top sm:px-5">
                    <div className="font-medium text-zinc-950">{row.sku}</div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {row.productTitle ?? "Untitled product"}
                    </div>
                  </td>
                  <td className="px-4 py-4 align-top text-zinc-700 sm:px-5">
                    <div>{row.storeName}</div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {row.locationName}
                    </div>
                  </td>
                  <td className="px-4 py-4 align-top tabular-nums sm:px-5">
                    {row.availableQuantity === null ? (
                      <span className="text-zinc-400">Unknown</span>
                    ) : (
                      row.availableQuantity
                    )}
                    <div className="mt-1 text-[0.65rem] text-zinc-400">
                      Observed {formatObserved(row.observedAt)}
                    </div>
                  </td>
                  <td className="px-4 py-4 align-top sm:px-5">
                    <VelocityCell row={row} />
                  </td>
                  <td className="px-4 py-4 align-top sm:px-5">
                    <CoverCell row={row} />
                  </td>
                  <td className="px-4 py-4 align-top sm:px-5">
                    <div className="flex items-start gap-2">
                      <StatusIcon status={row.coverStatus} />
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.1em] text-zinc-500">
                          {statusLabel(row.coverStatus)}
                        </div>
                        <p className="mt-1 max-w-[16rem] text-xs leading-5 text-zinc-600">
                          {row.evidenceLabel}
                        </p>
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

function VelocityCell({ row }: { row: MerchantInventoryIntelligenceRow }) {
  if (row.coverStatus === "zero_demand" || row.salesVelocity30d === 0) {
    return (
      <div>
        <div className="font-medium tabular-nums text-zinc-950">0 / day</div>
        <div className="mt-1 text-[0.65rem] text-zinc-500">
          No sales observed
          {row.eligibleDays30d !== null
            ? ` · ${historyLabel(row.eligibleDays30d)}`
            : ""}
        </div>
      </div>
    );
  }

  if (row.salesVelocity30d === null) {
    return (
      <div>
        <div className="font-medium text-zinc-400">Unknown</div>
        <div className="mt-1 text-[0.65rem] text-zinc-500">
          {row.coverStatus === "short_history"
            ? row.eligibleDays30d === null
              ? "Limited history"
              : historyLabel(row.eligibleDays30d)
            : "Not treated as zero"}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="font-medium tabular-nums text-zinc-950">
        {formatVelocity(row.salesVelocity30d)} / day
      </div>
      <div className="mt-1 text-[0.65rem] text-zinc-500">
        {row.eligibleDays30d !== null ? historyLabel(row.eligibleDays30d) : ""}
        {row.metricDate ? ` · as of ${row.metricDate}` : ""}
      </div>
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
      Stock cover unavailable
    </div>
  );
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

function historyLabel(eligibleDays30d: number): string {
  if (eligibleDays30d < 7) {
    return `Limited history: ${eligibleDays30d} of 30 days`;
  }
  return `${eligibleDays30d} of 30 eligible days`;
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
    });
  } catch {
    return "—";
  }
}
