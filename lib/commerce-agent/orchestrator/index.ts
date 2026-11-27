/**
 * AI-ARCH-1c — bounded deterministic orchestrator surface.
 */

export {
  getDefaultCommerceAgentConfig,
  readCommerceAgentServerConfig,
  resolveCommerceAgentEnablement,
  mayRunCommerceAgent,
  type CommerceAgentServerConfig,
  type ResolvedCommerceAgentEnablement,
} from "@/lib/commerce-agent/orchestrator/enablement";

export {
  ORCHESTRATOR_MAX_STEPS,
  ORCHESTRATOR_DEFAULT_DEADLINE_MS,
  ORCHESTRATOR_MAX_TOOL_CALLS,
  buildDeterministicPlan,
  isOrchestratorSupportedIntent,
  type DeterministicPlan,
  type DeterministicPlanStep,
} from "@/lib/commerce-agent/orchestrator/plans";

export {
  validateDeterministicPlan,
  type PlanValidationFailure,
  type PlanValidationSuccess,
} from "@/lib/commerce-agent/orchestrator/validate-plan";

export {
  assembleFromEvidenceBundle,
  abstain,
  createAgentTrace,
} from "@/lib/commerce-agent/orchestrator/assemble";

export {
  runCommerceAgent,
  resolveGrainFromTrustedContext,
  type RunCommerceAgentInput,
  type ResolvedGrain,
} from "@/lib/commerce-agent/orchestrator/run";

// Re-export draft adapter type used by RunCommerceAgentInput (1d optional polish).
export type { CommerceAgentDraftAdapter } from "@/lib/commerce-agent/validation/types";
