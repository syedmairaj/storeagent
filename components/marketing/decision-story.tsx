"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";

import { DECISION_TYPE_UI } from "@/components/marketing/decision-type-meta";
import {
  STORY_STAGES,
  formatStoryMetric,
  formatStoryNumber,
  getStoryScenarios,
  storySignalNodes,
  type StoryStageId,
} from "@/components/marketing/decision-story-meta";
import {
  advanceStory,
  canAutoAdvance,
  initialStoryPlayback,
  requestPause,
  requestPlay,
  requestReplay,
  stageDurationMs,
  statusLabel,
  takeManualControl,
  type AutoplayGates,
  type StoryPlaybackState,
} from "@/components/marketing/decision-story-playback";
import type { DemoActionType } from "@/lib/demo/m7-decision-demo-fixtures";
import {
  explainDemoReasonCode,
  formatDemoConfidenceLabel,
} from "@/lib/demo/m7-decision-demo-format";
import { cn } from "@/lib/utils";

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return mobile;
}

function useInView(ref: React.RefObject<HTMLElement | null>) {
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) =>
        setInView(entry.isIntersecting && entry.intersectionRatio > 0.25),
      { threshold: [0, 0.25, 0.5] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return inView;
}

function useDocumentHidden() {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const update = () => setHidden(document.visibilityState === "hidden");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  return hidden;
}

function PolicyCompare({
  available,
  reorderPoint,
  target,
  mode,
  reducedMotion,
  leadTimeDays,
  daysOfStock,
}: {
  available: number | null;
  reorderPoint: number | null;
  target: number | null;
  mode: "shortfall" | "excess";
  reducedMotion: boolean;
  leadTimeDays?: number | null;
  daysOfStock?: number | null;
}) {
  const max = Math.max(available ?? 0, reorderPoint ?? 0, target ?? 0, 1);
  const availPct = available == null ? 0 : (available / max) * 100;
  const reorderPct =
    reorderPoint == null ? null : (reorderPoint / max) * 100;
  const gap =
    typeof available === "number" && typeof reorderPoint === "number"
      ? reorderPoint - available
      : null;

  return (
    <div className="mt-3 rounded-xl border border-[var(--sa-frame)] bg-[color-mix(in_srgb,var(--sa-stone)_18%,var(--sa-porcelain))] p-3">
      <div className="mb-1.5 flex justify-between text-[0.62rem] font-semibold uppercase tracking-[0.08em] text-[var(--sa-ink-muted)]">
        <span>
          {mode === "shortfall"
            ? "Available vs reorder threshold"
            : "Excess cover vs policy"}
        </span>
        <span>Sample data</span>
      </div>
      <div className="relative h-3.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--sa-ink)_8%,transparent)]">
        <div
          className={cn(
            "absolute inset-y-0 left-0 rounded-full",
            mode === "shortfall" ? "bg-[var(--sa-insight)]" : "bg-[#e8a35c]",
            !reducedMotion && "sa-bar-fill",
          )}
          style={{ width: `${Math.min(100, availPct)}%` }}
        />
        {reorderPct != null ? (
          <span
            className="absolute top-[-4px] bottom-[-4px] w-0.5 bg-[var(--sa-ink)]"
            style={{ left: `${Math.min(97, reorderPct)}%` }}
            title="Reorder point"
          />
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[0.72rem] text-[var(--sa-ink-muted)]">
        <span>
          Available{" "}
          <strong className="text-[var(--sa-ink)]">
            {formatStoryMetric(available, "units")}
          </strong>
        </span>
        <span>
          Reorder pt{" "}
          <strong className="text-[var(--sa-ink)]">
            {formatStoryMetric(reorderPoint, "units")}
          </strong>
        </span>
        {mode === "shortfall" && gap != null && gap > 0 ? (
          <span className="font-semibold text-[var(--sa-ink)]">
            {formatStoryNumber(gap)} units below threshold
          </span>
        ) : null}
        {mode === "excess" && daysOfStock != null ? (
          <span className="font-semibold text-[var(--sa-ink)]">
            {formatStoryMetric(daysOfStock, "days of stock")}
          </span>
        ) : null}
        {leadTimeDays != null ? (
          <span>Lead time {formatStoryMetric(leadTimeDays, "days")}</span>
        ) : null}
      </div>
    </div>
  );
}

function AgingSoftDemand({
  ageDays,
  daysOfStock,
  velocity,
  reducedMotion,
}: {
  ageDays: number | null;
  daysOfStock: number | null;
  velocity: number | null;
  reducedMotion: boolean;
}) {
  const agePct = Math.min(100, ((ageDays ?? 0) / 60) * 100);
  return (
    <div className="mt-3 space-y-2">
      <div className="rounded-xl border border-[var(--sa-frame)] bg-[color-mix(in_srgb,var(--sa-signal)_12%,var(--sa-porcelain))] p-3">
        <p className="text-[0.62rem] font-semibold uppercase tracking-[0.08em] text-[var(--sa-ink-muted)]">
          Inventory age
        </p>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--sa-ink)_8%,transparent)]">
          <div
            className={cn(
              "h-full rounded-full bg-[var(--sa-signal)]",
              !reducedMotion && "sa-bar-fill",
            )}
            style={{ width: `${agePct}%` }}
          />
        </div>
        <p className="mt-1.5 text-[0.72rem] text-[var(--sa-ink-muted)]">
          <strong className="text-[var(--sa-ink)]">
            {formatStoryMetric(ageDays, "days")}
          </strong>{" "}
          aged ·{" "}
          <strong className="text-[var(--sa-ink)]">
            {formatStoryMetric(daysOfStock, "days of stock")}
          </strong>{" "}
          · velocity{" "}
          <strong className="text-[var(--sa-ink)]">
            {formatStoryMetric(velocity, "units/day")}
          </strong>
        </p>
      </div>
    </div>
  );
}

