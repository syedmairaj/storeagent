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
  DecisionBriefPanel,
} from "@/components/actions-demo/decision-brief-panel";

import type {
  OrganizationMemberRole,
} from "@/lib/commerce-domain/types";

import type {
  DecisionBriefV1,
} from "@/lib/decision-brief";

import {
  demoActionShowsRecommendedQuantity,
  type DemoActionItem,
  type DemoActionType,
  type DemoHealthySkimItem,
  type M7DecisionDemoFixtureRoot,
} from "@/lib/demo/m7-decision-demo-fixtures";

import {
  formatDemoConfidenceLabel,
  formatDemoPriorityLabel,
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
  /**
   * Optional server-precomposed briefs keyed by action id (E3.3 soft-enable).
   * When absent/empty, panels use local deterministic compose (E2 parity).
   */
  precomposedBriefsByActionId?: Readonly<
    Record<string, DecisionBriefV1>
  >;
}

export function ActionsDemoWorkspace({
  dataset,
  role,
  precomposedBriefsByActionId,
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

  const desktopInspectorScrollRef =
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

      // Reset inspector scroll owner to top on selection — do not trap page scroll.
      const briefScroll =
        desktopInspectorScrollRef.current?.querySelector(
          '[data-actions-brief-scroll="true"]',
        );

      if (
        briefScroll instanceof HTMLElement
      ) {
        briefScroll.scrollTop = 0;
      }
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
    <div className="min-w-0 max-w-full space-y-2.5 sm:space-y-4 xl:space-y-5">
      <StoreLocationContextBar
        storeLabel={dataset.storeLabel}
        locationLabel={dataset.locationLabel}
      />

      <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
        <div className="min-w-0 max-w-2xl scroll-mt-[9.5rem] md:scroll-mt-40 lg:scroll-mt-24">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-xs font-medium text-zinc-500 sm:text-sm">
              Actions
            </p>

            <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-400 sm:hidden">
              {dataset.actions.length} demo
            </p>
          </div>

          <h1 className="mt-0.5 text-[1.25rem] font-semibold leading-tight tracking-[-0.035em] sm:mt-1.5 sm:text-2xl xl:text-3xl">
            Decision queue
          </h1>

          <p className="mt-1 hidden max-w-xl text-sm leading-6 text-zinc-600 sm:block">
            Select a decision to inspect why StoreAgent recommends it — demonstration only.
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
                        heightMode="flow"
                        precomposedBrief={
                          precomposedBriefsByActionId?.[
                            selectedAction.id
                          ]
                        }
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
          {/*
            Single scroll owner for the desktop inspector.
            Sticky top clears the synthetic banner (lg:top-0, ~3–3.5rem tall).
            Definite max-height + flex + overflow-hidden so the brief's internal
            scroller can reach quantity editors, controls, and Technical details.
          */}
          <div
            ref={desktopInspectorScrollRef}
            data-actions-inspector-shell="true"
            className="sticky top-[4.25rem] z-10 flex h-[calc(100dvh-5rem)] max-h-[calc(100dvh-5rem)] min-h-0 flex-col overflow-hidden"
          >
            {selectedAction ? (
              <ActionEvidenceInspector
                action={selectedAction}
                role={role}
                heightMode="contained"
                precomposedBrief={
                  precomposedBriefsByActionId?.[
                    selectedAction.id
                  ]
                }
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
            precomposedBrief={
              precomposedBriefsByActionId?.[
                selectedAction.id
              ]
            }
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
    <div className="flex w-full min-w-0 max-w-full flex-row flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-zinc-200 bg-white px-3 py-1.5 shadow-sm sm:gap-6 sm:rounded-2xl sm:px-5 sm:py-3.5">
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

  // Sticky stack below lg: shell header (4rem) + compact synthetic banner.
  // Keep filter clear of both without covering queue cards at 320–1024.
  const showSwipeHint =
    overflow.left ||
    overflow.right;

  return (
    <div className="sticky top-[7.5rem] z-[5] w-full min-w-0 max-w-full scroll-mt-[7.5rem] bg-[#f7f8f7]/95 py-1 backdrop-blur-sm md:top-32 lg:static lg:scroll-mt-0 lg:bg-transparent lg:py-0 lg:backdrop-blur-none">
      <div className="mb-1 flex items-center justify-between gap-2 px-0.5 lg:hidden">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
          Filters
        </p>
        {showSwipeHint ? (
          <p
            className="text-[11px] font-medium text-zinc-500"
            aria-hidden="true"
          >
            Swipe for more
          </p>
        ) : null}
      </div>

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
          data-actions-filter-scroll="true"
          className="max-w-full min-w-0 overflow-x-auto overscroll-x-contain [scrollbar-width:thin] lg:overflow-visible lg:[scrollbar-width:auto]"
        >
          <div
            role="toolbar"
            aria-label="Filter decisions by type"
            className="flex w-max max-w-none gap-2 pr-3 sm:w-full sm:max-w-full sm:flex-wrap sm:pr-0"
          >
            <span className="sr-only">
              <Filter aria-hidden="true" />
              {showSwipeHint
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
                    <span className="whitespace-nowrap">
                      {label}
                    </span>
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
          ? "px-3.5 py-3 sm:px-5 sm:py-3.5"
          : "px-3.5 py-3 sm:px-5 sm:py-4"
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

      <div className="flex min-w-0 flex-wrap items-start justify-between gap-1.5">
        <ActionTypeChip
          actionType={action.actionType}
        />

        <div className="flex max-w-full flex-wrap items-center justify-end gap-1">
          <PriorityBadge
            priority={action.priority}
          />
          <ConfidenceBadge
            confidence={action.confidence}
          />
        </div>
      </div>

      <div className="mt-2 min-w-0 sm:mt-3">
        <p className="truncate text-[15px] font-semibold tracking-[-0.02em] text-zinc-950 sm:text-base">
          {action.productTitle}
        </p>
        <p className="mt-0.5 truncate text-sm text-zinc-500">
          {action.variantTitle}
        </p>
      </div>

      {action.actionType === "WATCH" ? (
        <p className="mt-2 flex items-center gap-2 text-xs font-medium leading-5 text-zinc-500 sm:mt-2.5">
          <span
            className="size-1.5 shrink-0 rounded-full bg-zinc-400"
            aria-hidden="true"
          />
          Incomplete evidence — watch only
        </p>
      ) : (
        <p className="mt-2 line-clamp-2 text-sm leading-5 text-zinc-600 sm:mt-2.5">
          {action.conciseReason}
        </p>
      )}

      {showQty && (
        <p className="mt-2 text-sm font-medium text-zinc-900 sm:mt-3">
          Qty{" "}
          <span className="tabular-nums">
            {action.recommendedQuantity}
          </span>
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
    <span className="inline-flex max-w-full items-center rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-700 sm:px-2.5 sm:py-1 sm:text-[11px]">
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
    <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[10px] font-medium text-zinc-600 sm:gap-1.5 sm:px-2.5 sm:py-1 sm:text-[11px]">
      <span
        className={`size-1.5 shrink-0 rounded-full ${
          confidence === "high"
            ? "bg-emerald-500"
            : confidence === "medium"
              ? "bg-amber-500"
              : "bg-zinc-400"
        }`}
        aria-hidden="true"
      />
      <span className="truncate">
        {formatDemoConfidenceLabel(confidence)}{" "}
        <span className="hidden min-[380px]:inline">
          confidence
        </span>
      </span>
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
    <div className="flex h-full min-h-[12rem] flex-1 flex-col justify-center rounded-3xl border border-zinc-200 bg-white px-6 py-10 shadow-sm sm:px-7">
      <p className="text-sm font-semibold text-zinc-900">
        {healthyOnly
          ? "Healthy items are not actions"
          : "Select a decision"}
      </p>
      <p className="mt-2 max-w-sm text-sm leading-6 text-zinc-500">
        {healthyOnly
          ? "Decision briefs apply to REORDER, REDUCE, PROMOTE, and WATCH demonstration rows only."
          : "The Decision Brief for the selected recommendation appears here."}
      </p>
    </div>
  );
}

function ActionEvidenceInspector({
  action,
  role,
  heightMode = "flow",
  precomposedBrief,
}: {
  action: DemoActionItem;
  role: OrganizationMemberRole;
  /**
   * contained: desktop sticky shell provides definite height; panel owns one scroller.
   * flow: sheet/tablet — parent owns scrolling.
   */
  heightMode?:
    | "contained"
    | "flow";
  precomposedBrief?: DecisionBriefV1;
}) {
  return (
    <DecisionBriefPanel
      action={action}
      role={role}
      heightMode={heightMode}
      precomposedBrief={precomposedBrief}
    />
  );
}

function ActionDetailSheet({
  action,
  role,
  onClose,
  precomposedBrief,
}: {
  action: DemoActionItem;
  role: OrganizationMemberRole;
  onClose: () => void;
  precomposedBrief?: DecisionBriefV1;
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
        className="absolute inset-x-0 bottom-0 flex max-h-[min(92dvh,100dvh)] flex-col overflow-hidden rounded-t-[1.75rem] bg-[#f7f8f7] shadow-2xl motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-200 motion-reduce:animate-none"
      >
        <div className="shrink-0 border-b border-zinc-200 bg-white">
          <div className="flex items-center justify-between px-4 py-3">
            <p
              id={titleId}
              className="text-sm font-semibold text-zinc-950"
            >
              Decision brief
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

        <div
          data-actions-sheet-scroll="true"
          className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-y-contain p-4 pb-[max(2rem,env(safe-area-inset-bottom))] sm:p-5 [-webkit-overflow-scrolling:touch]"
        >
          <ActionEvidenceInspector
            action={action}
            role={role}
            heightMode="flow"
            precomposedBrief={precomposedBrief}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
