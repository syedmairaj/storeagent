"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  AlertCircle,
  CircleDashed,
  Clock3,
  HelpCircle,
  PackageX,
} from "lucide-react";

import { SkuIntelligenceInspector } from "@/components/inventory/sku-intelligence-inspector";
import {
  HIGH_COVER_REVIEW_DAYS,
  isLimitedHistoryEvidence,
  LOW_COVER_ATTENTION_DAYS,
  summarizeMerchantAttention,
} from "@/lib/inventory-intelligence/attention";
import {
  inventoryFilterPath,
  resolveInspectorSelectionAfterFilter,
  resolveInventoryFilterFromSearch,
} from "@/lib/inventory-intelligence/filter-navigation";
import {
  filterIntelligenceRows,
} from "@/lib/inventory-intelligence/prioritize";
import {
  presentSkuAttention,
  type SkuAttentionPresentation,
} from "@/lib/inventory-intelligence/sku-attention-presentation";
import type {
  InventoryIntelligenceFilter,
  MerchantInventoryIntelligenceRow,
} from "@/lib/inventory-intelligence/types";
import type { MerchantPlanningInputs } from "@/lib/planning-inputs/types";
import { cn } from "@/lib/utils";

type FilterCountKey =
  | "all"
  | "needs_attention"
  | "out_of_stock"
  | "low_cover"
  | "high_cover_review"
  | "limited_history"
  | "pending_or_stale"
  | "unknown_or_missing"
  | "zero_demand"
  | "valid_cover"
  | "limited_or_unknown";

type FilterChip = {
  id: InventoryIntelligenceFilter;
  label: string;
  countKey: FilterCountKey;
};

/** Operational stock signals — OOS + low cover (needs_attention membership). */
function stockFilters(stale: boolean): FilterChip[] {
  return [
    { id: "all", label: "All", countKey: "all" },
    {
      id: "needs_attention",
      label: "Products to review",
      countKey: "needs_attention",
    },
    {
      id: "out_of_stock",
      label: stale ? "Last recorded OOS" : "Stock issues",
      countKey: "out_of_stock",
    },
    { id: "low_cover", label: "Review low cover", countKey: "low_cover" },
    {
      id: "high_cover_review",
      label: "Review high cover",
      countKey: "high_cover_review",
    },
  ];
}

/** Data-quality / evidence filters — may overlap stock signals on the same SKU. */
const EVIDENCE_FILTERS: FilterChip[] = [
  { id: "pending_or_stale", label: "Stale / pending", countKey: "pending_or_stale" },
  {
    id: "limited_history",
    label: "Limited sales history",
    countKey: "limited_history",
  },
  { id: "zero_demand", label: "No sales observed", countKey: "zero_demand" },
  {
    id: "unknown_or_missing",
    label: "Demand unavailable",
    countKey: "unknown_or_missing",
  },
  {
    id: "valid_cover",
    label: "Stock cover available",
    countKey: "valid_cover",
  },
  {
    id: "limited_or_unknown",
    label: "All data gaps",
    countKey: "limited_or_unknown",
  },
];

