"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  createPortal,
} from "react-dom";

import {
  CheckCircle2,
  Filter,
  MapPin,
  Store,
  X,
} from "lucide-react";

import {
  ActionTypeChip,
  getActionTypeMeta,
} from "@/components/actions-demo/action-type-presentation";

import {
  DemoApprovalCluster,
} from "@/components/actions-demo/demo-approval-cluster";

import type {
  OrganizationMemberRole,
} from "@/lib/commerce-domain/types";

import {
  demoActionShowsRecommendedQuantity,
  type DemoActionItem,
  type DemoActionType,
  type DemoHealthySkimItem,
  type M7DecisionDemoFixtureRoot,
} from "@/lib/demo/m7-decision-demo-fixtures";

import {
  explainDemoReasonCode,
  formatDemoConfidenceLabel,
  formatDemoDataQualityScore,
  formatDemoPriorityLabel,
  formatDemoUnknownNumber,
} from "@/lib/demo/m7-decision-demo-format";

type FilterKey =
  | "ALL"
  | DemoActionType
  | "HEALTHY";

const FILTERS: {
  key: FilterKey;
  label: string;
}[] = [
  {
    key: "ALL",
    label: "All actions",
  },
  {
    key: "REORDER",
    label: "Reorder",
  },
  {
    key: "REDUCE",
    label: "Reduce",
  },
  {
    key: "PROMOTE",
    label: "Promote",
  },
  {
    key: "WATCH",
    label: "Watch",
  },
  {
    key: "HEALTHY",
    label: "Healthy",
  },
];

interface ActionsDemoWorkspaceProps {
  dataset: M7DecisionDemoFixtureRoot;
  role: OrganizationMemberRole;
}

