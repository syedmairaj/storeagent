/**
 * AI-ARCH-1c — literal deterministic plans for structured intents.
 * No natural-language LLM planner.
 */

import type { AgentIntentClass } from "@/lib/commerce-agent/types";
import type { L1ToolId } from "@/lib/commerce-agent/tools/ids";

export const ORCHESTRATOR_MAX_STEPS = 6 as const;
export const ORCHESTRATOR_DEFAULT_DEADLINE_MS = 8000 as const;
export const ORCHESTRATOR_MAX_TOOL_CALLS = 4 as const;

export type DeterministicPlanStep = {
  step: number;
  /** Must be an L1 tool id after validateDeterministicPlan. */
  toolId: L1ToolId | string;
  /** High-level purpose for traces (no PII). */
  purpose: string;
};

export type DeterministicPlan = {
  intentClass: AgentIntentClass;
  steps: readonly DeterministicPlanStep[];
  maxToolCalls: number;
  maxSteps: number;
  deadlineMs: number;
};

const SUPPORTED_INTENTS = new Set<AgentIntentClass>([
  "inventory_fact",
  "zero_sales_diagnosis",
  "data_gap",
  "reorder_review",
]);

export function isOrchestratorSupportedIntent(
  intent: AgentIntentClass,
): boolean {
  return SUPPORTED_INTENTS.has(intent);
}

/**
 * Build a fixed tool sequence for a supported intent.
 * Grain-specific args are bound later from trusted context + validated hints.
 */
export function buildDeterministicPlan(
  intentClass: AgentIntentClass,
  options?: { deadlineMs?: number; maxSteps?: number },
): DeterministicPlan | null {
  if (!isOrchestratorSupportedIntent(intentClass)) {
    return null;
  }

  const deadlineMs = options?.deadlineMs ?? ORCHESTRATOR_DEFAULT_DEADLINE_MS;
  const maxSteps = options?.maxSteps ?? ORCHESTRATOR_MAX_STEPS;

  // Same four-tool spine for all supported inventory intents.
  // Intent only changes assembly / abstention policy later.
  const steps: DeterministicPlanStep[] = [
    {
      step: 1,
      toolId: "planning.get_inputs",
      purpose: "load_planning_assumptions",
    },
    {
      step: 2,
      toolId: "inventory.get_sku_intelligence",
      purpose: "load_sku_intelligence_grain",
    },
    {
      step: 3,
      toolId: "inventory.build_explainer_evidence",
      purpose: "build_and_map_explainer_evidence",
    },
    {
      step: 4,
      toolId: "inventory.classify_guidance_situation",
      purpose: "classify_guidance_situation",
    },
  ];

  if (steps.length > maxSteps || steps.length > ORCHESTRATOR_MAX_TOOL_CALLS) {
    return null;
  }

  return {
    intentClass,
    steps,
    maxToolCalls: ORCHESTRATOR_MAX_TOOL_CALLS,
    maxSteps,
    deadlineMs,
  };
}
