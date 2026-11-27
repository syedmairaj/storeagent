/**
 * AI-ARCH-1c — plan validation before any tool execution.
 */

import type { MerchantContext } from "@/lib/commerce-agent/types";
import { getL1ToolDefinition } from "@/lib/commerce-agent/tools/definitions";
import {
  isExplicitlyForbiddenToolId,
  isL1ToolId,
} from "@/lib/commerce-agent/tools/ids";
import { contextHasToolPermission } from "@/lib/commerce-agent/tools/scope";
import type { DeterministicPlan } from "@/lib/commerce-agent/orchestrator/plans";
import {
  ORCHESTRATOR_MAX_STEPS,
  ORCHESTRATOR_MAX_TOOL_CALLS,
} from "@/lib/commerce-agent/orchestrator/plans";

export type PlanValidationFailure = {
  ok: false;
  code:
    | "INVALID_PLAN"
    | "UNSUPPORTED_TOOL"
    | "FORBIDDEN_TOOL"
    | "PERMISSION_DENIED"
    | "WRITE_CAPABILITY_FORBIDDEN"
    | "STEP_LIMIT";
  detail: string;
};

export type PlanValidationSuccess = {
  ok: true;
  plan: DeterministicPlan;
};

export function validateDeterministicPlan(input: {
  plan: DeterministicPlan;
  context: MerchantContext;
}): PlanValidationSuccess | PlanValidationFailure {
  const { plan, context } = input;

  if (!plan.steps.length) {
    return { ok: false, code: "INVALID_PLAN", detail: "Plan has no steps." };
  }

  if (plan.steps.length > plan.maxToolCalls) {
    return {
      ok: false,
      code: "STEP_LIMIT",
      detail: `Plan exceeds maxToolCalls (${plan.maxToolCalls}).`,
    };
  }

  if (plan.steps.length > plan.maxSteps || plan.maxSteps > ORCHESTRATOR_MAX_STEPS) {
    return {
      ok: false,
      code: "STEP_LIMIT",
      detail: `Plan exceeds maxSteps (${plan.maxSteps}).`,
    };
  }

  if (plan.maxToolCalls > ORCHESTRATOR_MAX_TOOL_CALLS) {
    return {
      ok: false,
      code: "STEP_LIMIT",
      detail: "maxToolCalls exceeds orchestrator ceiling.",
    };
  }

  const seen = new Set<string>();
  for (const step of plan.steps) {
    const toolId = step.toolId;

    if (isExplicitlyForbiddenToolId(toolId)) {
      return {
        ok: false,
        code: "FORBIDDEN_TOOL",
        detail: `Forbidden tool in plan: ${toolId}`,
      };
    }

    if (!isL1ToolId(toolId)) {
      return {
        ok: false,
        code: "UNSUPPORTED_TOOL",
        detail: `Unknown tool in plan: ${toolId}`,
      };
    }

    const definition = getL1ToolDefinition(toolId);
    if (definition.sideEffectClass !== "read_only") {
      return {
        ok: false,
        code: "WRITE_CAPABILITY_FORBIDDEN",
        detail: `Non-read_only tool in plan: ${toolId}`,
      };
    }

    for (const permission of definition.requiredPermissions) {
      if (!contextHasToolPermission(context, permission)) {
        return {
          ok: false,
          code: "PERMISSION_DENIED",
          detail: `Missing permission ${permission} for ${toolId}`,
        };
      }
    }

    const key = `${step.step}:${toolId}`;
    if (seen.has(key)) {
      return {
        ok: false,
        code: "INVALID_PLAN",
        detail: `Duplicate plan step ${key}`,
      };
    }
    seen.add(key);
  }

  return { ok: true, plan };
}
