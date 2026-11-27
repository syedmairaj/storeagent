/**
 * AI-ARCH-1c — bounded deterministic orchestrator.
 * Structured intent → literal plan → invokeL1Tool → verified answer or abstention.
 * No NL LLM planner. No writes. No external networking. No PB1 diagnostics.
 */

import { randomUUID } from "node:crypto";

import type {
  AgentFailureCode,
  AgentQuery,
  AgentRunResult,
  AgentTrace,
  CommerceAgentEvidenceBundle,
  MerchantContext,
} from "@/lib/commerce-agent/types";
import { COMMERCE_AGENT_QUERY_VERSION } from "@/lib/commerce-agent/types";
import {
  queryAttemptsTenantOverride,
} from "@/lib/commerce-agent/merchant-context";
import { invokeL1Tool } from "@/lib/commerce-agent/tools/invoke";
import type { L1ToolDeps } from "@/lib/commerce-agent/tools/deps";
import type { L1ToolInvocationResult } from "@/lib/commerce-agent/tools/results";
import { isUuid } from "@/lib/commerce-agent/tools/scope";
import type { MerchantInventoryIntelligenceRow } from "@/lib/inventory-intelligence/types";
import type { MerchantPlanningInputs } from "@/lib/planning-inputs/types";
import type { IncomingTrustClass } from "@/lib/inventory-explainer/types";

import {
  assembleFromEvidenceBundle,
  abstain,
  createAgentTrace,
} from "@/lib/commerce-agent/orchestrator/assemble";
import {
  mayRunCommerceAgent,
  type CommerceAgentServerConfig,
} from "@/lib/commerce-agent/orchestrator/enablement";
import {
  buildDeterministicPlan,
  isOrchestratorSupportedIntent,
  type DeterministicPlan,
} from "@/lib/commerce-agent/orchestrator/plans";
import { validateDeterministicPlan } from "@/lib/commerce-agent/orchestrator/validate-plan";
import { polishCommerceAgentAnswer } from "@/lib/commerce-agent/validation/apply-draft";
import type { CommerceAgentDraftAdapter } from "@/lib/commerce-agent/validation/types";

/** Explicit buy / create / sync language in the query → refuse. */
const FORBIDDEN_ACTION_QUERY_PATTERNS: readonly RegExp[] = [
  /\bbuy\s+now\b/i,
  /\bpurchase\s+now\b/i,
  /\border\s+now\b/i,
  /\bplace\s+(an\s+)?order\b/i,
  /\bcreate\s+(a\s+)?(po|purchase\s+order|reorder)\b/i,
  /\bauto[- ]?buy\b/i,
  /\bsync\s+(now|run|inventory)\b/i,
  /\boauth\b/i,
  /\brevoke\b/i,
  /\benqueue\b/i,
];

export type ResolvedGrain = {
  storeId: string;
  locationId: string;
  variantId: string;
};

export type RunCommerceAgentInput = {
  query: AgentQuery;
  context: MerchantContext;
  deps: L1ToolDeps;
  /**
   * Explicit freshness signal — never assumed false.
   * Caller / future loader must provide; tests inject.
   */
  stockObservationsStale: boolean;
  incomingTrust?: IncomingTrustClass;
  /** Test / future server inject. Default OFF via mayRunCommerceAgent. */
  forceEnabled?: boolean;
  config?: CommerceAgentServerConfig;
  /** Optional override of deterministic plan (tests for forged / unsafe plans). */
  planOverride?: DeterministicPlan;
  /**
   * Optional AI-ARCH-1d offline draft adapter.
   * When omitted, behavior stays deterministic (1c). Live providers are rejected.
   */
  draftAdapter?: CommerceAgentDraftAdapter;
  draftTimeoutMs?: number;
  /** Wall-clock start; defaults to Date.now(). */
  nowMs?: number;
  runId?: string;
};

type TraceStep = AgentTrace["steps"][number];

function pushStep(
  steps: TraceStep[],
  step: Omit<TraceStep, "step"> & { step?: number },
): void {
  steps.push({
    step: step.step ?? steps.length + 1,
    kind: step.kind,
    toolId: step.toolId,
    ok: step.ok,
    latencyMs: step.latencyMs,
    note: step.note,
  });
}

