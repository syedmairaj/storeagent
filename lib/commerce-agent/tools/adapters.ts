/**
 * AI-ARCH-1b — pure / port-backed adapters for L1 tools.
 * Reuses AI-INV builders; never invents metrics or writes data.
 */

import { buildInventoryExplainerEvidence } from "@/lib/inventory-explainer/build-evidence";
import { classifyGuidanceSituation } from "@/lib/inventory-explainer/guidance-situation";
import type {
  IncomingTrustClass,
  InventoryExplainerEvidence,
} from "@/lib/inventory-explainer/types";
import type { GuidanceSituation } from "@/lib/inventory-explainer/guidance-situation";
import type { MerchantInventoryIntelligenceRow } from "@/lib/inventory-intelligence/types";
import type { MerchantPlanningInputs } from "@/lib/planning-inputs/types";
import type { MerchantContext } from "@/lib/commerce-agent/types";
import {
  mapInventoryExplainerEvidence,
} from "@/lib/commerce-agent/map-inventory-explainer-evidence";
import type { CommerceAgentEvidenceBundle } from "@/lib/commerce-agent/types";
import type { L1ToolDeps } from "@/lib/commerce-agent/tools/deps";
import { assertGrainScope, isUuid } from "@/lib/commerce-agent/tools/scope";
import {
  l1Fail,
  type L1ToolFailure,
  type L1ToolSuccess,
} from "@/lib/commerce-agent/tools/results";

function requireStringField(
  value: unknown,
  field: string,
): string | L1ToolFailure {
  if (typeof value !== "string" || !value.trim()) {
    return l1Fail(
      "inventory.get_sku_intelligence",
      "MALFORMED_INPUT",
      `${field} is required.`,
    );
  }
  const trimmed = value.trim();
  if (!isUuid(trimmed)) {
    return l1Fail(
      "inventory.get_sku_intelligence",
      "MALFORMED_INPUT",
      `${field} must be a UUID.`,
    );
  }
  return trimmed;
}

export type GetSkuIntelligenceInput = {
  storeId: string;
  locationId: string;
  variantId: string;
  /** Ignored for authority — must match context when present. */
  organizationId?: string;
};

export type GetSkuIntelligenceOutput = {
  row: MerchantInventoryIntelligenceRow;
};

export async function adaptGetSkuIntelligence(input: {
  context: MerchantContext;
  deps: L1ToolDeps;
  raw: unknown;
}): Promise<
  L1ToolSuccess<GetSkuIntelligenceOutput> | L1ToolFailure
> {
  const toolId = "inventory.get_sku_intelligence";
  if (!input.raw || typeof input.raw !== "object") {
    return l1Fail(toolId, "MALFORMED_INPUT", "Input must be an object.");
  }
  const raw = input.raw as Record<string, unknown>;

  const storeId = requireStringField(raw.storeId, "storeId");
  if (typeof storeId !== "string") {
    return { ...storeId, toolId };
  }
  const locationId = requireStringField(raw.locationId, "locationId");
  if (typeof locationId !== "string") {
    return { ...locationId, toolId };
  }
  const variantId = requireStringField(raw.variantId, "variantId");
  if (typeof variantId !== "string") {
    return { ...variantId, toolId };
  }

  const scope = assertGrainScope(input.context, {
    organizationId: raw.organizationId,
    storeId,
    locationId,
    variantId,
  });
  if (!scope.ok) {
    return l1Fail(toolId, scope.code, scope.detail);
  }

  const row = await input.deps.getSkuIntelligence({
    organizationId: input.context.organizationId,
    storeId,
    locationId,
    variantId,
  });

  if (!row) {
    return l1Fail(toolId, "NOT_FOUND", "SKU intelligence grain not found.");
  }

  if (row.organizationId !== input.context.organizationId) {
    return l1Fail(
      toolId,
      "TENANT_SCOPE_MISMATCH",
      "Loaded row organization does not match trusted context.",
    );
  }
  if (
    row.storeId !== storeId ||
    row.locationId !== locationId ||
    row.variantId !== variantId
  ) {
    return l1Fail(
      toolId,
      "EVIDENCE_MISMATCH",
      "Loaded row grain does not match requested store/location/variant.",
    );
  }

  const partial =
    row.availableQuantity === null ||
    row.metricDate === null ||
    row.coverStatus === "missing_metric" ||
    row.coverStatus === "unknown_stock" ||
    row.coverStatus === "pending_freshness";

  return {
    ok: true,
    toolId,
    latencyMs: 0,
    execution: "success",
    evidenceVerification: partial ? "partial" : "verified",
    recommendationEligibility: "explain_only",
    evidenceIds: [`sku:${row.grainKey}`],
    output: { row },
  };
}

