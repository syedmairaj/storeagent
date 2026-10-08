import type {
  InventoryIntelligencePipelineStage,
  InventoryIntelligencePipelineState,
  PipelineStageReadiness,
  StoreAgentJobType,
} from "./types";

/**
 * Maps infrastructure job vocabulary to the deterministic inventory
 * intelligence pipeline.
 *
 * Provider synchronization and unrelated delivery jobs are outside
 * this numeric-truth pipeline.
 */
export function pipelineStageForJobType(
  jobType: StoreAgentJobType,
): InventoryIntelligencePipelineStage | null {
  switch (jobType) {
    case "metrics_aggregation":
      return "metrics";

    case "forecast_generation":
      return "forecast";

    case "action_generation":
      return "decision";

    case "explanation_generation":
      return "ai_explanation";

    case "provider_sync":
    case "provider_reconciliation":
    case "notification_delivery":
      return null;
  }
}

/**
 * Determines whether a pipeline stage may begin.
 *
 * This function checks orchestration prerequisites only.
 * It does not calculate metrics, forecasts, decisions, confidence,
 * quantities, or AI output.
 */
export function assessPipelineStageReadiness(
  stage: InventoryIntelligencePipelineStage,
  state: InventoryIntelligencePipelineState,
): PipelineStageReadiness {
  if (!state.canonicalDataReady) {
    return {
      ready: false,
      reason:
        "CANONICAL_DATA_NOT_READY",
    };
  }

  if (stage === "metrics") {
    return {
      ready: true,
      reason: null,
    };
  }

  if (!state.metricsReady) {
    return {
      ready: false,
      reason:
        "METRICS_NOT_READY",
    };
  }

  if (stage === "forecast") {
    return {
      ready: true,
      reason: null,
    };
  }

  if (!state.forecastReady) {
    return {
      ready: false,
      reason:
        "FORECAST_NOT_READY",
    };
  }

  if (stage === "decision") {
    return {
      ready: true,
      reason: null,
    };
  }

  if (!state.decisionReady) {
    return {
      ready: false,
      reason:
        "DECISION_NOT_READY",
    };
  }

  return {
    ready: true,
    reason: null,
  };
}

export function assertPipelineStageReady(
  stage: InventoryIntelligencePipelineStage,
  state: InventoryIntelligencePipelineState,
): void {
  const readiness =
    assessPipelineStageReadiness(
      stage,
      state,
    );

  if (!readiness.ready) {
    throw new Error(
      `Pipeline stage "${stage}" is blocked: ${readiness.reason}.`,
    );
  }
}