function IncompleteEvidence({
  available,
  velocity,
  daysOfStock,
  incoming,
  health,
}: {
  available: number | null;
  velocity: number | null;
  daysOfStock: number | null;
  incoming: number | null;
  health: number | null;
}) {
  const rows = [
    { label: "Available", value: formatStoryMetric(available, "units") },
    { label: "Velocity", value: formatStoryMetric(velocity, "units/day") },
    { label: "Days of stock", value: formatStoryMetric(daysOfStock, "days") },
    { label: "Incoming", value: formatStoryNumber(incoming) },
    {
      label: "Data health",
      value:
        health == null || !Number.isFinite(health)
          ? "Unknown"
          : `${Math.round(health * 100)}%`,
    },
  ];
  return (
    <div className="mt-3 rounded-xl border border-dashed border-[var(--sa-frame)] bg-[color-mix(in_srgb,var(--sa-stone)_22%,var(--sa-porcelain))] p-3">
      <p className="text-[0.62rem] font-semibold uppercase tracking-[0.08em] text-[var(--sa-ink-muted)]">
        Evidence completeness
      </p>
      <ul className="mt-2 space-y-1.5">
        {rows.map((row) => {
          const unknown = row.value === "Unknown";
          return (
            <li
              key={row.label}
              className="flex items-center justify-between gap-2 text-[0.75rem]"
            >
              <span className="text-[var(--sa-ink-muted)]">{row.label}</span>
              <span
                className={cn(
                  "font-semibold tabular-nums",
                  unknown
                    ? "rounded-full bg-[var(--sa-stone)] px-2 py-0.5 text-[var(--sa-ink-muted)]"
                    : "text-[var(--sa-ink)]",
                )}
              >
                {row.value}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[0.7rem] leading-snug text-[var(--sa-ink-muted)]">
        Unknown cells block a confident buy or cut — Watch is the grounded call.
      </p>
    </div>
  );
}

export function DecisionStory({
  className,
  id = "demo",
}: {
  className?: string;
  id?: string;
}) {
  const scenarios = getStoryScenarios();
  const reducedMotion = usePrefersReducedMotion();
  const isMobile = useIsMobile();
  const rootRef = useRef<HTMLDivElement>(null);
  const inView = useInView(rootRef);
  const documentHidden = useDocumentHidden();
  const labelId = useId();
  const timerRef = useRef<number | null>(null);

  const [scenarioType, setScenarioType] = useState<DemoActionType>("REORDER");
  const [playback, setPlayback] = useState<StoryPlaybackState>(
    initialStoryPlayback,
  );
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  // Mobile / reduced-motion: keep manual; do not autoplay
  const manualOnly = reducedMotion || isMobile;

  const scenario =
    scenarios.find((s) => s.type === scenarioType) ?? scenarios[0];
  const stage = STORY_STAGES[playback.stageIndex];
  const ui = DECISION_TYPE_UI[scenario.type];
  const Icon = ui.Icon;
  const signals = storySignalNodes(scenario.action);

  const gates: AutoplayGates = {
    inView,
    reducedMotion: reducedMotion || manualOnly,
    isMobile,
    documentHidden,
    hovered,
    focused,
  };
  const autoplayActive = canAutoAdvance(playback, gates);
  const dwellMs = stageDurationMs(playback.stageIndex);

  useEffect(() => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!autoplayActive) return;
    timerRef.current = window.setTimeout(() => {
      setPlayback((s) => advanceStory(s));
    }, dwellMs);
    return () => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [
    autoplayActive,
    dwellMs,
    playback.stageIndex,
    playback.cycleCount,
    playback.mode,
    scenarioType,
  ]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      setPlayback((s) =>
        takeManualControl(s, {
          stageIndex: Math.min(s.stageIndex + 1, STORY_STAGES.length - 1),
        }),
      );
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      setPlayback((s) =>
        takeManualControl(s, {
          stageIndex: Math.max(s.stageIndex - 1, 0),
        }),
      );
    } else if (e.key === " ") {
      e.preventDefault();
      if (reducedMotion || isMobile) return;
      setPlayback((s) =>
        s.wantsPlay && s.mode === "auto" ? requestPause(s) : requestPlay(s),
      );
    }
  };

  const stageId = stage.id as StoryStageId;
  const showPlayIcon = manualOnly
    ? true
    : !(
        autoplayActive ||
        (playback.wantsPlay && playback.mode === "auto")
      );

  return (
    <div
      ref={rootRef}
      id={id}
      tabIndex={0}
      className={cn(
        "relative mx-auto w-full max-w-[40rem] scroll-mt-24 outline-none lg:max-w-none",
        className,
      )}
      onKeyDown={onKeyDown}
    >
      <div
        aria-hidden="true"
        className="absolute -inset-3 rounded-[1.85rem] bg-[radial-gradient(ellipse_at_20%_15%,color-mix(in_srgb,var(--sa-insight)_18%,transparent),transparent_55%),radial-gradient(ellipse_at_90%_80%,color-mix(in_srgb,var(--sa-signal)_14%,transparent),transparent_50%)]"
      />

      <div
        className="relative overflow-hidden rounded-[1.35rem] border border-[var(--sa-frame)] bg-[var(--sa-porcelain)] shadow-[0_28px_56px_-28px_color-mix(in_srgb,var(--sa-ink)_46%,transparent)]"
        role="region"
        aria-labelledby={labelId}
        aria-roledescription="Interactive decision story"
        data-story-stage={playback.stageIndex}
        data-story-cycle={playback.cycleCount}
        data-story-mode={playback.mode}
        data-story-playing={autoplayActive ? "1" : "0"}
      >
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--sa-frame)] bg-[color-mix(in_srgb,var(--sa-ink)_3%,var(--sa-porcelain))] px-3.5 py-2.5 sm:px-4">
          <div className="min-w-0">
            <p
              id={labelId}
              className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[var(--sa-ink-muted)]"
            >
              How a recommendation is made
            </p>
            <p className="truncate text-sm font-semibold text-[var(--sa-ink)]">
              Problem → why → decision → your review
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-[color-mix(in_srgb,var(--sa-signal)_55%,var(--sa-frame))] bg-[color-mix(in_srgb,var(--sa-signal)_28%,var(--sa-porcelain))] px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-[0.08em] text-[var(--sa-ink)]">
            Demo sample data
          </span>
        </div>

        {/* Scenario selector */}
        <div
          role="tablist"
          aria-label="Hero decision story scenarios"
          className="flex gap-1.5 overflow-x-auto border-b border-[var(--sa-frame)] px-3 py-2.5 sm:px-4"
        >
          {scenarios.map((s) => {
            const meta = DECISION_TYPE_UI[s.type];
            const selected = s.type === scenarioType;
            const TabIcon = meta.Icon;
            return (
              <button
                key={s.type}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-label={`Story scenario ${meta.label}`}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.72rem] font-semibold transition-colors",
                  selected
                    ? "bg-[var(--sa-ink)] text-[var(--sa-porcelain)]"
                    : "bg-[var(--sa-ink-soft)] text-[var(--sa-ink)] hover:bg-[color-mix(in_srgb,var(--sa-ink)_12%,transparent)]",
                )}
                onClick={() => {
                  setScenarioType(s.type);
                  setPlayback(requestReplay());
                }}
              >
                <TabIcon className="size-3.5" aria-hidden="true" />
                {meta.label}
              </button>
            );
          })}
        </div>

        {/* Stage progress — desktop rail / mobile compact */}
        <div className="border-b border-[var(--sa-frame)] px-3 py-2.5 sm:px-4">
          <ol className="flex items-center gap-1 sm:gap-2">
            {STORY_STAGES.map((s, i) => {
              const active = i === playback.stageIndex;
              const done = i < playback.stageIndex;
              return (
                <li key={s.id} className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-1.5 rounded-lg px-1.5 py-1 text-left transition-colors sm:px-2",
                      active
                        ? "bg-[color-mix(in_srgb,var(--sa-insight)_12%,transparent)]"
                        : "hover:bg-[var(--sa-ink-soft)]",
                    )}
                    aria-current={active ? "step" : undefined}
                    onClick={() => {
                      setPlayback((s) =>
                        takeManualControl(s, { stageIndex: i }),
                      );
                    }}
                  >
                    <span
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-bold",
                        active || done
                          ? "bg-[var(--sa-ink)] text-[var(--sa-porcelain)]"
                          : "bg-[var(--sa-stone)] text-[var(--sa-ink)]",
                      )}
                    >
                      {s.short}
                    </span>
                    <span
                      className={cn(
                        "hidden truncate text-[0.7rem] font-semibold sm:inline",
                        active ? "text-[var(--sa-ink)]" : "text-[var(--sa-ink-muted)]",
                      )}
                    >
                      {s.label}
                    </span>
                  </button>
                  {i < STORY_STAGES.length - 1 ? (
                    <span
                      aria-hidden="true"
                      className={cn(
                        "hidden h-px w-3 shrink-0 sm:block md:w-5",
                        done ? "bg-[var(--sa-ink)]" : "bg-[var(--sa-frame)]",
                      )}
                    />
                  ) : null}
                </li>
              );
            })}
          </ol>
          {autoplayActive ? (
            <div
              key={`${scenarioType}-${playback.stageIndex}-${playback.cycleCount}-${dwellMs}`}
              className="mt-2 h-0.5 overflow-hidden rounded-full bg-[var(--sa-ink-soft)]"
              aria-hidden="true"
            >
              <div
                className="sa-story-progress-bar h-full bg-[var(--sa-insight)]"
                style={{ animationDuration: `${dwellMs}ms` }}
              />
            </div>
          ) : (
            <div
              className="mt-2 h-0.5 rounded-full bg-[var(--sa-ink-soft)]"
              aria-hidden="true"
            />
          )}
        </div>

        {/* Stage canvas — hover/focus here pauses autoplay without blocking Play controls */}
        <div
          className="relative min-h-[16.5rem] p-3.5 sm:min-h-[17.5rem] sm:p-4"
          aria-live="polite"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocusCapture={() => setFocused(true)}
          onBlurCapture={(e) => {
            if (
              !e.currentTarget.contains(e.relatedTarget as Node | null)
            ) {
              setFocused(false);
            }
          }}
        >
          <div
            key={`${scenarioType}-${stageId}`}
            className={cn(!reducedMotion && "sa-panel-swap")}
          >
            {stageId === "problem" ? (
              <div>
                <p className="text-[0.65rem] font-bold uppercase tracking-[0.12em] text-[var(--sa-insight)]">
                  {scenario.riskFocus} · demo sample
                </p>
                <h3 className="mt-1.5 font-display text-[1.2rem] font-semibold tracking-[-0.02em] text-[var(--sa-ink)] sm:text-[1.3rem]">
                  {scenario.problemTitle}
                </h3>
                <p className="mt-1.5 text-sm font-semibold text-[var(--sa-ink)]">
                  {scenario.action.productTitle}
                  <span className="font-normal text-[var(--sa-ink-muted)]">
                    {" "}
                    · {scenario.action.variantTitle}
                  </span>
                </p>
                <p className="mt-2 text-[0.85rem] leading-relaxed text-[var(--sa-ink-muted)]">
                  {scenario.problemBody}
                </p>
                <p className="mt-2 rounded-lg bg-[color-mix(in_srgb,var(--sa-insight)_10%,transparent)] px-2.5 py-1.5 text-[0.72rem] font-medium text-[var(--sa-ink)]">
                  {scenario.causeLine}
                </p>
                {scenario.type === "REORDER" ? (
                  <PolicyCompare
                    mode="shortfall"
                    available={scenario.action.evidence.availableQuantity}
                    reorderPoint={scenario.action.evidence.reorderPointUnits}
                    target={scenario.action.evidence.targetStockUnits}
                    leadTimeDays={scenario.action.evidence.leadTimeDays}
                    reducedMotion={reducedMotion}
                  />
                ) : null}
                {scenario.type === "REDUCE" ? (
                  <PolicyCompare
                    mode="excess"
                    available={scenario.action.evidence.availableQuantity}
                    reorderPoint={scenario.action.evidence.reorderPointUnits}
                    target={scenario.action.evidence.targetStockUnits}
                    daysOfStock={scenario.action.evidence.daysOfStock}
                    reducedMotion={reducedMotion}
                  />
                ) : null}
                {scenario.type === "PROMOTE" ? (
                  <AgingSoftDemand
                    ageDays={scenario.action.evidence.inventoryAgeDays}
                    daysOfStock={scenario.action.evidence.daysOfStock}
                    velocity={scenario.action.evidence.demandVelocity}
                    reducedMotion={reducedMotion}
                  />
                ) : null}
                {scenario.type === "WATCH" ? (
                  <IncompleteEvidence
                    available={scenario.action.evidence.availableQuantity}
                    velocity={scenario.action.evidence.demandVelocity}
                    daysOfStock={scenario.action.evidence.daysOfStock}
                    incoming={scenario.action.evidence.incomingQuantity}
                    health={scenario.action.evidence.dataQualityScore}
                  />
                ) : null}
              </div>
            ) : null}

            {stageId === "signals" ? (
              <div>
                <p className="text-[0.65rem] font-bold uppercase tracking-[0.12em] text-[var(--sa-insight)]">
                  Why StoreAgent recommends this
                </p>
                <p className="mt-1 text-[0.85rem] text-[var(--sa-ink-muted)]">
                  Built from sample stock and sales data — not a live store.
                </p>
                <svg
                  className="mt-2 hidden h-7 w-full text-[var(--sa-insight)] sm:block"
                  viewBox="0 0 400 24"
                  aria-hidden="true"
                >
                  <path
                    d="M8 12 H392"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeDasharray="4 5"
                    className={cn(!reducedMotion && "sa-signal-dash")}
                    opacity="0.55"
                  />
                  {[40, 120, 200, 280, 360].map((x) => (
                    <circle
                      key={x}
                      cx={x}
                      cy="12"
                      r="3.5"
                      fill="var(--sa-porcelain)"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                  ))}
                </svg>
                <ul className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {signals.map((node, i) => (
                    <li
                      key={node.key}
                      className={cn(
                        "rounded-xl border px-2.5 py-2",
                        node.unknown
                          ? "border-dashed border-[var(--sa-frame)] bg-[color-mix(in_srgb,var(--sa-stone)_28%,var(--sa-porcelain))]"
                          : "border-[var(--sa-frame)] bg-[var(--sa-porcelain)]",
                        !reducedMotion && "sa-signal-node",
                      )}
                      style={
                        reducedMotion
                          ? undefined
                          : { animationDelay: `${i * 60}ms` }
                      }
                    >
                      <p className="text-[0.58rem] font-semibold uppercase tracking-[0.08em] text-[var(--sa-ink-muted)]">
                        {node.label}
                      </p>
                      <p
                        className={cn(
                          "mt-0.5 font-display text-base font-semibold leading-snug tabular-nums sm:text-lg",
                          node.unknown
                            ? "text-[var(--sa-ink-muted)]"
                            : "text-[var(--sa-ink)]",
                        )}
                      >
                        {node.value}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {stageId === "decision" ? (
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[0.75rem] font-bold uppercase tracking-[0.06em]",
                      ui.chip,
                    )}
                  >
                    <Icon className="size-3.5" aria-hidden="true" />
                    {ui.label}
                  </span>
                  <span className="text-[0.72rem] text-[var(--sa-ink-muted)]">
                    Fixture confidence ·{" "}
                    {formatDemoConfidenceLabel(scenario.action.confidence)}
                  </span>
                </div>
                <h3 className="mt-2.5 font-display text-xl font-semibold tracking-[-0.02em] sm:text-[1.45rem]">
                  {scenario.type === "WATCH"
                    ? "Hold — Watch"
                    : `Recommended: ${ui.label}`}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--sa-ink)]">
                  {scenario.action.conciseReason}
                </p>
                <p className="mt-2 text-[0.72rem] font-medium text-[var(--sa-ink-muted)]">
                  {scenario.causeLine}
                </p>
                {scenario.action.recommendedQuantity != null ? (
                  <p className="mt-2.5 rounded-xl border border-[var(--sa-frame)] bg-[color-mix(in_srgb,var(--sa-insight)_10%,var(--sa-porcelain))] px-3 py-2 text-sm">
                    Suggested quantity{" "}
                    <strong className="tabular-nums">
                      {formatStoryMetric(
                        scenario.action.recommendedQuantity,
                        "units",
                      )}
                    </strong>{" "}
                    <span className="text-[var(--sa-ink-muted)]">
                      (demo sample)
                    </span>
                  </p>
                ) : (
                  <p className="mt-2.5 text-sm text-[var(--sa-ink-muted)]">
                    {scenario.type === "WATCH"
                      ? "No buy or cut quantity — waiting is the decision."
                      : "No suggested buy quantity in this sample — the call is directional."}
                  </p>
                )}
                <ul className="mt-2.5 space-y-1">
                  {scenario.action.evidence.reasonCodes.map((code) => (
                    <li
                      key={code}
                      className="text-xs leading-snug text-[var(--sa-ink-muted)]"
                    >
                      <span className="text-[var(--sa-insight)]">·</span>{" "}
                      {explainDemoReasonCode(code)}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {stageId === "control" ? (
              <div>
                <p className="text-[0.65rem] font-bold uppercase tracking-[0.12em] text-[var(--sa-insight)]">
                  Merchant control
                </p>
                <h3 className="mt-2 font-display text-xl font-semibold tracking-[-0.02em]">
                  Review before anything moves.
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--sa-ink-muted)]">
                  StoreAgent surfaces the recommendation with evidence. Accept,
                  edit, and defer run in the signed-in Actions workspace with
                  the same demo sample data — this story does not simulate a
                  completed order.
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-[color-mix(in_srgb,var(--sa-insight)_14%,transparent)] px-2.5 py-1 text-[0.7rem] font-semibold text-[var(--sa-ink)]">
                    Pending merchant review
                  </span>
                  <span className="rounded-full border border-[var(--sa-frame)] px-2.5 py-1 text-[0.7rem] font-medium text-[var(--sa-ink-muted)]">
                    {ui.label} · {scenario.action.productTitle}
                  </span>
                </div>
                <a
                  href="/login?next=/app"
                  className="group mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--sa-ink)] px-4 py-2.5 text-sm font-semibold text-[var(--sa-porcelain)] transition-[transform,background] hover:bg-[color-mix(in_srgb,var(--sa-ink)_90%,var(--sa-insight))] active:translate-y-px sm:w-auto"
                >
                  Open interactive demo
                  <ArrowUpRight
                    className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                    aria-hidden="true"
                  />
                </a>
              </div>
            ) : null}
          </div>
        </div>

        {/* Transport controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--sa-frame)] bg-[color-mix(in_srgb,var(--sa-ink)_2%,var(--sa-porcelain))] px-3 py-2.5 sm:px-4">
          <div
            role="group"
            aria-label="Hero decision story playback"
            className="flex items-center gap-1"
          >
            <button
              type="button"
              className="inline-flex size-9 items-center justify-center rounded-full border border-[var(--sa-frame)] bg-[var(--sa-porcelain)] text-[var(--sa-ink)] hover:bg-[var(--sa-ink-soft)]"
              aria-label="Previous stage"
              onClick={() =>
                setPlayback((s) =>
                  takeManualControl(s, {
                    stageIndex: Math.max(s.stageIndex - 1, 0),
                  }),
                )
              }
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="inline-flex size-9 items-center justify-center rounded-full border border-[var(--sa-frame)] bg-[var(--sa-porcelain)] text-[var(--sa-ink)] hover:bg-[var(--sa-ink-soft)] disabled:opacity-40"
              aria-label={
                manualOnly
                  ? "Autoplay unavailable — use next and previous"
                  : playback.mode === "complete"
                    ? "Replay story"
                    : autoplayActive || playback.wantsPlay
                      ? "Pause story"
                      : "Play story"
              }
              disabled={manualOnly}
              onClick={() =>
                setPlayback((s) =>
                  s.mode === "complete"
                    ? requestReplay()
                    : s.wantsPlay && s.mode === "auto"
                      ? requestPause(s)
                      : requestPlay(s),
                )
              }
            >
              {showPlayIcon ? (
                <Play className="size-4" aria-hidden="true" />
              ) : (
                <Pause className="size-4" aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              className="inline-flex size-9 items-center justify-center rounded-full border border-[var(--sa-frame)] bg-[var(--sa-porcelain)] text-[var(--sa-ink)] hover:bg-[var(--sa-ink-soft)]"
              aria-label="Next stage"
              onClick={() =>
                setPlayback((s) =>
                  takeManualControl(s, {
                    stageIndex: Math.min(
                      s.stageIndex + 1,
                      STORY_STAGES.length - 1,
                    ),
                  }),
                )
              }
            >
              <ChevronRight className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="inline-flex size-9 items-center justify-center rounded-full border border-[var(--sa-frame)] bg-[var(--sa-porcelain)] text-[var(--sa-ink)] hover:bg-[var(--sa-ink-soft)]"
              aria-label="Replay story from start"
              onClick={() => setPlayback(requestReplay())}
            >
              <RotateCcw className="size-3.5" aria-hidden="true" />
            </button>
          </div>
          <p className="max-w-[15rem] text-[0.62rem] leading-snug text-[var(--sa-ink-muted)] sm:max-w-none">
            {statusLabel(playback, gates, autoplayActive)}{" "}
            <span className="hidden sm:inline">← → · Space</span>
          </p>
        </div>
      </div>
    </div>
  );
}