export function InventoryIntelligenceWorkspace({
  rows,
  initialFilter = "all",
  stockObservationsStale = false,
  sourceLabel,
  asOfLabel,
  planning = null,
  commerceAgentVisible = false,
}: {
  rows: readonly MerchantInventoryIntelligenceRow[];
  /** Deep-link from Overview attention signals. */
  initialFilter?: InventoryIntelligenceFilter;
  /**
   * When true, known-zero available is labeled last-recorded — never live OOS.
   * Assessed dynamically from readiness / place freshness.
   */
  stockObservationsStale?: boolean;
  sourceLabel?: string;
  asOfLabel?: string | null;
  /** Persisted org planning days for SKU inspector threshold impact (UX-INV-1c). */
  planning?: MerchantPlanningInputs | null;
  /** Server-resolved commerce-agent soft-enable ∧ allowlist (default hidden). */
  commerceAgentVisible?: boolean;
  /** @deprecated Pending copy lives on readiness freshness; kept optional for callers. */
  hasPendingMetricWork?: boolean;
}) {
  const pathname = usePathname();
  const [selectedGrainKey, setSelectedGrainKey] = useState<string | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  // One authoritative client filter. Seeded from the server URL (initialFilter).
  // Chip clicks update this state immediately and sync the address bar with
  // history.pushState — no App Router soft-nav / RSC remount / Suspense flash.
  const [filter, setFilterState] =
    useState<InventoryIntelligenceFilter>(initialFilter);

  useEffect(() => {
    const onPopState = () => {
      setFilterState(
        resolveInventoryFilterFromSearch(window.location.search, "all"),
      );
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const attentionContext = useMemo(
    () => ({ stockObservationsStale }),
    [stockObservationsStale],
  );

  const openInspector = useCallback(
    (grainKey: string, trigger: HTMLElement | null) => {
      returnFocusRef.current = trigger;
      setSelectedGrainKey(grainKey);
    },
    [],
  );

  const filterCounts = useMemo(() => {
    const attention = summarizeMerchantAttention(rows);
    return {
      all: rows.length,
      needs_attention: filterIntelligenceRows(rows, "needs_attention").length,
      out_of_stock: attention.lastRecordedOutOfStockCount,
      low_cover:
        attention.coverSignalEvaluation === "evaluated"
          ? attention.lowCoverCount
          : filterIntelligenceRows(rows, "low_cover").length,
      high_cover_review:
        attention.coverSignalEvaluation === "evaluated"
          ? attention.highCoverReviewCount
          : filterIntelligenceRows(rows, "high_cover_review").length,
      limited_history: attention.limitedHistoryCount,
      pending_or_stale: attention.staleOrPendingCount,
      unknown_or_missing: attention.unknownDemandCount,
      zero_demand: attention.knownZeroDemandCount,
      valid_cover: attention.calculableCoverCount,
      limited_or_unknown: attention.limitedOrUnknownEvidenceCount,
    } as const;
  }, [rows]);

  const visible = useMemo(
    () => filterIntelligenceRows(rows, filter),
    [rows, filter],
  );

  // Derived close: never show a SKU outside the current result set (filter /
  // Back-Forward). Keeps Dialog open prop honest without an effect.
  const selectedRow = useMemo(() => {
    const grainKey = resolveInspectorSelectionAfterFilter(
      selectedGrainKey,
      visible.map((row) => row.grainKey),
    );
    if (!grainKey) {
      return null;
    }
    return rows.find((row) => row.grainKey === grainKey) ?? null;
  }, [rows, selectedGrainKey, visible]);

  const setFilter = useCallback(
    (next: InventoryIntelligenceFilter) => {
      if (next === filter) {
        return;
      }
      // Immediate UI update — last click wins under rapid switching.
      setFilterState(next);
      const nextVisible = filterIntelligenceRows(rows, next);
      setSelectedGrainKey((current) =>
        resolveInspectorSelectionAfterFilter(
          current,
          nextVisible.map((row) => row.grainKey),
        ),
      );
      const href = inventoryFilterPath(
        pathname,
        typeof window !== "undefined" ? window.location.search : "",
        next,
      );
      // History sync without Next soft-navigation (avoids RSC + Suspense flicker).
      // Overview deep links still use inventoryFilterHref + #inventory-evidence.
      window.history.pushState(window.history.state, "", href);
    },
    [filter, pathname, rows],
  );
  const storeCount = useMemo(
    () => new Set(rows.map((row) => row.storeId)).size,
    [rows],
  );
  const locationCount = useMemo(
    () => new Set(rows.map((row) => `${row.storeId}:${row.locationId}`)).size,
    [rows],
  );

  const staleOrPendingVisible = useMemo(
    () =>
      visible.some(
        (row) =>
          row.coverStatus === "stale" || row.coverStatus === "pending_freshness",
      ),
    [visible],
  );

  const limitedHistoryEverywhere = useMemo(
    () =>
      visible.length > 0 &&
      visible.every((row) => isLimitedHistoryEvidence(row)),
    [visible],
  );

  const historicalMetricsVisible = useMemo(
    () =>
      visible.some(
        (row) =>
          row.coverStatus === "stale" || row.coverStatus === "pending_freshness",
      ),
    [visible],
  );

  if (rows.length === 0) {
    return null;
  }

  const scopeBits: string[] = [];
  if (sourceLabel) {
    scopeBits.push(sourceLabel);
  }
  if (asOfLabel) {
    scopeBits.push(`as-of ${asOfLabel}`);
  }
  if (storeCount > 1 || locationCount > 1) {
    scopeBits.push(`${storeCount} store(s) · ${locationCount} location(s)`);
  }

  return (
    <div
      className="space-y-5 sm:space-y-6"
      data-inventory-sku-attention="true"
      data-stock-observations-stale={stockObservationsStale ? "true" : "false"}
      data-decision-eligibility="unauthorized"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-[-0.03em] text-zinc-950 sm:text-xl">
            SKU evidence
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-zinc-600">
            Open a product inspector for stock, sales history, and cover.
            Unknown ≠ zero.
            {scopeBits.length > 0 ? ` ${scopeBits.join(" · ")}.` : null}
          </p>
          <p
            className="mt-2 text-xs leading-5 text-zinc-500"
            data-decision-eligibility-fence="true"
          >
            No reorder recommendations here — commercial actions stay
            unauthorized.
          </p>
        </div>
        <p
          className="shrink-0 text-xs font-medium tabular-nums text-zinc-500"
          data-inventory-visible-count="true"
        >
          {visible.length} of {rows.length} positions
        </p>
      </div>

      {filter !== "all" ? (
        <p
          className="text-sm font-medium text-zinc-600"
          data-inventory-filter-notice="true"
        >
          Showing filtered Inventory evidence. Readiness and replenishment
          settings stay below.
        </p>
      ) : null}

      {stockObservationsStale || staleOrPendingVisible ? (
        <div
          className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950"
          role="status"
          data-inventory-stale-banner="true"
        >
          {stockObservationsStale
            ? "Stock observations are behind store-local as-of. Zero available is last recorded — not live out of stock. Cover stays unavailable until same-day stock aligns."
            : "Cover is unavailable while metrics are pending or behind store-local as-of. Zero available below is last recorded — not live."}
        </div>
      ) : null}

      {historicalMetricsVisible ? (
        <div
          className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm leading-6 text-zinc-700"
          role="status"
          data-inventory-historical-metrics-banner="true"
        >
          Historical sales rates may still appear for visible positions. Exact
          metric dates stay in the product inspector — row cells do not repeat
          “not current demand.”
        </div>
      ) : null}

      {limitedHistoryEverywhere ? (
        <div
          className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm leading-6 text-zinc-700"
          role="status"
          data-inventory-limited-history-banner="true"
        >
          Every visible position has limited sales history (sparse eligible
          days). Not forecast confidence — open Inspect for exact day counts.
        </div>
      ) : null}

      <div className="space-y-3" data-inventory-filter-toolbar="true">
        <div
          className="flex flex-wrap gap-2"
          role="toolbar"
          aria-label="Stock review filters"
          data-filter-group="stock"
        >
          {stockFilters(stockObservationsStale).map((item) => {
            const count = filterCounts[item.countKey];
            if (
              item.id !== "all" &&
              item.id !== filter &&
              count === 0
            ) {
              return null;
            }
            return (
              <FilterButton
                key={item.id}
                item={item}
                count={count}
                active={filter === item.id}
                onSelect={setFilter}
              />
            );
          })}
        </div>
        <div
          className="flex flex-wrap gap-2"
          role="toolbar"
          aria-label="Evidence and data-quality filters"
          data-filter-group="evidence"
        >
          {EVIDENCE_FILTERS.map((item) => {
            const count = filterCounts[item.countKey];
            if (item.id !== filter && count === 0) {
              return null;
            }
            return (
              <FilterButton
                key={item.id}
                item={item}
                count={count}
                active={filter === item.id}
                onSelect={setFilter}
              />
            );
          })}
        </div>
        <p className="text-[0.7rem] leading-5 text-zinc-500">
          Products to review = stock issues + low cover (&lt;
          {LOW_COVER_ATTENTION_DAYS}d). Evidence filters are separate; the same
          SKU can appear in both. High cover ≥{HIGH_COVER_REVIEW_DAYS}d is a
          review heuristic — not overstock or ROP. Zero-count chips stay hidden.
        </p>
      </div>

      {/* Mobile / narrow: stacked evidence cards */}
      <ul
        className="space-y-3 md:hidden"
        data-responsive-inventory-cards="true"
        aria-label="SKU attention cards"
      >
        {visible.length === 0 ? (
          <li className="rounded-2xl border border-zinc-200 bg-white px-4 py-8 text-center text-sm text-zinc-500">
            No positions match this filter.
          </li>
        ) : (
          visible.map((row) => {
            const presentation = presentSkuAttention(row, attentionContext);
            return (
              <li
                key={row.grainKey}
                className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
                data-sku-attention-card="true"
                data-stock-condition={presentation.stockCondition}
                data-cover-availability={presentation.coverAvailability}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-zinc-950">{row.sku}</div>
                    <div className="mt-0.5 truncate text-xs text-zinc-500">
                      {row.productTitle ?? "Untitled product"}
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {row.storeName} · {row.locationName}
                    </div>
                  </div>
                  <AvailableBadge row={row} stale={stockObservationsStale} />
                </div>
                <div className="mt-3 space-y-2">
                  <ConditionBlock presentation={presentation} />
                  <div className="flex items-start justify-between gap-3">
                    <VelocityCell
                      row={row}
                      suppressLimitedChip={limitedHistoryEverywhere}
                      suppressHistoricalChip={historicalMetricsVisible}
                    />
                    <CoverCell row={row} presentation={presentation} />
                  </div>
                  <InspectButton
                    grainKey={row.grainKey}
                    sku={row.sku}
                    onOpen={openInspector}
                  />
                </div>
              </li>
            );
          })
        )}
      </ul>

      {/* md+: table with sticky identity */}
      <div
        className="hidden overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm [-webkit-overflow-scrolling:touch] md:block"
        data-responsive-inventory-table="true"
      >
        <table className="min-w-[44rem] w-full text-left text-sm lg:min-w-full">
          <thead className="bg-zinc-50 text-[0.65rem] uppercase tracking-[0.12em] text-zinc-500">
            <tr>
              <th className="sticky left-0 z-10 bg-zinc-50 px-3 py-3 sm:px-4">
                SKU / product
              </th>
              <th className="px-3 py-3 sm:px-4">Place</th>
              <th className="px-3 py-3 sm:px-4">Available</th>
              <th className="px-3 py-3 sm:px-4">Velocity</th>
              <th className="px-3 py-3 sm:px-4">Cover</th>
              <th className="px-3 py-3 sm:px-4">Stock condition</th>
              <th className="px-3 py-3 sm:px-4">
                <span className="sr-only">Inspect</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-8 text-center text-sm text-zinc-500"
                >
                  No positions match this filter.
                </td>
              </tr>
            ) : (
              visible.map((row) => {
                const presentation = presentSkuAttention(row, attentionContext);
                return (
                  <tr
                    key={row.grainKey}
                    className="border-t border-zinc-100"
                    data-stock-condition={presentation.stockCondition}
                    data-cover-availability={presentation.coverAvailability}
                    data-decision-eligibility="unauthorized"
                  >
                    <td className="sticky left-0 z-10 bg-white px-3 py-3.5 align-top sm:px-4">
                      <div className="font-medium text-zinc-950">{row.sku}</div>
                      <div className="mt-0.5 text-xs text-zinc-500">
                        {row.productTitle ?? "Untitled product"}
                      </div>
                    </td>
                    <td className="px-3 py-3.5 align-top text-zinc-700 sm:px-4">
                      <div>{row.storeName}</div>
                      <div className="mt-0.5 text-xs text-zinc-500">
                        {row.locationName}
                      </div>
                    </td>
                    <td className="px-3 py-3.5 align-top tabular-nums sm:px-4">
                      <AvailableCell
                        row={row}
                        stale={stockObservationsStale}
                      />
                    </td>
                    <td className="px-3 py-3.5 align-top sm:px-4">
                      <VelocityCell
                        row={row}
                        suppressLimitedChip={limitedHistoryEverywhere}
                        suppressHistoricalChip={historicalMetricsVisible}
                      />
                    </td>
                    <td className="px-3 py-3.5 align-top sm:px-4">
                      <CoverCell
                        row={row}
                        presentation={presentation}
                      />
                    </td>
                    <td className="px-3 py-3.5 align-top sm:px-4">
                      <div className="flex items-start gap-2">
                        <StockConditionIcon
                          tone={presentation.stockTone}
                          condition={presentation.stockCondition}
                        />
                        <div className="min-w-0">
                          <div
                            className={cn(
                              "text-xs font-semibold tracking-[-0.01em]",
                              stockToneTextClass(presentation.stockTone),
                            )}
                            data-stock-condition-label="true"
                          >
                            {presentation.stockConditionLabel}
                          </div>
                          <div
                            className="mt-0.5 text-[0.65rem] leading-4 text-zinc-500"
                            data-cover-availability-label="true"
                          >
                            {presentation.coverAvailabilityLabel}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3.5 align-top sm:px-4">
                      <InspectButton
                        grainKey={row.grainKey}
                        sku={row.sku}
                        onOpen={openInspector}
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <SkuIntelligenceInspector
        row={selectedRow}
        open={selectedRow !== null}
        stockObservationsStale={stockObservationsStale}
        planning={planning}
        commerceAgentVisible={commerceAgentVisible}
        returnFocusRef={returnFocusRef}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedGrainKey(null);
          }
        }}
      />
    </div>
  );
}

function AvailableBadge({
  row,
  stale,
}: {
  row: MerchantInventoryIntelligenceRow;
  stale: boolean;
}) {
  if (row.availableQuantity === null) {
    return (
      <span className="shrink-0 rounded-md bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-500">
        Unknown
      </span>
    );
  }
  const isZero = row.availableQuantity === 0;
  return (
    <span
      className={cn(
        "shrink-0 rounded-md px-2 py-1 text-xs font-semibold tabular-nums",
        isZero
          ? "bg-rose-50 text-rose-900 ring-1 ring-rose-200"
          : "bg-zinc-100 text-zinc-800",
      )}
    >
      {isZero
        ? stale
          ? "Last recorded 0"
          : "0"
        : row.availableQuantity}
    </span>
  );
}

function AvailableCell({
  row,
  stale,
}: {
  row: MerchantInventoryIntelligenceRow;
  stale: boolean;
}) {
  if (row.availableQuantity === null) {
    return (
      <div>
        <span className="text-zinc-400">Unknown</span>
        <div className="mt-0.5 text-[0.65rem] text-zinc-400">
          Not treated as zero
        </div>
      </div>
    );
  }

  const isZero = row.availableQuantity === 0;
  return (
    <div>
      <div
        className={cn(
          "font-semibold tabular-nums",
          isZero ? "text-rose-900" : "text-zinc-950",
        )}
      >
        {row.availableQuantity}
      </div>
      <div className="mt-0.5 text-[0.65rem] text-zinc-400">
        {isZero
          ? stale
            ? `Last recorded ${formatObserved(row.observedAt)} · not live`
            : `Observed ${formatObserved(row.observedAt)}`
          : formatObserved(row.observedAt)}
      </div>
    </div>
  );
}

function ConditionBlock({
  presentation,
}: {
  presentation: SkuAttentionPresentation;
}) {
  return (
    <div className="rounded-xl bg-zinc-50 px-3 py-2.5">
      <div className="flex items-start gap-2">
        <StockConditionIcon
          tone={presentation.stockTone}
          condition={presentation.stockCondition}
        />
        <div className="min-w-0">
          <div
            className={cn(
              "text-xs font-semibold",
              stockToneTextClass(presentation.stockTone),
            )}
            data-stock-condition-label="true"
          >
            {presentation.stockConditionLabel}
          </div>
          <div
            className="mt-0.5 text-[0.65rem] leading-4 text-zinc-500"
            data-cover-availability-label="true"
          >
            {presentation.coverAvailabilityLabel}
          </div>
        </div>
      </div>
    </div>
  );
}

function InspectButton({
  grainKey,
  sku,
  onOpen,
}: {
  grainKey: string;
  sku: string;
  onOpen: (grainKey: string, trigger: HTMLElement | null) => void;
}) {
  return (
    <button
      type="button"
      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-zinc-200 bg-white px-3.5 text-xs font-medium text-zinc-700 outline-none transition-[border-color,background-color,color] hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-950 focus:outline-none focus-visible:border-zinc-400 focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2"
      data-sku-inspect={grainKey}
      aria-haspopup="dialog"
      aria-label={`Inspect ${sku}`}
      onClick={(event) => onOpen(grainKey, event.currentTarget)}
    >
      Inspect
    </button>
  );
}

function FilterButton({
  item,
  count,
  active,
  onSelect,
}: {
  item: FilterChip;
  count: number;
  active: boolean;
  onSelect: (id: InventoryIntelligenceFilter) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      aria-pressed={active}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950 motion-safe:transition-[background-color,border-color,color] motion-safe:duration-200",
        active
          ? "border-zinc-950 bg-zinc-950 text-white"
          : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300",
      )}
    >
      <span>{item.label}</span>
      <span
        className={cn(
          "tabular-nums",
          active ? "text-zinc-300" : "text-zinc-400",
        )}
        data-filter-count={item.id}
      >
        {count}
      </span>
    </button>
  );
}

function VelocityCell({
  row,
  suppressLimitedChip = false,
  suppressHistoricalChip = false,
}: {
  row: MerchantInventoryIntelligenceRow;
  suppressLimitedChip?: boolean;
  /** When a section-level historical banner is shown, keep row cells compact. */
  suppressHistoricalChip?: boolean;
}) {
  const limited = isLimitedHistoryEvidence(row);
  const showHistoryChip =
    !suppressLimitedChip &&
    limited &&
    (row.eligibleDays30d !== null || row.coverStatus === "short_history");
  const metricIsNotCurrent =
    row.coverStatus === "stale" || row.coverStatus === "pending_freshness";

  // Known-zero demand only when cover classification says so — never infer
  // current "No sales observed" from a stale historical velocity of 0.
  if (row.coverStatus === "zero_demand") {
    return (
      <div>
        <div className="font-medium tabular-nums text-zinc-950">0 / day</div>
        <div className="mt-0.5 text-[0.65rem] text-zinc-500">
          No sales observed
        </div>
        {showHistoryChip && row.eligibleDays30d !== null ? (
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
            ? "Short history · not forecast confidence"
            : metricIsNotCurrent
              ? "Not current · not treated as zero"
              : "Not treated as zero"}
        </div>
        {showHistoryChip && row.eligibleDays30d !== null ? (
          <LimitedHistoryBadge
            days={row.eligibleDays30d}
            emphasize={limited || row.coverStatus === "short_history"}
          />
        ) : showHistoryChip && row.coverStatus === "short_history" ? (
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
      {metricIsNotCurrent && !suppressHistoricalChip ? (
        <div className="mt-0.5 text-[0.65rem] text-amber-800">
          Historical · not current demand
        </div>
      ) : null}
      {showHistoryChip && row.eligibleDays30d !== null ? (
        <LimitedHistoryBadge days={row.eligibleDays30d} emphasize={limited} />
      ) : null}
      {row.metricDate && !suppressHistoricalChip ? (
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

function CoverCell({
  row,
  presentation,
}: {
  row: MerchantInventoryIntelligenceRow;
  presentation: SkuAttentionPresentation;
}) {
  if (presentation.coverAvailability === "calculable" && row.daysOfStock !== null) {
    return (
      <div>
        <div className="font-semibold tabular-nums tracking-[-0.02em] text-zinc-950">
          {formatDays(row.daysOfStock)}
          <span className="ml-1 text-xs font-medium text-zinc-500">days</span>
        </div>
        <div className="mt-0.5 text-[0.65rem] text-zinc-500">
          Stock cover available
        </div>
      </div>
    );
  }

  return (
    <div className="text-sm font-medium text-zinc-500">
      Unavailable
      <div className="mt-0.5 text-[0.65rem] font-normal text-zinc-400">
        {presentation.coverAvailabilityLabel.replace(/^Cover unavailable · /, "")}
      </div>
    </div>
  );
}

function StockConditionIcon({
  tone,
  condition,
}: {
  tone: SkuAttentionPresentation["stockTone"];
  condition: SkuAttentionPresentation["stockCondition"];
}) {
  const className = "mt-0.5 size-3.5 shrink-0";
  if (
    condition === "out_of_stock" ||
    condition === "last_recorded_out_of_stock"
  ) {
    return <PackageX className={cn(className, "text-rose-700")} aria-hidden="true" />;
  }
  switch (tone) {
    case "attention":
      return <AlertCircle className={cn(className, "text-amber-600")} aria-hidden="true" />;
    case "review":
      return <Clock3 className={cn(className, "text-zinc-500")} aria-hidden="true" />;
    case "uncertain":
      return <HelpCircle className={cn(className, "text-zinc-400")} aria-hidden="true" />;
    case "critical":
      return <PackageX className={cn(className, "text-rose-700")} aria-hidden="true" />;
    default:
      return <CircleDashed className={cn(className, "text-zinc-400")} aria-hidden="true" />;
  }
}

function stockToneTextClass(
  tone: SkuAttentionPresentation["stockTone"],
): string {
  switch (tone) {
    case "critical":
      return "text-rose-900";
    case "attention":
      return "text-amber-900";
    case "review":
      return "text-zinc-700";
    case "uncertain":
      return "text-zinc-600";
    default:
      return "text-zinc-700";
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