export function ActionsDemoWorkspace({
  dataset,
  role,
}: ActionsDemoWorkspaceProps) {
  const [
    filter,
    setFilter,
  ] =
    useState<FilterKey>("ALL");

  const [
    selectedId,
    setSelectedId,
  ] =
    useState<string | null>(
      dataset.actions[0]?.id ?? null,
    );

  const [
    sheetOpen,
    setSheetOpen,
  ] =
    useState(false);

  const [
    viewportLayout,
    setViewportLayout,
  ] =
    useState<"mobile" | "tablet" | "desktop">(
      "mobile",
    );

  const rowRefs =
    useRef<Map<string, HTMLButtonElement>>(
      new Map(),
    );

  const tabletInspectorRef =
    useRef<HTMLDivElement>(
      null,
    );

  const isDesktopSplit =
    viewportLayout === "desktop";

  const isTabletStack =
    viewportLayout === "tablet";

  const usesSheet =
    viewportLayout === "mobile";

  const filteredActions =
    useMemo(
      () => {
        if (
          filter === "ALL"
        ) {
          return dataset.actions;
        }

        if (
          filter === "HEALTHY"
        ) {
          return [];
        }

        return dataset.actions.filter(
          (action) =>
            action.actionType === filter,
        );
      },
      [
        dataset.actions,
        filter,
      ],
    );

  const resolvedSelectedId =
    useMemo(
      () => {
        if (
          filter === "HEALTHY"
        ) {
          return null;
        }

        if (
          filteredActions.some(
            (action) =>
              action.id === selectedId,
          )
        ) {
          return selectedId;
        }

        return filteredActions[0]?.id ?? null;
      },
      [
        filter,
        filteredActions,
        selectedId,
      ],
    );

  const selectedAction =
    useMemo(
      () =>
        dataset.actions.find(
          (action) =>
            action.id === resolvedSelectedId,
        ) ?? null,
      [
        dataset.actions,
        resolvedSelectedId,
      ],
    );

  const showHealthySkim =
    filter === "ALL" ||
    filter === "HEALTHY";

  useEffect(
    () => {
      // Split only when content width is usable with the lg shell sidebar.
      const desktop =
        window.matchMedia(
          "(min-width: 1280px)",
        );
      const tablet =
        window.matchMedia(
          "(min-width: 768px)",
        );

      function sync() {
        if (
          desktop.matches
        ) {
          setViewportLayout(
            "desktop",
          );
          setSheetOpen(
            false,
          );
          return;
        }

        if (
          tablet.matches
        ) {
          setViewportLayout(
            "tablet",
          );
          setSheetOpen(
            false,
          );
          return;
        }

        setViewportLayout(
          "mobile",
        );
      }

      sync();
      desktop.addEventListener(
        "change",
        sync,
      );
      tablet.addEventListener(
        "change",
        sync,
      );

      return () => {
        desktop.removeEventListener(
          "change",
          sync,
        );
        tablet.removeEventListener(
          "change",
          sync,
        );
      };
    },
    [],
  );

  useEffect(
    () => {
      if (
        !resolvedSelectedId
      ) {
        return;
      }

      const reduceMotion =
        window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;

      const behavior =
        reduceMotion
          ? "auto"
          : "smooth";

      if (
        isTabletStack
      ) {
        tabletInspectorRef.current?.scrollIntoView({
          block: "nearest",
          inline: "nearest",
          behavior,
        });
        return;
      }

      if (
        !isDesktopSplit
      ) {
        return;
      }

      const row =
        rowRefs.current.get(
          resolvedSelectedId,
        );

      row?.scrollIntoView({
        block: "nearest",
        inline: "nearest",
        behavior,
      });
    },
    [
      filter,
      resolvedSelectedId,
      isDesktopSplit,
      isTabletStack,
    ],
  );

  function changeFilter(
    next: FilterKey,
  ) {
    setFilter(next);
    setSheetOpen(false);

    if (
      next === "HEALTHY"
    ) {
      setSelectedId(null);
      return;
    }

    const nextActions =
      next === "ALL"
        ? dataset.actions
        : dataset.actions.filter(
            (action) =>
              action.actionType === next,
          );

    setSelectedId(
      nextActions[0]?.id ?? null,
    );
  }

  function selectAction(
    actionId: string,
  ) {
    setSelectedId(actionId);

    if (
      usesSheet
    ) {
      setSheetOpen(true);
    }
  }

  function closeSheet() {
    setSheetOpen(false);

    if (
      resolvedSelectedId
    ) {
      const row =
        rowRefs.current.get(
          resolvedSelectedId,
        );

      row?.focus();
    }
  }

  return (
    <div className="min-w-0 max-w-full space-y-2.5 sm:space-y-5 xl:space-y-6">
      <StoreLocationContextBar
        storeLabel={dataset.storeLabel}
        locationLabel={dataset.locationLabel}
      />

      <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
        <div className="min-w-0 max-w-2xl">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-xs font-medium text-zinc-500 sm:text-sm">
              Actions
            </p>

            <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-400 sm:hidden">
              {dataset.actions.length} demo
            </p>
          </div>

          <h1 className="mt-0.5 text-[1.375rem] font-semibold leading-tight tracking-[-0.035em] sm:mt-2 sm:text-3xl xl:text-4xl">
            Decision queue
          </h1>

          <p className="mt-2 hidden max-w-xl text-sm leading-6 text-zinc-600 sm:block">
            Review what StoreAgent would recommend next. Select a decision to inspect the evidence — demonstration only.
          </p>
        </div>

        <p className="hidden text-xs font-medium uppercase tracking-[0.12em] text-zinc-400 sm:block">
          {dataset.actions.length} demo decisions
        </p>
      </div>

      <ActionTypeFilter
        filter={filter}
        onChange={changeFilter}
        counts={{
          ALL: dataset.actions.length,
          REORDER: countType(dataset.actions, "REORDER"),
          REDUCE: countType(dataset.actions, "REDUCE"),
          PROMOTE: countType(dataset.actions, "PROMOTE"),
          WATCH: countType(dataset.actions, "WATCH"),
          HEALTHY: dataset.healthySkim.length,
        }}
      />

      <div className="grid min-w-0 gap-4 md:gap-5 xl:grid-cols-[minmax(18rem,0.42fr)_minmax(0,0.58fr)] xl:items-start xl:gap-7">
        <section
          aria-label="Decision queue"
          className="min-w-0 space-y-2.5"
        >
          {filter !== "ALL" &&
            filter !== "HEALTHY" && (
              <p className="px-0.5 text-xs font-medium text-zinc-500">
                {filteredActions.length === 1
                  ? "1 matching decision"
                  : `${filteredActions.length} matching decisions`}
              </p>
            )}

          {filter !== "HEALTHY" &&
            filteredActions.length === 0 && (
              <EmptyQueueState />
            )}

          {filteredActions.map(
            (action) => (
              <div
                key={action.id}
                className="min-w-0 space-y-2.5"
              >
                <ActionRow
                  action={action}
                  selected={
                    action.id === resolvedSelectedId &&
                    (isDesktopSplit ||
                      isTabletStack ||
                      sheetOpen)
                  }
                  compact={
                    filteredActions.length === 1
                  }
                  onSelect={() =>
                    selectAction(action.id)
                  }
                  rowRef={(node) => {
                    if (
                      node
                    ) {
                      rowRefs.current.set(
                        action.id,
                        node,
                      );
                    } else {
                      rowRefs.current.delete(
                        action.id,
                      );
                    }
                  }}
                />

                {isTabletStack &&
                  action.id === resolvedSelectedId &&
                  selectedAction && (
                    <div
                      ref={tabletInspectorRef}
                      className="min-w-0"
                    >
                      <ActionEvidenceInspector
                        action={selectedAction}
                        role={role}
                      />
                    </div>
                  )}
              </div>
            ),
          )}

          {isTabletStack &&
            filter === "HEALTHY" && (
              <InspectorEmptyState
                healthyOnly
              />
            )}

          {showHealthySkim && (
            <HealthySkimSection
              items={dataset.healthySkim}
            />
          )}
        </section>

        <aside
          aria-label="Evidence inspector"
          className="hidden min-w-0 xl:block"
        >
          <div className="sticky top-24 max-h-[calc(100vh-7.5rem)]">
            {selectedAction ? (
              <ActionEvidenceInspector
                action={selectedAction}
                role={role}
              />
            ) : (
              <InspectorEmptyState
                healthyOnly={
                  filter === "HEALTHY"
                }
              />
            )}
          </div>
        </aside>
      </div>

      {usesSheet &&
        sheetOpen &&
        selectedAction && (
          <ActionDetailSheet
            action={selectedAction}
            role={role}
            onClose={closeSheet}
          />
        )}
    </div>
  );
}

