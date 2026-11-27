/**
 * AI-ARCH-1b — bounded L1 tool registry invoke.
 * Literal allowlist only; trusted MerchantContext; injectable offline deps.
 */

import type { MerchantContext } from "@/lib/commerce-agent/types";
import {
  adaptBuildExplainerEvidence,
  adaptClassifyGuidanceSituation,
  adaptGetPlanningInputs,
  adaptGetSkuIntelligence,
} from "@/lib/commerce-agent/tools/adapters";
import { getL1ToolDefinition } from "@/lib/commerce-agent/tools/definitions";
import type { L1ToolDeps } from "@/lib/commerce-agent/tools/deps";
import {
  isExplicitlyForbiddenToolId,
  isL1ToolId,
  type L1ToolId,
} from "@/lib/commerce-agent/tools/ids";
import {
  l1Fail,
  type L1ToolInvocationResult,
} from "@/lib/commerce-agent/tools/results";
import { contextHasToolPermission } from "@/lib/commerce-agent/tools/scope";

export type InvokeL1ToolInput = {
  toolId: string;
  context: MerchantContext;
  input?: unknown;
  deps: L1ToolDeps;
  /** Optional override; defaults to tool definition timeout. */
  timeoutMs?: number;
};

async function raceWithTimeout<T>(
  work: Promise<T>,
  timeoutMs: number,
): Promise<{ kind: "result"; value: T } | { kind: "timeout" }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      work.then((value) => ({ kind: "result" as const, value })),
      new Promise<{ kind: "timeout" }>((resolve) => {
        timer = setTimeout(() => resolve({ kind: "timeout" }), timeoutMs);
      }),
    ]);
    return result;
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

async function dispatchL1Tool(input: {
  toolId: L1ToolId;
  context: MerchantContext;
  raw: unknown;
  deps: L1ToolDeps;
}): Promise<L1ToolInvocationResult> {
  switch (input.toolId) {
    case "inventory.get_sku_intelligence":
      return adaptGetSkuIntelligence({
        context: input.context,
        deps: input.deps,
        raw: input.raw,
      });
    case "inventory.build_explainer_evidence":
      return adaptBuildExplainerEvidence({
        context: input.context,
        raw: input.raw,
      });
    case "inventory.classify_guidance_situation":
      return adaptClassifyGuidanceSituation({
        context: input.context,
        raw: input.raw,
      });
    case "planning.get_inputs":
      return adaptGetPlanningInputs({
        context: input.context,
        deps: input.deps,
        raw: input.raw,
      });
    default: {
      const _exhaustive: never = input.toolId;
      return l1Fail(
        String(_exhaustive),
        "UNSUPPORTED_TOOL",
        "Tool is not registered.",
      );
    }
  }
}

/**
 * Invoke one L1 allowlisted read-only tool.
 * Never executes unlisted, write-capable, or external AI/web tools.
 */
export async function invokeL1Tool(
  input: InvokeL1ToolInput,
): Promise<L1ToolInvocationResult> {
  const started = Date.now();
  const toolIdRaw = (input.toolId ?? "").trim();

  if (!toolIdRaw) {
    return l1Fail("", "MALFORMED_INPUT", "toolId is required.");
  }

  if (isExplicitlyForbiddenToolId(toolIdRaw)) {
    return l1Fail(
      toolIdRaw,
      "FORBIDDEN_TOOL",
      "Tool family is forbidden in L1 read-only registry.",
      Date.now() - started,
    );
  }

  if (!isL1ToolId(toolIdRaw)) {
    return l1Fail(
      toolIdRaw,
      "UNSUPPORTED_TOOL",
      "Tool is not on the L1 allowlist.",
      Date.now() - started,
    );
  }

  const definition = getL1ToolDefinition(toolIdRaw);
  if (definition.sideEffectClass !== "read_only") {
    return l1Fail(
      toolIdRaw,
      "WRITE_CAPABILITY_FORBIDDEN",
      "Only read_only tools may run in L1.",
      Date.now() - started,
    );
  }

  for (const permission of definition.requiredPermissions) {
    if (!contextHasToolPermission(input.context, permission)) {
      return l1Fail(
        toolIdRaw,
        "PERMISSION_DENIED",
        `Missing permission: ${permission}.`,
        Date.now() - started,
      );
    }
  }

  if (!input.deps?.getSkuIntelligence || !input.deps?.getPlanningInputs) {
    return l1Fail(
      toolIdRaw,
      "MALFORMED_INPUT",
      "L1 tool deps are required (no implicit live loaders).",
      Date.now() - started,
    );
  }

  const timeoutMs = input.timeoutMs ?? definition.timeoutMs;
  const raced = await raceWithTimeout(
    dispatchL1Tool({
      toolId: toolIdRaw,
      context: input.context,
      raw: input.input,
      deps: input.deps,
    }),
    timeoutMs,
  );

  if (raced.kind === "timeout") {
    return l1Fail(
      toolIdRaw,
      "TIMEOUT",
      `Tool exceeded ${timeoutMs}ms deadline.`,
      Date.now() - started,
    );
  }

  const result = raced.value;
  return {
    ...result,
    latencyMs: Date.now() - started,
  };
}

/** List registered L1 tool ids (literal allowlist). */
export function listL1ToolIds(): readonly L1ToolId[] {
  return [
    "inventory.get_sku_intelligence",
    "inventory.build_explainer_evidence",
    "inventory.classify_guidance_situation",
    "planning.get_inputs",
  ];
}