export type BuildExplainerEvidenceInput = {
  row: MerchantInventoryIntelligenceRow;
  stockObservationsStale: boolean;
  planning?: MerchantPlanningInputs | null;
  incomingTrust?: IncomingTrustClass;
};

export type BuildExplainerEvidenceOutput = {
  evidence: InventoryExplainerEvidence;
  bundle: CommerceAgentEvidenceBundle;
};

export async function adaptBuildExplainerEvidence(input: {
  context: MerchantContext;
  raw: unknown;
}): Promise<
  L1ToolSuccess<BuildExplainerEvidenceOutput> | L1ToolFailure
> {
  const toolId = "inventory.build_explainer_evidence";
  if (!input.raw || typeof input.raw !== "object") {
    return l1Fail(toolId, "MALFORMED_INPUT", "Input must be an object.");
  }
  const raw = input.raw as Record<string, unknown>;
  const row = raw.row as MerchantInventoryIntelligenceRow | undefined;
  if (!row || typeof row !== "object") {
    return l1Fail(toolId, "MALFORMED_INPUT", "row is required.");
  }
  if (typeof raw.stockObservationsStale !== "boolean") {
    return l1Fail(
      toolId,
      "MALFORMED_INPUT",
      "stockObservationsStale boolean is required (no assumed freshness).",
    );
  }

  const scope = assertGrainScope(input.context, {
    organizationId: row.organizationId,
    storeId: row.storeId,
    locationId: row.locationId,
    variantId: row.variantId,
  });
  if (!scope.ok) {
    return l1Fail(toolId, scope.code, scope.detail);
  }

  if (row.organizationId !== input.context.organizationId) {
    return l1Fail(
      toolId,
      "TENANT_SCOPE_MISMATCH",
      "Row organization does not match trusted context.",
    );
  }

  let evidence: InventoryExplainerEvidence;
  try {
    evidence = buildInventoryExplainerEvidence({
      row,
      organizationId: input.context.organizationId,
      stockObservationsStale: raw.stockObservationsStale,
      planning: (raw.planning as MerchantPlanningInputs | null | undefined) ?? null,
      incomingTrust:
        (raw.incomingTrust as IncomingTrustClass | undefined) ?? "unknown",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "build_failed";
    if (message === "TENANT_SCOPE_MISMATCH") {
      return l1Fail(toolId, "TENANT_SCOPE_MISMATCH", message);
    }
    return l1Fail(toolId, "MALFORMED_OUTPUT", message);
  }

  if (evidence.organizationId !== input.context.organizationId) {
    return l1Fail(
      toolId,
      "EVIDENCE_MISMATCH",
      "Built evidence organization does not match trusted context.",
    );
  }
  if (
    evidence.storeId !== row.storeId ||
    evidence.locationId !== row.locationId ||
    evidence.variantId !== row.variantId
  ) {
    return l1Fail(
      toolId,
      "EVIDENCE_MISMATCH",
      "Built evidence grain does not match input row.",
    );
  }

  const mapped = mapInventoryExplainerEvidence({
    evidence,
    context: input.context,
  });
  if (!mapped.ok) {
    return l1Fail(toolId, "EVIDENCE_MISMATCH", mapped.error);
  }

  const verification =
    mapped.bundle.missingLabels.length > 0 ||
    mapped.bundle.freshnessClass === "stale" ||
    mapped.bundle.conflicts.length > 0
      ? "partial"
      : "verified";

  return {
    ok: true,
    toolId,
    latencyMs: 0,
    execution: "success",
    evidenceVerification: verification,
    recommendationEligibility: "explain_only",
    evidenceIds: mapped.bundle.evidence.map((e) => e.evidenceId),
    output: { evidence, bundle: mapped.bundle },
  };
}

export type ClassifyGuidanceOutput = {
  situation: GuidanceSituation;
};

export async function adaptClassifyGuidanceSituation(input: {
  context: MerchantContext;
  raw: unknown;
}): Promise<L1ToolSuccess<ClassifyGuidanceOutput> | L1ToolFailure> {
  const toolId = "inventory.classify_guidance_situation";
  if (!input.raw || typeof input.raw !== "object") {
    return l1Fail(toolId, "MALFORMED_INPUT", "Input must be an object.");
  }
  const raw = input.raw as Record<string, unknown>;
  const row = raw.row as MerchantInventoryIntelligenceRow | undefined;
  if (!row || typeof row !== "object") {
    return l1Fail(toolId, "MALFORMED_INPUT", "row is required.");
  }
  if (typeof raw.stockObservationsStale !== "boolean") {
    return l1Fail(
      toolId,
      "MALFORMED_INPUT",
      "stockObservationsStale boolean is required.",
    );
  }

  const scope = assertGrainScope(input.context, {
    organizationId: row.organizationId,
    storeId: row.storeId,
    locationId: row.locationId,
    variantId: row.variantId,
  });
  if (!scope.ok) {
    return l1Fail(toolId, scope.code, scope.detail);
  }
  if (row.organizationId !== input.context.organizationId) {
    return l1Fail(
      toolId,
      "TENANT_SCOPE_MISMATCH",
      "Row organization does not match trusted context.",
    );
  }

  const situation = classifyGuidanceSituation({
    row,
    stockObservationsStale: raw.stockObservationsStale,
    incomingTrust:
      (raw.incomingTrust as IncomingTrustClass | undefined) ?? "unknown",
  });

  return {
    ok: true,
    toolId,
    latencyMs: 0,
    execution: "success",
    evidenceVerification: "verified",
    recommendationEligibility: "explain_only",
    evidenceIds: [`guidance:${row.grainKey}:${situation.id}`],
    output: { situation },
  };
}

export type PlanningInputsOutput = {
  planning: MerchantPlanningInputs | null;
  /** Explicit: null means unknown / not configured — not zero. */
  present: boolean;
};

export async function adaptGetPlanningInputs(input: {
  context: MerchantContext;
  deps: L1ToolDeps;
  raw: unknown;
}): Promise<L1ToolSuccess<PlanningInputsOutput> | L1ToolFailure> {
  const toolId = "planning.get_inputs";
  if (input.raw !== undefined && input.raw !== null) {
    if (typeof input.raw !== "object") {
      return l1Fail(toolId, "MALFORMED_INPUT", "Input must be an object.");
    }
    const raw = input.raw as Record<string, unknown>;
    if (raw.organizationId !== undefined) {
      const scope = assertGrainScope(input.context, {
        organizationId: raw.organizationId,
      });
      if (!scope.ok) {
        return l1Fail(toolId, scope.code, scope.detail);
      }
    }
  }

  const planning = await input.deps.getPlanningInputs({
    organizationId: input.context.organizationId,
  });

  // Preserve null semantics — never coerce to 0.
  if (planning) {
    for (const key of ["leadTimeDays", "safetyStockDays", "reviewPeriodDays"] as const) {
      const value = planning[key];
      if (value !== null && (typeof value !== "number" || !Number.isFinite(value))) {
        return l1Fail(
          toolId,
          "MALFORMED_OUTPUT",
          `Planning field ${key} is malformed.`,
        );
      }
    }
  }

  return {
    ok: true,
    toolId,
    latencyMs: 0,
    execution: "success",
    evidenceVerification: planning ? "verified" : "partial",
    recommendationEligibility: "explain_only",
    evidenceIds: planning
      ? [`planning:${input.context.organizationId}`]
      : [],
    output: {
      planning,
      present: planning !== null,
    },
  };
}