function countType(
  actions: DemoActionItem[],
  type: DemoActionType,
): number {
  return actions.filter(
    (action) =>
      action.actionType === type,
  ).length;
}

function StoreLocationContextBar({
  storeLabel,
  locationLabel,
}: {
  storeLabel: string;
  locationLabel: string;
}) {
  return (
    <div className="flex w-full min-w-0 max-w-full flex-row flex-wrap items-center gap-x-4 gap-y-1.5 rounded-2xl border border-zinc-200 bg-white px-3.5 py-2 shadow-sm sm:gap-6 sm:px-5 sm:py-3.5">
      <div className="flex min-w-0 items-center gap-2 text-sm text-zinc-700">
        <Store
          className="size-4 shrink-0 text-zinc-500"
          aria-hidden="true"
        />
        <span className="truncate font-medium">
          {storeLabel}
        </span>
      </div>

      <div className="hidden h-4 w-px bg-zinc-200 sm:block" />

      <div className="flex min-w-0 items-center gap-2 text-sm text-zinc-600">
        <MapPin
          className="size-4 shrink-0 text-zinc-500"
          aria-hidden="true"
        />
        <span className="truncate">
          {locationLabel}
        </span>
      </div>
    </div>
  );
}

function ActionTypeFilter({
  filter,
  onChange,
  counts,
}: {
  filter: FilterKey;
  onChange: (next: FilterKey) => void;
  counts: Record<FilterKey, number>;
}) {
  const scrollerRef =
    useRef<HTMLDivElement>(
      null,
    );

  const activeRef =
    useRef<HTMLButtonElement>(
      null,
    );

  const [
    overflow,
    setOverflow,
  ] =
    useState({
      left: false,
      right: false,
    });

  useEffect(
    () => {
      const scroller =
        scrollerRef.current;

      if (
        !scroller
      ) {
        return;
      }

      function updateOverflow() {
        if (
          !scroller
        ) {
          return;
        }

        const maxScroll =
          scroller.scrollWidth -
          scroller.clientWidth;

        setOverflow({
          left: scroller.scrollLeft > 4,
          right:
            maxScroll > 4 &&
            scroller.scrollLeft < maxScroll - 4,
        });
      }

      updateOverflow();
      scroller.addEventListener(
        "scroll",
        updateOverflow,
        {
          passive: true,
        },
      );
      window.addEventListener(
        "resize",
        updateOverflow,
      );

      return () => {
        scroller.removeEventListener(
          "scroll",
          updateOverflow,
        );
        window.removeEventListener(
          "resize",
          updateOverflow,
        );
      };
    },
    [
      filter,
    ],
  );

  useEffect(
    () => {
      const chip =
        activeRef.current;
      const scroller =
        scrollerRef.current;

      if (
        !chip ||
        !scroller
      ) {
        return;
      }

      const reduceMotion =
        window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;

      const chipLeft =
        chip.offsetLeft;
      const chipRight =
        chipLeft + chip.offsetWidth;
      const viewLeft =
        scroller.scrollLeft;
      const viewRight =
        viewLeft + scroller.clientWidth;
      const pad =
        24;

      if (
        chipLeft < viewLeft + pad ||
        chipRight > viewRight - pad
      ) {
        chip.scrollIntoView({
          inline: "center",
          block: "nearest",
          behavior: reduceMotion
            ? "auto"
            : "smooth",
        });
      }
    },
    [
      filter,
    ],
  );

  return (
    <div className="sticky top-[7.25rem] z-[5] w-full min-w-0 max-w-full bg-[#f7f8f7]/95 py-1 backdrop-blur-sm md:top-[7.75rem] lg:static lg:bg-transparent lg:py-0 lg:backdrop-blur-none">
      <div className="relative min-w-0 max-w-full">
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-y-0 left-0 z-[1] w-8 bg-gradient-to-r from-[#f7f8f7] to-transparent motion-safe:transition-opacity motion-safe:duration-150 motion-reduce:transition-none lg:hidden ${
            overflow.left
              ? "opacity-100"
              : "opacity-0"
          }`}
        />
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-y-0 right-0 z-[1] w-8 bg-gradient-to-l from-[#f7f8f7] to-transparent motion-safe:transition-opacity motion-safe:duration-150 motion-reduce:transition-none lg:hidden ${
            overflow.right
              ? "opacity-100"
              : "opacity-0"
          }`}
        />

        <div
          ref={scrollerRef}
          className="max-w-full min-w-0 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden lg:overflow-visible"
        >
          <div
            role="toolbar"
            aria-label="Filter decisions by type"
            className="flex w-max max-w-none gap-2 pr-1 sm:w-full sm:max-w-full sm:flex-wrap"
          >
            <span className="sr-only">
              <Filter aria-hidden="true" />
              {overflow.right || overflow.left
                ? "More filters available. Swipe or use arrow keys when focused."
                : null}
            </span>

            {FILTERS.map(
              ({
                key,
                label,
              }) => {
                const active =
                  filter === key;

                return (
                  <button
                    key={key}
                    ref={
                      active
                        ? activeRef
                        : undefined
                    }
                    type="button"
                    aria-pressed={active}
                    onClick={() =>
                      onChange(key)
                    }
                    className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-medium motion-safe:transition-[border-color,background-color,color,box-shadow] motion-safe:duration-200 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 ${
                      active
                        ? "border-zinc-950 bg-zinc-950 text-white shadow-sm"
                        : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50"
                    }`}
                  >
                    {label}
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                        active
                          ? "bg-white/15 text-white"
                          : "bg-zinc-100 text-zinc-500"
                      }`}
                    >
                      {counts[key]}
                    </span>
                  </button>
                );
              },
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ActionRow({
  action,
  selected,
  compact,
  onSelect,
  rowRef,
}: {
  action: DemoActionItem;
  selected: boolean;
  compact?: boolean;
  onSelect: () => void;
  rowRef: (node: HTMLButtonElement | null) => void;
}) {
  const meta =
    getActionTypeMeta(
      action.actionType,
    );

  const showQty =
    demoActionShowsRecommendedQuantity(
      action,
    );

  return (
    <button
      ref={rowRef}
      type="button"
      onClick={onSelect}
      onKeyDown={(event) => {
        if (
          event.key === "Enter" ||
          event.key === " "
        ) {
          event.preventDefault();
          onSelect();
        }
      }}
      aria-pressed={selected}
      aria-label={`${meta.label}: ${action.productTitle}, ${action.variantTitle}`}
      className={`group relative w-full min-w-0 max-w-full overflow-hidden rounded-2xl border text-left shadow-sm motion-safe:transition-[border-color,box-shadow,background-color] motion-safe:duration-200 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 ${
        compact
          ? "px-4 py-3.5 sm:px-5"
          : "px-4 py-3.5 sm:px-5 sm:py-4"
      } ${
        selected
          ? "border-zinc-950 bg-white shadow-md ring-1 ring-zinc-950/10"
          : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50/80"
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute inset-y-0 left-0 w-1 motion-safe:transition-colors motion-safe:duration-200 motion-reduce:transition-none ${
          selected
            ? "bg-zinc-950"
            : "bg-transparent group-hover:bg-zinc-300"
        }`}
      />

      <div className="flex flex-wrap items-start justify-between gap-2.5">
        <ActionTypeChip
          actionType={action.actionType}
        />

        <div className="flex flex-wrap items-center gap-1.5">
          <PriorityBadge
            priority={action.priority}
          />
          <ConfidenceBadge
            confidence={action.confidence}
          />
        </div>
      </div>

      <div className="mt-3 min-w-0">
        <p className="truncate text-[15px] font-semibold tracking-[-0.02em] text-zinc-950 sm:text-base">
          {action.productTitle}
        </p>
        <p className="mt-0.5 truncate text-sm text-zinc-500">
          {action.variantTitle}
        </p>
      </div>

      <p className="mt-2.5 line-clamp-2 text-sm leading-5 text-zinc-600">
        {action.conciseReason}
      </p>

      {showQty && (
        <p className="mt-3 text-sm font-medium text-zinc-900">
          Qty{" "}
          <span className="tabular-nums">
            {action.recommendedQuantity}
          </span>
        </p>
      )}

      {action.actionType === "WATCH" && (
        <p className="mt-3 flex items-center gap-2 text-xs font-medium text-zinc-500">
          <span
            className="size-1.5 rounded-full bg-zinc-400"
            aria-hidden="true"
          />
          Insufficient or conflicting evidence — no buy recommendation
        </p>
      )}
    </button>
  );
}

function PriorityBadge({
  priority,
}: {
  priority: DemoActionItem["priority"];
}) {
  return (
    <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-700">
      {formatDemoPriorityLabel(priority)}
    </span>
  );
}

function ConfidenceBadge({
  confidence,
}: {
  confidence: DemoActionItem["confidence"];
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-600">
      <span
        className={`size-1.5 rounded-full ${
          confidence === "high"
            ? "bg-emerald-500"
            : confidence === "medium"
              ? "bg-amber-500"
              : "bg-zinc-400"
        }`}
        aria-hidden="true"
      />
      {formatDemoConfidenceLabel(confidence)} confidence
    </span>
  );
}

function HealthySkimSection({
  items,
}: {
  items: DemoHealthySkimItem[];
}) {
  if (
    items.length === 0
  ) {
    return null;
  }

  return (
    <section
      aria-label="Healthy inventory — non-action"
      className="mt-2 rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/80 px-4 py-5 sm:px-5"
    >
      <div className="flex items-center gap-2">
        <CheckCircle2
          className="size-4 text-zinc-500"
          aria-hidden="true"
        />
        <h2 className="text-sm font-semibold text-zinc-800">
          Healthy — no intervention
        </h2>
      </div>

      <p className="mt-2 text-xs leading-5 text-zinc-500">
        Demonstration skim only. Healthy items are not inventory actions and cannot be approved.
      </p>

      <ul className="mt-4 space-y-3">
        {items.map(
          (item) => (
            <li
              key={item.id}
              className="rounded-xl border border-zinc-200 bg-white px-4 py-3"
            >
              <p className="text-sm font-medium text-zinc-900">
                {item.productTitle}
              </p>
              <p className="mt-0.5 text-xs text-zinc-500">
                {item.variantTitle}
              </p>
              <p className="mt-2 text-xs leading-5 text-zinc-600">
                {item.note}
              </p>
            </li>
          ),
        )}
      </ul>
    </section>
  );
}

function EmptyQueueState() {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white px-5 py-10 text-center shadow-sm">
      <p className="text-sm font-semibold text-zinc-900">
        No decisions in this filter
      </p>
      <p className="mt-2 text-sm text-zinc-500">
        Try another type, or return to All actions.
      </p>
    </div>
  );
}

function InspectorEmptyState({
  healthyOnly,
}: {
  healthyOnly: boolean;
}) {
  return (
    <div className="rounded-3xl border border-zinc-200 bg-white px-7 py-12 shadow-sm">
      <p className="text-sm font-semibold text-zinc-900">
        {healthyOnly
          ? "Healthy items are not actions"
          : "Select a decision"}
      </p>
      <p className="mt-3 max-w-sm text-sm leading-6 text-zinc-500">
        {healthyOnly
          ? "Evidence inspection applies to REORDER, REDUCE, PROMOTE, and WATCH demonstration rows only."
          : "Evidence for the selected recommendation appears here and stays connected as you move through the queue."}
      </p>
    </div>
  );
}

function ActionEvidenceInspector({
  action,
  role,
}: {
  action: DemoActionItem;
  role: OrganizationMemberRole;
}) {
  const meta =
    getActionTypeMeta(
      action.actionType,
    );

  const showQty =
    demoActionShowsRecommendedQuantity(
      action,
    );

  const keyFields =
    getKeyEvidenceFields(
      action,
    );

  const secondaryFields =
    getSecondaryEvidenceFields(
      action,
    );

  return (
    <article className="flex max-h-[inherit] flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm motion-safe:transition-shadow motion-safe:duration-200">
      <header className="shrink-0 border-b border-zinc-100 px-5 py-5 sm:px-7 sm:py-6">
        <div className="flex flex-wrap items-center gap-2">
          <ActionTypeChip
            actionType={action.actionType}
          />
          <PriorityBadge
            priority={action.priority}
          />
          <ConfidenceBadge
            confidence={action.confidence}
          />
        </div>

        <h2 className="mt-4 text-xl font-semibold tracking-[-0.03em] text-zinc-950 sm:text-2xl">
          {action.productTitle}
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          {action.variantTitle}
        </p>

        <p className="mt-3 text-sm leading-6 text-zinc-700">
          {action.conciseReason}
        </p>

        <p className="mt-3 text-xs font-medium uppercase tracking-[0.12em] text-zinc-400">
          {meta.shortWhy}
        </p>

        {showQty && (
          <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
              Recommended quantity
            </p>
            <p className="mt-1 text-3xl font-semibold tracking-[-0.03em] tabular-nums text-zinc-950">
              {action.recommendedQuantity}
            </p>
            {action.recommendedActionDate && (
              <p className="mt-1.5 text-sm text-zinc-600">
                Suggested by{" "}
                <span className="font-medium text-zinc-800">
                  {action.recommendedActionDate}
                </span>
              </p>
            )}
            <p className="mt-2 text-xs leading-5 text-zinc-500">
              Quantity grounded in this synthetic fixture only.
            </p>
          </div>
        )}

        {action.actionType !== "REORDER" && (
          <p className="mt-4 text-xs leading-5 text-zinc-500">
            No recommended quantity for {meta.label} in this demonstration.
          </p>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7 sm:py-6">
        <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
          Key evidence
        </h3>

        <EvidenceGrid
          fields={keyFields}
        />

        <ReasonExplanationList
          codes={action.evidence.reasonCodes}
          watch={
            action.actionType === "WATCH"
          }
        />

        <details className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-50/70 px-4 py-3 open:bg-white">
          <summary className="cursor-pointer list-none rounded-xl text-sm font-medium text-zinc-800 marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
            <span className="inline-flex min-h-11 items-center">
              Technical details
            </span>
          </summary>

          <div className="pb-2 pt-1">
            {secondaryFields.length > 0 && (
              <>
                <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                  Additional evidence
                </h4>
                <EvidenceGrid
                  fields={secondaryFields}
                />
              </>
            )}

            <RawReasonCodeList
              title="Raw reason codes"
              codes={action.evidence.reasonCodes}
            />

            {action.confidenceReasonCodes.length >
              0 && (
              <div className="mt-4">
                <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                  Confidence notes
                </h4>
                <ul className="mt-2 space-y-2">
                  {action.confidenceReasonCodes.map(
                    (code) => (
                      <li
                        key={code}
                        className="text-sm leading-5 text-zinc-600"
                      >
                        <span>
                          {explainDemoReasonCode(code)}
                        </span>
                        <span className="mt-0.5 block font-mono text-[11px] text-zinc-400">
                          {code}
                        </span>
                      </li>
                    ),
                  )}
                </ul>
              </div>
            )}
          </div>
        </details>

        <DemoApprovalCluster
          key={action.id}
          action={action}
          role={role}
        />
      </div>
    </article>
  );
}

type EvidenceField = {
  label: string;
  value: string;
};

function getKeyEvidenceFields(
  action: DemoActionItem,
): EvidenceField[] {
  const evidence =
    action.evidence;

  const fields: EvidenceField[] = [
    {
      label: "Available",
      value: formatDemoUnknownNumber(
        evidence.availableQuantity,
      ),
    },
    {
      label: "Incoming",
      value: formatDemoUnknownNumber(
        evidence.incomingQuantity,
      ),
    },
    {
      label: "Demand velocity",
      value: formatDemoUnknownNumber(
        evidence.demandVelocity,
        {
          digits: 1,
          suffix: "/day",
        },
      ),
    },
    {
      label: "Days of stock",
      value: formatDemoUnknownNumber(
        evidence.daysOfStock,
        {
          digits: 1,
        },
      ),
    },
    {
      label: "Lead time",
      value: formatDemoUnknownNumber(
        evidence.leadTimeDays,
        {
          suffix: " days",
        },
      ),
    },
  ];

  if (
    action.actionType === "REORDER"
  ) {
    fields.push(
      {
        label: "Reorder point",
        value: formatDemoUnknownNumber(
          evidence.reorderPointUnits,
        ),
      },
      {
        label: "Target stock",
        value: formatDemoUnknownNumber(
          evidence.targetStockUnits,
        ),
      },
    );
  }

  if (
    action.actionType === "REDUCE" ||
    action.actionType === "PROMOTE"
  ) {
    fields.push({
      label: "Inventory age",
      value: formatDemoUnknownNumber(
        evidence.inventoryAgeDays,
        {
          suffix: " days",
        },
      ),
    });
  }

  fields.push({
    label: "Data quality",
    value: formatDemoDataQualityScore(
      evidence.dataQualityScore,
    ),
  });

  return fields;
}

function getSecondaryEvidenceFields(
  action: DemoActionItem,
): EvidenceField[] {
  const evidence =
    action.evidence;

  const fields: EvidenceField[] = [
    {
      label: "Safety stock",
      value: formatDemoUnknownNumber(
        evidence.safetyStockUnits,
      ),
    },
  ];

  if (
    action.actionType !== "REORDER"
  ) {
    fields.push(
      {
        label: "Reorder point",
        value: formatDemoUnknownNumber(
          evidence.reorderPointUnits,
        ),
      },
      {
        label: "Target stock",
        value: formatDemoUnknownNumber(
          evidence.targetStockUnits,
        ),
      },
    );
  }

  if (
    action.actionType !== "REDUCE" &&
    action.actionType !== "PROMOTE"
  ) {
    fields.push({
      label: "Inventory age",
      value: formatDemoUnknownNumber(
        evidence.inventoryAgeDays,
        {
          suffix: " days",
        },
      ),
    });
  }

  fields.push({
    label: "Forecast demand",
    value: formatDemoUnknownNumber(
      evidence.forecastExpectedDemandUnits,
    ),
  });

  return fields;
}

function EvidenceGrid({
  fields,
}: {
  fields: EvidenceField[];
}) {
  return (
    <dl className="mt-3 grid grid-cols-1 gap-2.5 min-[380px]:grid-cols-2 sm:grid-cols-3">
      {fields.map(
        ({
          label,
          value,
        }) => (
          <div
            key={label}
            className="min-w-0 rounded-2xl border border-zinc-100 bg-zinc-50/80 px-3.5 py-2.5"
          >
            <dt className="text-[11px] font-medium uppercase tracking-[0.1em] text-zinc-500">
              {label}
            </dt>
            <dd
              className={`mt-1 text-sm font-semibold tabular-nums tracking-[-0.01em] ${
                value === "Unknown"
                  ? "text-zinc-400"
                  : "text-zinc-950"
              }`}
            >
              {value}
            </dd>
          </div>
        ),
      )}
    </dl>
  );
}

function ReasonExplanationList({
  codes,
  watch,
}: {
  codes: string[];
  watch: boolean;
}) {
  return (
    <div className="mt-5">
      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
        {watch
          ? "Why this is a watch"
          : "Why this recommendation"}
      </h3>

      {watch && (
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          Insufficient or conflicting evidence — StoreAgent is not recommending a buy, reduce, or promote on this SKU.
        </p>
      )}

      {codes.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-400">
          Unknown
        </p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {codes.map(
            (code) => (
              <li
                key={code}
                className="rounded-2xl border border-zinc-200 bg-white px-3.5 py-3 text-sm leading-5 text-zinc-700"
              >
                {explainDemoReasonCode(code)}
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}

function RawReasonCodeList({
  title,
  codes,
}: {
  title: string;
  codes: string[];
}) {
  return (
    <div className="mt-4">
      <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
        {title}
      </h4>

      {codes.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-400">
          Unknown
        </p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-2">
          {codes.map(
            (code) => (
              <li
                key={code}
                className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 font-mono text-[11px] text-zinc-600"
              >
                {code}
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}

function ActionDetailSheet({
  action,
  role,
  onClose,
}: {
  action: DemoActionItem;
  role: OrganizationMemberRole;
  onClose: () => void;
}) {
  const titleId =
    useId();

  const closeRef =
    useRef<HTMLButtonElement>(
      null,
    );

  const panelRef =
    useRef<HTMLDivElement>(
      null,
    );

  useEffect(
    () => {
      const previousOverflow =
        document.body.style.overflow;

      document.body.style.overflow =
        "hidden";

      closeRef.current?.focus();

      function onKeyDown(
        event: KeyboardEvent,
      ) {
        if (
          event.key === "Escape"
        ) {
          event.preventDefault();
          onClose();
          return;
        }

        if (
          event.key !== "Tab" ||
          !panelRef.current
        ) {
          return;
        }

        const focusable =
          Array.from(
            panelRef.current.querySelectorAll<HTMLElement>(
              'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
          ).filter(
            (node) =>
              node.tabIndex !== -1 &&
              !node.hasAttribute("disabled") &&
              node.getAttribute("aria-hidden") !== "true",
          );

        if (
          focusable.length === 0
        ) {
          return;
        }

        const first =
          focusable[0];
        const last =
          focusable[focusable.length - 1];

        if (
          event.shiftKey &&
          document.activeElement === first
        ) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          document.activeElement === last
        ) {
          event.preventDefault();
          first.focus();
        }
      }

      window.addEventListener(
        "keydown",
        onKeyDown,
      );

      return () => {
        document.body.style.overflow =
          previousOverflow;
        window.removeEventListener(
          "keydown",
          onKeyDown,
        );
      };
    },
    [
      onClose,
    ],
  );

  if (
    typeof document === "undefined"
  ) {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[90] md:hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close decision detail"
        className="absolute inset-0 bg-zinc-950/40 motion-safe:transition-opacity motion-safe:duration-200 motion-reduce:transition-none"
        onClick={onClose}
      />

      <div
        ref={panelRef}
        className="absolute inset-x-0 bottom-0 flex max-h-[min(92vh,100dvh)] flex-col overflow-hidden rounded-t-[1.75rem] bg-[#f7f8f7] pb-[env(safe-area-inset-bottom)] shadow-2xl motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-200 motion-reduce:animate-none"
      >
        <div className="shrink-0 border-b border-zinc-200 bg-white">
          <div className="flex items-center justify-between px-4 py-3">
            <p
              id={titleId}
              className="text-sm font-semibold text-zinc-950"
            >
              Decision detail
            </p>

            <button
              ref={closeRef}
              type="button"
              aria-label="Close decision detail"
              title="Close"
              onClick={onClose}
              className="flex size-11 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 motion-safe:transition-[background-color] motion-safe:duration-150 motion-reduce:transition-none hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
            >
              <X
                className="size-5"
                aria-hidden="true"
              />
            </button>
          </div>

          <p
            role="status"
            className="border-t border-amber-100 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-950"
          >
            Synthetic demonstration data — not live inventory
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 pb-8 sm:p-5">
          <ActionEvidenceInspector
            action={action}
            role={role}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
