import {
  describe,
  expect,
  it,
} from "vitest";

import {
  validateEvaluationScenario,
} from "@/tests/evaluation/scenario";

import {
  STOREAGENT_EVALUATION_SCHEMA_VERSION,
} from "@/tests/evaluation/types";

describe("StoreAgent evaluation scenario contract", () => {
  it("freezes evaluation schema version 1", () => {
    expect(
      STOREAGENT_EVALUATION_SCHEMA_VERSION,
    ).toBe(1);
  });

  it("accepts a deterministic business scenario", () => {
    expect(
      validateEvaluationScenario({
        schemaVersion: 1,

        id:
          "decision/reorder-basic-v1",

        title:
          "Low stock requires deterministic reorder",

        domain:
          "decision",

        risk:
          "critical",

        configurationVersion:
          "decision-config-v1",

        input: {
          availableQuantity: 10,
        },

        expected: {
          actionType:
            "REORDER",
        },

        protects: [
          "Low trusted stock must not resolve to HEALTHY.",
        ],
      }),
    ).toMatchObject({
      id:
        "decision/reorder-basic-v1",

      domain:
        "decision",

      risk:
        "critical",
    });
  });

  it("rejects unknown evaluation schema versions", () => {
    expect(() =>
      validateEvaluationScenario({
        schemaVersion:
          2 as 1,

        id:
          "scenario-1",

        title:
          "Scenario",

        domain:
          "metrics",

        risk:
          "high",

        configurationVersion:
          "metrics-v1",

        input: {},

        expected: {},

        protects: [
          "metric invariant",
        ],
      }),
    ).toThrow(
      "Unsupported evaluation schemaVersion: 2.",
    );
  });

  it("requires stable scenario identity", () => {
    expect(() =>
      validateEvaluationScenario({
        schemaVersion: 1,

        id: " ",

        title:
          "Scenario",

        domain:
          "forecast",

        risk:
          "high",

        configurationVersion:
          "forecast-config-v1",

        input: {},

        expected: {},

        protects: [
          "forecast invariant",
        ],
      }),
    ).toThrow(
      "Evaluation scenario id must not be empty.",
    );
  });

  it("requires explicit configuration version", () => {
    expect(() =>
      validateEvaluationScenario({
        schemaVersion: 1,

        id:
          "forecast/basic-v1",

        title:
          "Forecast scenario",

        domain:
          "forecast",

        risk:
          "high",

        configurationVersion:
          " ",

        input: {},

        expected: {},

        protects: [
          "forecast invariant",
        ],
      }),
    ).toThrow(
      "Evaluation scenario configurationVersion must not be empty.",
    );
  });

  it("requires each scenario to state the invariant it protects", () => {
    expect(() =>
      validateEvaluationScenario({
        schemaVersion: 1,

        id:
          "worker/retry-v1",

        title:
          "Worker retry",

        domain:
          "worker",

        risk:
          "medium",

        configurationVersion:
          "worker-v1",

        input: {},

        expected: {},

        protects: [],
      }),
    ).toThrow(
      "Evaluation scenario protects must contain at least one invariant.",
    );
  });

  it("rejects blank protected invariant descriptions", () => {
    expect(() =>
      validateEvaluationScenario({
        schemaVersion: 1,

        id:
          "tenancy/cross-org-v1",

        title:
          "Cross organization isolation",

        domain:
          "tenancy",

        risk:
          "critical",

        configurationVersion:
          "tenancy-v1",

        input: {},

        expected: {},

        protects: [
          " ",
        ],
      }),
    ).toThrow(
      "Evaluation scenario protects item must not be empty.",
    );
  });
});