function mapToolFailureCode(code: string): AgentFailureCode {
  switch (code) {
    case "PERMISSION_DENIED":
      return "PERMISSION_DENIED";
    case "TENANT_SCOPE_MISMATCH":
    case "EVIDENCE_MISMATCH":
      return "TENANT_SCOPE_MISMATCH";
    case "TIMEOUT":
      return "TIMEOUT";
    case "FORBIDDEN_TOOL":
    case "WRITE_CAPABILITY_FORBIDDEN":
      return "FORBIDDEN_ACTION_CLAIM";
    case "UNSUPPORTED_TOOL":
      return "INVALID_PLAN";
    case "NOT_FOUND":
      return "INSUFFICIENT_EVIDENCE";
    default:
      return "TOOL_FAILURE";
  }
}

function detectForbiddenActionRequest(query: AgentQuery): boolean {
  const text = `${query.naturalLanguage ?? ""} ${query.questionId ?? ""}`.trim();
  if (!text) {
    return false;
  }
  return FORBIDDEN_ACTION_QUERY_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Resolve store/location/variant from trusted context pins + validated hints.
 * organizationId is never taken from the query.
 */
export function resolveGrainFromTrustedContext(input: {
  context: MerchantContext;
  query: AgentQuery;
}):
  | { ok: true; grain: ResolvedGrain }
  | { ok: false; code: AgentFailureCode; detail: string } {
  const hint = input.query.hintGrain;
  const hintStore = hint?.storeId?.trim() || "";
  const hintLocation = hint?.locationId?.trim() || "";
  const hintVariant = hint?.variantId?.trim() || "";

  // Conflicting hints vs trusted pins fail closed (do not silently ignore).
  if (
    input.context.storeId &&
    hintStore &&
    hintStore !== input.context.storeId
  ) {
    return {
      ok: false,
      code: "TENANT_SCOPE_MISMATCH",
      detail: "storeId hint does not match trusted context.",
    };
  }
  if (
    input.context.locationId &&
    hintLocation &&
    hintLocation !== input.context.locationId
  ) {
    return {
      ok: false,
      code: "TENANT_SCOPE_MISMATCH",
      detail: "locationId hint does not match trusted context.",
    };
  }
  if (
    input.context.variantId &&
    hintVariant &&
    hintVariant !== input.context.variantId
  ) {
    return {
      ok: false,
      code: "TENANT_SCOPE_MISMATCH",
      detail: "variantId hint does not match trusted context.",
    };
  }

  const storeId = input.context.storeId?.trim() || hintStore;
  const locationId = input.context.locationId?.trim() || hintLocation;
  const variantId = input.context.variantId?.trim() || hintVariant;

  if (!storeId || !locationId || !variantId) {
    return {
      ok: false,
      code: "INSUFFICIENT_EVIDENCE",
      detail: "storeId, locationId, and variantId are required.",
    };
  }

  if (!isUuid(storeId) || !isUuid(locationId) || !isUuid(variantId)) {
    return {
      ok: false,
      code: "TENANT_SCOPE_MISMATCH",
      detail: "Grain identifiers must be UUIDs.",
    };
  }

  return { ok: true, grain: { storeId, locationId, variantId } };
}

function finishTrace(
  steps: TraceStep[],
  meta: {
    runId: string;
    clientRequestId: string;
    organizationId: string;
    startedAt: string;
    cancelled?: boolean;
  },
): AgentTrace {
  return createAgentTrace({
    ...meta,
    steps,
    endedAt: new Date().toISOString(),
  });
}

/**
 * Run one bounded commerce-agent investigation.
 * Soft-enable default OFF. Injectable deps only — no live loaders in 1c.
 */
export async function runCommerceAgent(
  input: RunCommerceAgentInput,
): Promise<AgentRunResult> {
  const runStartedMs = Date.now();
  const startedAt = new Date(input.nowMs ?? runStartedMs).toISOString();
  const runId = input.runId ?? randomUUID();
  const steps: TraceStep[] = [];
  const clientRequestId = input.query.clientRequestId;
  const organizationId = input.context.organizationId;

  const enablement = mayRunCommerceAgent({
    organizationId,
    forceEnabled: input.forceEnabled,
    config: input.config,
  });

  if (!enablement.mayRun) {
    pushStep(steps, {
      kind: "respond",
      ok: false,
      note: "agent_disabled",
    });
    return abstain({
      code: "AGENT_DISABLED",
      merchantMessage:
        "The commerce agent is not enabled for this organization.",
      trace: finishTrace(steps, {
        runId,
        clientRequestId,
        organizationId,
        startedAt,
      }),
    });
  }

  if (input.query.schemaVersion !== COMMERCE_AGENT_QUERY_VERSION) {
    pushStep(steps, {
      kind: "plan",
      ok: false,
      note: "unsupported_query_schema",
    });
    return abstain({
      code: "UNSUPPORTED_INTENT",
      merchantMessage: "Unsupported agent query schema.",
      trace: finishTrace(steps, {
        runId,
        clientRequestId,
        organizationId,
        startedAt,
      }),
    });
  }

  if (detectForbiddenActionRequest(input.query)) {
    pushStep(steps, {
      kind: "plan",
      ok: false,
      note: "forbidden_action_request",
    });
    return abstain({
      code: "FORBIDDEN_ACTION_CLAIM",
      merchantMessage:
        "I cannot create purchases, sync runs, or other write actions. Ask for a read-only inventory explanation instead.",
      trace: finishTrace(steps, {
        runId,
        clientRequestId,
        organizationId,
        startedAt,
      }),
    });
  }

  if (queryAttemptsTenantOverride(input.context, input.query)) {
    pushStep(steps, {
      kind: "plan",
      ok: false,
      note: "tenant_override_rejected",
    });
    return abstain({
      code: "TENANT_SCOPE_MISMATCH",
      merchantMessage:
        "The request tried to assert a different organization than your session.",
      trace: finishTrace(steps, {
        runId,
        clientRequestId,
        organizationId,
        startedAt,
      }),
    });
  }

  if (!isOrchestratorSupportedIntent(input.query.intentClass)) {
    pushStep(steps, {
      kind: "plan",
      ok: false,
      note: `unsupported_intent:${input.query.intentClass}`,
    });
    return abstain({
      code: "UNSUPPORTED_INTENT",
      merchantMessage:
        "That question type is not supported yet. Try an inventory fact, data-gap, zero-sales, or reorder-review question.",
      trace: finishTrace(steps, {
        runId,
        clientRequestId,
        organizationId,
        startedAt,
      }),
    });
  }

  const grainResolved = resolveGrainFromTrustedContext({
    context: input.context,
    query: input.query,
  });
  if (!grainResolved.ok) {
    pushStep(steps, {
      kind: "plan",
      ok: false,
      note: grainResolved.detail,
    });
    return abstain({
      code: grainResolved.code,
      merchantMessage:
        "I need a trusted store, location, and variant to investigate this SKU.",
      missingEvidenceLabels: ["storeId", "locationId", "variantId"],
      trace: finishTrace(steps, {
        runId,
        clientRequestId,
        organizationId,
        startedAt,
      }),
    });
  }
  const grain = grainResolved.grain;

  const plan =
    input.planOverride ??
    buildDeterministicPlan(input.query.intentClass);

  if (!plan) {
    pushStep(steps, {
      kind: "plan",
      ok: false,
      note: "plan_build_failed",
    });
    return abstain({
      code: "UNSUPPORTED_INTENT",
      merchantMessage: "No deterministic plan exists for this intent.",
      trace: finishTrace(steps, {
        runId,
        clientRequestId,
        organizationId,
        startedAt,
      }),
    });
  }

  const validated = validateDeterministicPlan({
    plan,
    context: input.context,
  });
  if (!validated.ok) {
    pushStep(steps, {
      kind: "plan",
      ok: false,
      note: `${validated.code}:${validated.detail}`,
    });
    const code: AgentFailureCode =
      validated.code === "PERMISSION_DENIED"
        ? "PERMISSION_DENIED"
        : validated.code === "STEP_LIMIT"
          ? "STEP_LIMIT"
          : validated.code === "FORBIDDEN_TOOL" ||
              validated.code === "WRITE_CAPABILITY_FORBIDDEN"
            ? "FORBIDDEN_ACTION_CLAIM"
            : "INVALID_PLAN";
    return abstain({
      code,
      merchantMessage:
        code === "PERMISSION_DENIED"
          ? "You do not have permission to run this inventory investigation."
          : "The investigation plan is not allowed.",
      trace: finishTrace(steps, {
        runId,
        clientRequestId,
        organizationId,
        startedAt,
      }),
    });
  }

  pushStep(steps, {
    kind: "plan",
    ok: true,
    note: `intent:${plan.intentClass};tools:${plan.steps.map((s) => s.toolId).join(",")}`,
  });

  let planning: MerchantPlanningInputs | null = null;
  let row: MerchantInventoryIntelligenceRow | null = null;
  let bundle: CommerceAgentEvidenceBundle | null = null;

  for (const planStep of plan.steps) {
    if (Date.now() - runStartedMs >= plan.deadlineMs) {
      pushStep(steps, {
        kind: "respond",
        ok: false,
        note: "deadline_exceeded",
      });
      return abstain({
        code: "TIMEOUT",
        merchantMessage:
          "The investigation hit its time budget before finishing safely.",
        evidenceHash: bundle?.evidenceHash,
        missingEvidenceLabels: bundle?.missingLabels,
        nextSteps: bundle?.nextSteps,
        trace: finishTrace(steps, {
          runId,
          clientRequestId,
          organizationId,
          startedAt,
          cancelled: true,
        }),
      });
    }

    if (steps.filter((s) => s.kind === "tool").length >= plan.maxToolCalls) {
      pushStep(steps, {
        kind: "respond",
        ok: false,
        note: "tool_call_budget",
      });
      return abstain({
        code: "STEP_LIMIT",
        merchantMessage: "The investigation exceeded its tool-call budget.",
        evidenceHash: bundle?.evidenceHash,
        trace: finishTrace(steps, {
          runId,
          clientRequestId,
          organizationId,
          startedAt,
          cancelled: true,
        }),
      });
    }

    let toolInput: unknown;
    switch (planStep.toolId) {
      case "planning.get_inputs":
        toolInput = { organizationId };
        break;
      case "inventory.get_sku_intelligence":
        toolInput = {
          storeId: grain.storeId,
          locationId: grain.locationId,
          variantId: grain.variantId,
        };
        break;
      case "inventory.build_explainer_evidence":
        if (!row) {
          pushStep(steps, {
            kind: "tool",
            toolId: planStep.toolId,
            ok: false,
            note: "missing_row_prerequisite",
          });
          return abstain({
            code: "INSUFFICIENT_EVIDENCE",
            merchantMessage:
              "SKU intelligence was not available before evidence mapping.",
            trace: finishTrace(steps, {
              runId,
              clientRequestId,
              organizationId,
              startedAt,
            }),
          });
        }
        toolInput = {
          row,
          stockObservationsStale: input.stockObservationsStale,
          planning,
          incomingTrust: input.incomingTrust ?? "unknown",
        };
        break;
      case "inventory.classify_guidance_situation":
        if (!row) {
          pushStep(steps, {
            kind: "tool",
            toolId: planStep.toolId,
            ok: false,
            note: "missing_row_prerequisite",
          });
          return abstain({
            code: "INSUFFICIENT_EVIDENCE",
            merchantMessage:
              "SKU intelligence was not available before guidance classification.",
            trace: finishTrace(steps, {
              runId,
              clientRequestId,
              organizationId,
              startedAt,
            }),
          });
        }
        toolInput = {
          row,
          stockObservationsStale: input.stockObservationsStale,
          incomingTrust: input.incomingTrust ?? "unknown",
        };
        break;
      default: {
        pushStep(steps, {
          kind: "tool",
          toolId: planStep.toolId,
          ok: false,
          note: "unknown_plan_tool",
        });
        return abstain({
          code: "INVALID_PLAN",
          merchantMessage: "The investigation plan referenced an unknown tool.",
          trace: finishTrace(steps, {
            runId,
            clientRequestId,
            organizationId,
            startedAt,
          }),
        });
      }
    }

    let result: L1ToolInvocationResult;
    try {
      result = await invokeL1Tool({
        toolId: planStep.toolId,
        context: input.context,
        input: toolInput,
        deps: input.deps,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "tool_exception";
      pushStep(steps, {
        kind: "tool",
        toolId: planStep.toolId,
        ok: false,
        note: `exception:${message.slice(0, 80)}`,
      });
      return abstain({
        code: "TOOL_FAILURE",
        merchantMessage:
          "A read tool failed unexpectedly. I will not invent an answer.",
        trace: finishTrace(steps, {
          runId,
          clientRequestId,
          organizationId,
          startedAt,
        }),
      });
    }

    pushStep(steps, {
      kind: "tool",
      toolId: planStep.toolId,
      ok: result.ok,
      latencyMs: result.latencyMs,
      note: result.ok
        ? `exec=success;verify=${result.evidenceVerification};elig=${result.recommendationEligibility}`
        : `exec=failed;code=${result.code}`,
    });

    if (!result.ok) {
      return abstain({
        code: mapToolFailureCode(result.code),
        merchantMessage:
          result.code === "PERMISSION_DENIED"
            ? "You do not have permission to read this inventory evidence."
            : result.code === "TIMEOUT"
              ? "A read tool timed out before evidence was ready."
              : result.code === "TENANT_SCOPE_MISMATCH" ||
                  result.code === "EVIDENCE_MISMATCH"
                ? "The requested SKU does not match your trusted store context."
                : result.code === "NOT_FOUND"
                  ? "I could not find verified inventory evidence for that SKU."
                  : "A required read tool failed. I will not guess.",
        trace: finishTrace(steps, {
          runId,
          clientRequestId,
          organizationId,
          startedAt,
        }),
      });
    }

    if (planStep.toolId === "planning.get_inputs") {
      const output = result.output as {
        planning: MerchantPlanningInputs | null;
      };
      planning = output.planning;
    } else if (planStep.toolId === "inventory.get_sku_intelligence") {
      const output = result.output as {
        row: MerchantInventoryIntelligenceRow;
      };
      row = output.row;
    } else if (planStep.toolId === "inventory.build_explainer_evidence") {
      const output = result.output as {
        bundle: CommerceAgentEvidenceBundle;
      };
      bundle = output.bundle;
      pushStep(steps, {
        kind: "map",
        ok: true,
        note: `evidenceHash:${bundle.evidenceHash};freshness:${bundle.freshnessClass};conflicts:${bundle.conflicts.length}`,
      });
    } else if (planStep.toolId === "inventory.classify_guidance_situation") {
      const output = result.output as { situation: { id: string } };
      pushStep(steps, {
        kind: "analyze",
        ok: true,
        note: `guidance:${output.situation.id}`,
      });
    }
  }

  if (!bundle) {
    pushStep(steps, {
      kind: "verify",
      ok: false,
      note: "no_evidence_bundle",
    });
    return abstain({
      code: "INSUFFICIENT_EVIDENCE",
      merchantMessage:
        "No verified evidence bundle was produced for this investigation.",
      trace: finishTrace(steps, {
        runId,
        clientRequestId,
        organizationId,
        startedAt,
      }),
    });
  }

  pushStep(steps, {
    kind: "verify",
    ok: bundle.conflicts.length === 0 && bundle.findings.some((f) => f.verified),
    note: `findings=${bundle.findings.length};verified=${bundle.findings.filter((f) => f.verified).length}`,
  });

  let outcome = assembleFromEvidenceBundle({
    intentClass: input.query.intentClass,
    bundle,
    trace: finishTrace(steps, {
      runId,
      clientRequestId,
      organizationId,
      startedAt,
    }),
  });

  // AI-ARCH-1d optional polish — never replaces evidence; fails closed to deterministic.
  if (outcome.status === "answered" && input.draftAdapter) {
    const polished = await polishCommerceAgentAnswer({
      baseline: outcome,
      bundle,
      context: input.context,
      adapter: input.draftAdapter,
      timeoutMs: input.draftTimeoutMs,
    });
    if (polished.status === "answered") {
      outcome = polished.answer;
    } else {
      outcome = polished.abstention;
    }
  }

  // Re-attach respond step onto the returned trace.
  const respondSteps = [
    ...outcome.trace.steps,
    {
      step: outcome.trace.steps.length + 1,
      kind: "respond" as const,
      ok: outcome.status === "answered",
      note:
        outcome.status === "answered"
          ? outcome.generator === "ai_validated"
            ? "answered_ai_validated"
            : outcome.generator === "fallback_deterministic"
              ? "answered_fallback_deterministic"
              : "answered_from_verified_evidence"
          : `abstained:${outcome.code}`,
    },
  ];

  return {
    ...outcome,
    trace: {
      ...outcome.trace,
      steps: respondSteps,
      endedAt: new Date().toISOString(),
    },
  };
}
