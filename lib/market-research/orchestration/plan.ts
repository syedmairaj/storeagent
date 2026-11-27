/**
 * AI-MKT-1d — literal bounded research plan.
 * No NL LLM planner. No recursive / deep-research expansion.
 */

import type { ResearchDepth } from "@/lib/market-research/types";
import {
  RESEARCH_ARCH_MAX_STEPS,
  RESEARCH_ARCH_MAX_TOOL_CALLS,
  type ResearchExecutionBounds,
  type ResearchPlanStep,
} from "@/lib/market-research/orchestration/types";

export type ResearchPlan = {
  steps: readonly ResearchPlanStep[];
  bounds: ResearchExecutionBounds;
  depth: ResearchDepth;
};

/**
 * Fixed six-step spine. Exactly one step counts as a tool call (retrieve).
 * Depth "deep" is structurally refused (uncontrolled deep research).
 */
export function buildBoundedResearchPlan(input: {
  depth: ResearchDepth;
  bounds: ResearchExecutionBounds;
}):
  | { ok: true; plan: ResearchPlan }
  | {
      ok: false;
      code: "DEEP_RESEARCH_FORBIDDEN" | "BOUNDS_EXCEEDED" | "RECURSIVE_PLAN_FORBIDDEN";
      detail: string;
    } {
  if (input.depth === "deep") {
    return {
      ok: false,
      code: "DEEP_RESEARCH_FORBIDDEN",
      detail: "Depth 'deep' is forbidden; no uncontrolled deep research execution",
    };
  }

  if (
    input.bounds.maxSteps > RESEARCH_ARCH_MAX_STEPS ||
    input.bounds.maxToolCalls > RESEARCH_ARCH_MAX_TOOL_CALLS
  ) {
    return {
      ok: false,
      code: "BOUNDS_EXCEEDED",
      detail: "Resolved bounds exceed AI-ARCH ceilings",
    };
  }

  const steps: ResearchPlanStep[] = [
    { step: 1, kind: "admit", purpose: "admit_trusted_request", countsAsToolCall: false },
    { step: 2, kind: "retrieve", purpose: "invoke_offline_adapter", countsAsToolCall: true },
    { step: 3, kind: "normalize", purpose: "normalize_adapter_evidence", countsAsToolCall: false },
    { step: 4, kind: "analyze", purpose: "validate_material_claims", countsAsToolCall: false },
    { step: 5, kind: "synthesize", purpose: "deterministic_or_draft_synthesis", countsAsToolCall: false },
    { step: 6, kind: "finalize", purpose: "seal_safe_response", countsAsToolCall: false },
  ];

  if (steps.length > input.bounds.maxSteps) {
    return {
      ok: false,
      code: "BOUNDS_EXCEEDED",
      detail: `Plan steps (${steps.length}) exceed maxSteps (${input.bounds.maxSteps})`,
    };
  }

  const toolCalls = steps.filter((s) => s.countsAsToolCall).length;
  if (toolCalls > input.bounds.maxToolCalls) {
    return {
      ok: false,
      code: "BOUNDS_EXCEEDED",
      detail: `Plan tool calls (${toolCalls}) exceed maxToolCalls (${input.bounds.maxToolCalls})`,
    };
  }

  return {
    ok: true,
    plan: {
      steps,
      bounds: input.bounds,
      depth: input.depth,
    },
  };
}

/** Reject any attempt to append recursive / multi-hop plan steps. */
export function assertNoRecursivePlanExpansion(
  existing: readonly ResearchPlanStep[],
  proposedExtra: readonly ResearchPlanStep[],
): { ok: true } | { ok: false; code: "RECURSIVE_PLAN_FORBIDDEN"; detail: string } {
  if (proposedExtra.length > 0) {
    return {
      ok: false,
      code: "RECURSIVE_PLAN_FORBIDDEN",
      detail: "Recursive planning / plan expansion is forbidden in AI-MKT-1d",
    };
  }
  if (existing.length > RESEARCH_ARCH_MAX_STEPS) {
    return {
      ok: false,
      code: "RECURSIVE_PLAN_FORBIDDEN",
      detail: "Existing plan already exceeds ARCH step ceiling",
    };
  }
  return { ok: true };
}
