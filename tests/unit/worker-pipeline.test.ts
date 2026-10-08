import {
  describe,
  expect,
  it,
} from "vitest";

import {
  assertPipelineStageReady,
  assessPipelineStageReadiness,
  pipelineStageForJobType,
} from "@/workers/pipeline";

describe("inventory intelligence worker pipeline", () => {
  it("maps metrics job to deterministic metrics stage", () => {
    expect(
      pipelineStageForJobType(
        "metrics_aggregation",
      ),
    ).toBe(
      "metrics",
    );
  });

  it("maps forecast job to deterministic forecast stage", () => {
    expect(
      pipelineStageForJobType(
        "forecast_generation",
      ),
    ).toBe(
      "forecast",
    );
  });

  it("maps action generation to deterministic decision stage", () => {
    expect(
      pipelineStageForJobType(
        "action_generation",
      ),
    ).toBe(
      "decision",
    );
  });

  it("maps explanation generation after deterministic decision", () => {
    expect(
      pipelineStageForJobType(
        "explanation_generation",
      ),
    ).toBe(
      "ai_explanation",
    );
  });

  it("keeps provider sync outside the numeric intelligence pipeline", () => {
    expect(
      pipelineStageForJobType(
        "provider_sync",
      ),
    ).toBeNull();

    expect(
      pipelineStageForJobType(
        "provider_reconciliation",
      ),
    ).toBeNull();
  });

  it("keeps notification delivery outside numeric truth calculation", () => {
    expect(
      pipelineStageForJobType(
        "notification_delivery",
      ),
    ).toBeNull();
  });

  it("blocks every stage until canonical data is ready", () => {
    expect(
      assessPipelineStageReadiness(
        "metrics",
        {
          canonicalDataReady:
            false,
          metricsReady:
            false,
          forecastReady:
            false,
          decisionReady:
            false,
        },
      ),
    ).toEqual({
      ready: false,
      reason:
        "CANONICAL_DATA_NOT_READY",
    });
  });

  it("allows metrics once canonical data is ready", () => {
    expect(
      assessPipelineStageReadiness(
        "metrics",
        {
          canonicalDataReady:
            true,
          metricsReady:
            false,
          forecastReady:
            false,
          decisionReady:
            false,
        },
      ),
    ).toEqual({
      ready: true,
      reason: null,
    });
  });

  it("blocks forecasting until deterministic metrics complete", () => {
    expect(
      assessPipelineStageReadiness(
        "forecast",
        {
          canonicalDataReady:
            true,
          metricsReady:
            false,
          forecastReady:
            false,
          decisionReady:
            false,
        },
      ),
    ).toEqual({
      ready: false,
      reason:
        "METRICS_NOT_READY",
    });
  });

  it("allows forecasting after deterministic metrics complete", () => {
    expect(
      assessPipelineStageReadiness(
        "forecast",
        {
          canonicalDataReady:
            true,
          metricsReady:
            true,
          forecastReady:
            false,
          decisionReady:
            false,
        },
      ),
    ).toEqual({
      ready: true,
      reason: null,
    });
  });

  it("blocks decision until forecast stage completes", () => {
    expect(
      assessPipelineStageReadiness(
        "decision",
        {
          canonicalDataReady:
            true,
          metricsReady:
            true,
          forecastReady:
            false,
          decisionReady:
            false,
        },
      ),
    ).toEqual({
      ready: false,
      reason:
        "FORECAST_NOT_READY",
    });
  });

  it("allows decision after deterministic forecast stage completes", () => {
    expect(
      assessPipelineStageReadiness(
        "decision",
        {
          canonicalDataReady:
            true,
          metricsReady:
            true,
          forecastReady:
            true,
          decisionReady:
            false,
        },
      ),
    ).toEqual({
      ready: true,
      reason: null,
    });
  });

  it("blocks AI explanation until deterministic decision completes", () => {
    expect(
      assessPipelineStageReadiness(
        "ai_explanation",
        {
          canonicalDataReady:
            true,
          metricsReady:
            true,
          forecastReady:
            true,
          decisionReady:
            false,
        },
      ),
    ).toEqual({
      ready: false,
      reason:
        "DECISION_NOT_READY",
    });
  });

  it("allows AI explanation only after deterministic decision completes", () => {
    expect(
      assessPipelineStageReadiness(
        "ai_explanation",
        {
          canonicalDataReady:
            true,
          metricsReady:
            true,
          forecastReady:
            true,
          decisionReady:
            true,
        },
      ),
    ).toEqual({
      ready: true,
      reason: null,
    });
  });

  it("fails closed when attempting to bypass pipeline prerequisites", () => {
    expect(() =>
      assertPipelineStageReady(
        "decision",
        {
          canonicalDataReady:
            true,
          metricsReady:
            true,
          forecastReady:
            false,
          decisionReady:
            false,
        },
      ),
    ).toThrow(
      'Pipeline stage "decision" is blocked: FORECAST_NOT_READY.',
    );
  });
});
