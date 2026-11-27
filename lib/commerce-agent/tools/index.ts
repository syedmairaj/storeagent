/**
 * AI-ARCH-1b — L1 read-only tool registry public surface.
 */

export {
  L1_TOOL_IDS,
  L1_FORBIDDEN_TOOL_PREFIXES,
  isL1ToolId,
  isExplicitlyForbiddenToolId,
  type L1ToolId,
} from "@/lib/commerce-agent/tools/ids";

export {
  L1_TOOL_DEFINITIONS,
  L1_TOOL_INPUT_SCHEMA_VERSION,
  getL1ToolDefinition,
} from "@/lib/commerce-agent/tools/definitions";

export {
  createEmptyL1ToolDeps,
  createFixtureL1ToolDeps,
  type L1ToolDeps,
  type L1SkuIntelligencePort,
  type L1PlanningInputsPort,
} from "@/lib/commerce-agent/tools/deps";

export {
  invokeL1Tool,
  listL1ToolIds,
  type InvokeL1ToolInput,
} from "@/lib/commerce-agent/tools/invoke";

export type {
  L1ToolInvocationResult,
  L1ToolSuccess,
  L1ToolFailure,
  L1ToolFailureCode,
  L1EvidenceVerification,
  L1RecommendationEligibility,
} from "@/lib/commerce-agent/tools/results";
