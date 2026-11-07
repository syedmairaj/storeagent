import type {
  DemoActionItem,
  DemoActionType,
} from "@/lib/demo/m7-decision-demo-fixtures";
import { getM7DecisionDemoFixtureRoot } from "@/lib/demo/m7-decision-demo-fixtures";
import { formatDemoDataQualityScore } from "@/lib/demo/m7-decision-demo-format";

import {
  DECISION_ORDER,
  DECISION_TYPE_UI,
} from "@/components/marketing/decision-type-meta";

export const STORY_STAGES = [
  { id: "problem", label: "Problem", short: "01" },
  { id: "signals", label: "Signals", short: "02" },
  { id: "decision", label: "Decision", short: "03" },
  { id: "control", label: "Review", short: "04" },
] as const;

export type StoryStageId = (typeof STORY_STAGES)[number]["id"];

export type StoryScenario = {
  type: DemoActionType;
  action: DemoActionItem;
  problemTitle: string;
  problemBody: string;
  riskFocus: string;
  causeLine: string;
};

/** Avoid trailing .0; keep one decimal only when needed. */
export function formatStoryNumber(
  value: number | null | undefined,
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "Unknown";
  }
  if (Math.trunc(value) === value) return String(value);
  return value.toFixed(1);
}

export function formatStoryMetric(
  value: number | null | undefined,
  unit?: string,
): string {
  const n = formatStoryNumber(value);
  if (n === "Unknown" || !unit) return n;
  return `${n} ${unit}`;
}

function buildProblem(action: DemoActionItem): Pick<
  StoryScenario,
  "problemTitle" | "problemBody" | "riskFocus" | "causeLine"
> {
  const ui = DECISION_TYPE_UI[action.actionType];
  const e = action.evidence;

  switch (action.actionType) {
    case "REORDER": {
      const gap =
        typeof e.availableQuantity === "number" &&
        typeof e.reorderPointUnits === "number"
          ? e.reorderPointUnits - e.availableQuantity
          : null;
      return {
        problemTitle: "Availability is slipping below policy.",
        problemBody: `${action.productTitle} has ${formatStoryMetric(e.availableQuantity, "units")} on hand vs reorder point ${formatStoryNumber(e.reorderPointUnits)} — ${gap != null && gap > 0 ? `${formatStoryNumber(gap)} units below threshold` : "below policy"} with ${formatStoryMetric(e.leadTimeDays, "days")} lead time (demo sample).`,
        riskFocus: ui.riskLabel,
        causeLine:
          "Thin cover before replenishment can arrive → replenishment decision.",
      };
    }
    case "REDUCE":
      return {
        problemTitle: "Too much stock is sitting idle.",
        problemBody: `${action.productTitle} shows ${formatStoryMetric(e.daysOfStock, "days of stock")} and age ${formatStoryMetric(e.inventoryAgeDays, "days")} with velocity ${formatStoryMetric(e.demandVelocity, "units/day")} — further buying adds exposure (demo sample; no dollar savings claimed).`,
        riskFocus: ui.riskLabel,
        causeLine:
          "Elevated cover + aging inventory → reduce commitment, don’t reorder.",
      };
    case "PROMOTE":
      return {
        problemTitle: "Seasonal stock needs deliberate movement.",
        problemBody: `${action.productTitle} is aging (${formatStoryMetric(e.inventoryAgeDays, "days")}) with soft velocity ${formatStoryMetric(e.demandVelocity, "units/day")} and ${formatStoryMetric(e.daysOfStock, "days of stock")} — a promotion candidate, not a promised uplift (demo sample).`,
        riskFocus: ui.riskLabel,
        causeLine:
          "Soft demand + aging seasonal stock → promote to move inventory.",
      };
    case "WATCH":
      return {
        problemTitle: "Evidence is not complete enough to act.",
        problemBody: `${action.productTitle} has incomplete or conflicting signals (velocity ${formatStoryNumber(e.demandVelocity)}, days of stock ${formatStoryNumber(e.daysOfStock)}, incoming ${formatStoryNumber(e.incomingQuantity)}). Holding is safer than guessing (demo sample).`,
        riskFocus: ui.riskLabel,
        causeLine:
          "Incomplete evidence → watch; do not invent a precise buy or cut.",
      };
  }
}

export function getStoryScenarios(): StoryScenario[] {
  const fixture = getM7DecisionDemoFixtureRoot();
  return DECISION_ORDER.map((type) => {
    const action = fixture.actions.find((a) => a.actionType === type);
    if (!action) {
      throw new Error(`Missing synthetic fixture for ${type}`);
    }
    return {
      type,
      action,
      ...buildProblem(action),
    };
  });
}

export function storySignalNodes(action: DemoActionItem) {
  const e = action.evidence;
  return [
    {
      key: "available",
      label: "Available",
      value: formatStoryMetric(e.availableQuantity, "units"),
      unknown: e.availableQuantity == null || !Number.isFinite(e.availableQuantity),
    },
    {
      key: "velocity",
      label: "Velocity",
      value: formatStoryMetric(e.demandVelocity, "units/day"),
      unknown: e.demandVelocity == null || !Number.isFinite(e.demandVelocity),
    },
    {
      key: "coverage",
      label: "Days of stock",
      value: formatStoryMetric(e.daysOfStock, "days"),
      unknown: e.daysOfStock == null || !Number.isFinite(e.daysOfStock),
    },
    {
      key: "lead",
      label: "Lead time",
      value: formatStoryMetric(e.leadTimeDays, "days"),
      unknown: e.leadTimeDays == null || !Number.isFinite(e.leadTimeDays),
    },
    {
      key: "policy",
      label: "Reorder point",
      value: formatStoryMetric(e.reorderPointUnits, "units"),
      unknown:
        e.reorderPointUnits == null || !Number.isFinite(e.reorderPointUnits),
    },
    {
      key: "health",
      label: "Data health",
      value: formatDemoDataQualityScore(e.dataQualityScore),
      unknown:
        e.dataQualityScore == null || !Number.isFinite(e.dataQualityScore),
    },
  ] as const;
}
