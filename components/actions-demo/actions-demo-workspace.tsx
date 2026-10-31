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
  demoActionShowsRecommendedQuantity,
  type DemoActionItem,
  type DemoActionType,
  type DemoHealthySkimItem,
  type M7DecisionDemoFixtureRoot,
} from "@/lib/demo/m7-decision-demo-fixtures";

import {
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
}

export function ActionsDemoWorkspace({
  dataset,
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
    isDesktopSplit,
    setIsDesktopSplit,
  ] =
    useState(false);

  const rowRefs =
    useRef<Map<string, HTMLButtonElement>>(
      new Map(),
    );

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
      const media =
        window.matchMedia(
          "(min-width: 1024px)",
        );

      function sync() {
        setIsDesktopSplit(
          media.matches,
        );
      }

      sync();
      media.addEventListener(
        "change",
        sync,
      );

      return () => {
        media.removeEventListener(
          "change",
          sync,
        );
      };
    },
    [],
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
      !isDesktopSplit
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
    <div className="space-y-6">
      <StoreLocationContextBar
        storeLabel={dataset.storeLabel}
        locationLabel={dataset.locationLabel}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-zinc-500">
            Actions
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
            Decision queue
          </h1>

          <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-600">
            Review what StoreAgent would recommend next. Select a decision to inspect the evidence — demonstration only.
          </p>
        </div>

        <p className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-400">
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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)] xl:grid-cols-[minmax(0,0.4fr)_minmax(0,0.6fr)] lg:items-start lg:gap-8">
        <section
          aria-label="Decision queue"
          className="min-w-0 space-y-3"
        >
          {filter !== "HEALTHY" &&
            filteredActions.length === 0 && (
              <EmptyQueueState />
            )}

          {filteredActions.map(
            (action) => (
              <ActionRow
                key={action.id}
                action={action}
                selected={
                  action.id === resolvedSelectedId &&
                  (isDesktopSplit || sheetOpen)
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
            ),
          )}

          {showHealthySkim && (
            <HealthySkimSection
              items={dataset.healthySkim}
            />
          )}
        </section>

        <aside
          aria-label="Evidence inspector"
          className="hidden min-w-0 lg:block"
        >
          <div className="sticky top-6">
            {selectedAction ? (
              <ActionEvidenceInspector
                action={selectedAction}
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

      {!isDesktopSplit &&
        sheetOpen &&
        selectedAction && (
          <ActionDetailSheet
            action={selectedAction}
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
    <div className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3.5 shadow-sm sm:flex-row sm:items-center sm:gap-6 sm:px-5">
      <div className="flex min-w-0 items-center gap-2.5 text-sm text-zinc-700">
        <Store
          className="size-4 shrink-0 text-zinc-500"
          aria-hidden="true"
        />
        <span className="truncate font-medium">
          {storeLabel}
        </span>
      </div>

      <div className="hidden h-4 w-px bg-zinc-200 sm:block" />

      <div className="flex min-w-0 items-center gap-2.5 text-sm text-zinc-600">
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
  return (
    <div className="sticky top-[4.25rem] z-[5] -mx-1 overflow-x-auto px-1 pb-1 lg:static lg:overflow-visible">
      <div
        role="toolbar"
        aria-label="Filter decisions by type"
        className="inline-flex min-w-full gap-2 sm:min-w-0 sm:flex-wrap"
      >
        <span className="sr-only">
          <Filter aria-hidden="true" />
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
                type="button"
                aria-pressed={active}
                onClick={() =>
                  onChange(key)
                }
                className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition motion-safe:duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 ${
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
  );
}

function ActionRow({
  action,
  selected,
  onSelect,
  rowRef,
}: {
  action: DemoActionItem;
  selected: boolean;
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
      className={`group w-full rounded-2xl border px-4 py-4 text-left shadow-sm transition motion-safe:duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 sm:px-5 sm:py-5 ${
        selected
          ? "border-zinc-950 bg-white ring-1 ring-zinc-950/10"
          : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50/80"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <ActionTypeChip
          actionType={action.actionType}
        />

        <div className="flex flex-wrap items-center gap-2">
          <PriorityBadge
            priority={action.priority}
          />
          <ConfidenceBadge
            confidence={action.confidence}
          />
        </div>
      </div>

      <div className="mt-4 min-w-0">
        <p className="truncate text-base font-semibold tracking-[-0.02em] text-zinc-950">
          {action.productTitle}
        </p>
        <p className="mt-1 truncate text-sm text-zinc-500">
          {action.variantTitle}
        </p>
      </div>

      <p className="mt-3 line-clamp-2 text-sm leading-6 text-zinc-600">
        {action.conciseReason}
      </p>

      {showQty && (
        <p className="mt-4 text-sm font-medium text-zinc-900">
          Recommended quantity{" "}
          <span className="tabular-nums">
            {action.recommendedQuantity}
          </span>
        </p>
      )}

      {action.actionType === "WATCH" && (
        <p className="mt-4 flex items-center gap-2 text-xs font-medium text-zinc-500">
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
}: {
  action: DemoActionItem;
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
    <article className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm motion-safe:transition-shadow motion-safe:duration-200">
      <header className="border-b border-zinc-100 px-6 py-6 sm:px-8 sm:py-7">
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

        <h2 className="mt-5 text-2xl font-semibold tracking-[-0.03em] text-zinc-950">
          {action.productTitle}
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          {action.variantTitle}
        </p>

        <p className="mt-4 text-sm leading-6 text-zinc-600">
          {action.conciseReason}
        </p>

        <p className="mt-4 text-xs font-medium uppercase tracking-[0.12em] text-zinc-400">
          {meta.shortWhy}
        </p>

        {showQty && (
          <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
              Recommended quantity
            </p>
            <p className="mt-1 text-3xl font-semibold tracking-[-0.03em] tabular-nums text-zinc-950">
              {action.recommendedQuantity}
            </p>
            {action.recommendedActionDate && (
              <p className="mt-2 text-sm text-zinc-600">
                Suggested by{" "}
                <span className="font-medium text-zinc-800">
                  {action.recommendedActionDate}
                </span>
              </p>
            )}
            <p className="mt-3 text-xs leading-5 text-zinc-500">
              Quantity grounded in this synthetic fixture only. Edit / approve controls arrive in a later demonstration step and will not save production actions.
            </p>
          </div>
        )}

        {action.actionType !== "REORDER" && (
          <p className="mt-5 text-xs leading-5 text-zinc-500">
            No recommended quantity for {meta.label} in this demonstration.
          </p>
        )}
      </header>

      <div className="px-6 py-6 sm:px-8 sm:py-7">
        <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
          Evidence
        </h3>

        <EvidenceGrid
          action={action}
        />

        <ReasonCodeList
          codes={action.evidence.reasonCodes}
          watch={
            action.actionType === "WATCH"
          }
        />

        {action.confidenceReasonCodes.length >
          0 && (
          <div className="mt-6">
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Confidence notes
            </h3>
            <ul className="mt-3 space-y-2">
              {action.confidenceReasonCodes.map(
                (code) => (
                  <li
                    key={code}
                    className="text-sm text-zinc-600"
                  >
                    <span className="font-mono text-xs text-zinc-500">
                      {code}
                    </span>
                  </li>
                ),
              )}
            </ul>
          </div>
        )}

        <p className="mt-8 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs leading-5 text-zinc-500">
          Production Approve, Edit, and Dismiss are not available in this milestone. Demonstration controls will communicate that no action was saved.
        </p>
      </div>
    </article>
  );
}

function EvidenceGrid({
  action,
}: {
  action: DemoActionItem;
}) {
  const evidence =
    action.evidence;

  const fields: {
    label: string;
    value: string;
  }[] = [
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
    {
      label: "Safety stock",
      value: formatDemoUnknownNumber(
        evidence.safetyStockUnits,
      ),
    },
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
    {
      label: "Inventory age",
      value: formatDemoUnknownNumber(
        evidence.inventoryAgeDays,
        {
          suffix: " days",
        },
      ),
    },
    {
      label: "Forecast demand",
      value: formatDemoUnknownNumber(
        evidence.forecastExpectedDemandUnits,
      ),
    },
    {
      label: "Data quality",
      value: formatDemoDataQualityScore(
        evidence.dataQualityScore,
      ),
    },
  ];

  return (
    <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
      {fields.map(
        ({
          label,
          value,
        }) => (
          <div
            key={label}
            className="rounded-2xl border border-zinc-100 bg-zinc-50/80 px-3.5 py-3"
          >
            <dt className="text-[11px] font-medium uppercase tracking-[0.1em] text-zinc-500">
              {label}
            </dt>
            <dd
              className={`mt-1.5 text-sm font-semibold tabular-nums tracking-[-0.01em] ${
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

function ReasonCodeList({
  codes,
  watch,
}: {
  codes: string[];
  watch: boolean;
}) {
  return (
    <div className="mt-6">
      <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
        {watch
          ? "Watch reason codes"
          : "Reason codes"}
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
        <ul className="mt-3 flex flex-wrap gap-2">
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
  onClose,
}: {
  action: DemoActionItem;
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
          panelRef.current.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
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
      className="fixed inset-0 z-[90] lg:hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        aria-label="Close decision detail"
        className="absolute inset-0 bg-zinc-950/40 motion-safe:transition-opacity motion-safe:duration-200"
        onClick={onClose}
      />

      <div
        ref={panelRef}
        className="absolute inset-x-0 bottom-0 max-h-[92vh] overflow-y-auto overscroll-contain rounded-t-[1.75rem] bg-[#f7f8f7] shadow-2xl motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:duration-200 motion-reduce:animate-none"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur">
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
            className="flex size-11 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
          >
            <X
              className="size-5"
              aria-hidden="true"
            />
          </button>
        </div>

        <div className="p-4 pb-10 sm:p-5">
          <ActionEvidenceInspector
            action={action}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
