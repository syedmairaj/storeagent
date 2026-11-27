/**
 * AI-ARCH-1b — static ToolDefinition table for L1 allowlist.
 */

import type { ToolDefinition } from "@/lib/commerce-agent/types";
import type { L1ToolId } from "@/lib/commerce-agent/tools/ids";

export const L1_TOOL_INPUT_SCHEMA_VERSION =
  "commerce-agent-l1-tool-input-v1" as const;

export const L1_TOOL_DEFINITIONS: Record<L1ToolId, ToolDefinition> = {
  "inventory.get_sku_intelligence": {
    toolId: "inventory.get_sku_intelligence",
    description:
      "Read one membership-scoped inventory intelligence grain (no recompute).",
    sideEffectClass: "read_only",
    requiredPermissions: ["inventory.read"],
    inputSchemaVersion: L1_TOOL_INPUT_SCHEMA_VERSION,
    maxCallsPerRun: 4,
    timeoutMs: 2500,
  },
  "inventory.build_explainer_evidence": {
    toolId: "inventory.build_explainer_evidence",
    description:
      "Build hashable AI-INV explainer evidence from a trusted intelligence row.",
    sideEffectClass: "read_only",
    requiredPermissions: ["inventory.read"],
    inputSchemaVersion: L1_TOOL_INPUT_SCHEMA_VERSION,
    maxCallsPerRun: 4,
    timeoutMs: 2500,
  },
  "inventory.classify_guidance_situation": {
    toolId: "inventory.classify_guidance_situation",
    description:
      "Classify AI-INV-1.1 guidance situation from observed row evidence only.",
    sideEffectClass: "read_only",
    requiredPermissions: ["inventory.read"],
    inputSchemaVersion: L1_TOOL_INPUT_SCHEMA_VERSION,
    maxCallsPerRun: 4,
    timeoutMs: 1000,
  },
  "planning.get_inputs": {
    toolId: "planning.get_inputs",
    description:
      "Read organization planning assumptions (null≠0; not supplier facts).",
    sideEffectClass: "read_only",
    requiredPermissions: ["inventory.read"],
    inputSchemaVersion: L1_TOOL_INPUT_SCHEMA_VERSION,
    maxCallsPerRun: 2,
    timeoutMs: 2500,
  },
};

export function getL1ToolDefinition(toolId: L1ToolId): ToolDefinition {
  return L1_TOOL_DEFINITIONS[toolId];
}
