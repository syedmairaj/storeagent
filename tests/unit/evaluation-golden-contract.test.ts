import {
  describe,
  expect,
  it,
} from "vitest";

import {
  STOREAGENT_GOLDEN_SCHEMA_VERSION,
  validateGoldenOutput,
} from "@/tests/evaluation/golden";

import {
  steadyDemand28DaysGolden,
} from "@/tests/golden/forecast/steady-demand-28-days-v1";

describe("StoreAgent golden expected-output contract", () => {
  it("freezes golden schema version 1", () => {
    expect(
      STOREAGENT_GOLDEN_SCHEMA_VERSION,
    ).toBe(1);
  });

  it("accepts an explicitly approved golden output", () => {
    const result =
      validateGoldenOutput(
        steadyDemand28DaysGolden,
      );

    expect(result.id).toBe(
      "forecast/steady-demand-28-days-v1",
    );

    expect(
      result.scenarioId,
    ).toBe(
      "forecast/steady-demand-28-days-v1",
    );

    expect(
      result.review.status,
    ).toBe(
      "approved",
    );
  });

  it("preserves explicit deterministic configuration version", () => {
    expect(
      validateGoldenOutput(
        steadyDemand28DaysGolden,
      ).configurationVersion,
    ).toBe(
      "forecast-config-v1",
    );
  });

  it("preserves explicit fixture evidence identity and version", () => {
    expect(
      validateGoldenOutput(
        steadyDemand28DaysGolden,
      ).fixture,
    ).toEqual({
      fixtureId:
        "forecast/steady-demand-28-days-v1",

      fixtureVersion: 1,
    });
  });

  it("preserves reviewed expected deterministic output", () => {
    expect(
      validateGoldenOutput(
        steadyDemand28DaysGolden,
      ).expected,
    ).toEqual({
      dataSufficiency:
        "sufficient",

      dailyDemand: 4,

      confidence:
        "high",
    });
  });

  it("supports a golden output without an external fixture", () => {
    const result =
      validateGoldenOutput({
        goldenSchemaVersion: 1,

        id:
          "decision/inline-example-v1",

        scenarioId:
          "decision/inline-example-v1",

        configurationVersion:
          "decision-config-v1",

        fixture: null,

        expected: {
          actionType:
            "WATCH",
        },

        review: {
          status:
            "approved",

          rationale:
            "Unknown inventory must fail closed.",
        },
      });

    expect(
      result.fixture,
    ).toBeNull();
  });

  it("rejects unsupported golden schema versions", () => {
    expect(() =>
      validateGoldenOutput({
        goldenSchemaVersion:
          2 as 1,

        id:
          "forecast/example-v1",

        scenarioId:
          "forecast/example-v1",

        configurationVersion:
          "forecast-config-v1",

        fixture: null,

        expected: {},

        review: {
          status:
            "approved",

          rationale:
            "Reviewed behavior.",
        },
      }),
    ).toThrow(
      "Unsupported goldenSchemaVersion: 2.",
    );
  });

  it("rejects blank golden identity", () => {
    expect(() =>
      validateGoldenOutput({
        goldenSchemaVersion: 1,

        id: " ",

        scenarioId:
          "forecast/example-v1",

        configurationVersion:
          "forecast-config-v1",

        fixture: null,

        expected: {},

        review: {
          status:
            "approved",

          rationale:
            "Reviewed behavior.",
        },
      }),
    ).toThrow(
      "Golden output id must not be empty.",
    );
  });

  it("requires stable scenario identity", () => {
    expect(() =>
      validateGoldenOutput({
        goldenSchemaVersion: 1,

        id:
          "forecast/example-v1",

        scenarioId: " ",

        configurationVersion:
          "forecast-config-v1",

        fixture: null,

        expected: {},

        review: {
          status:
            "approved",

          rationale:
            "Reviewed behavior.",
        },
      }),
    ).toThrow(
      "Golden output scenarioId must not be empty.",
    );
  });

  it("requires explicit deterministic configuration version", () => {
    expect(() =>
      validateGoldenOutput({
        goldenSchemaVersion: 1,

        id:
          "forecast/example-v1",

        scenarioId:
          "forecast/example-v1",

        configurationVersion: " ",

        fixture: null,

        expected: {},

        review: {
          status:
            "approved",

          rationale:
            "Reviewed behavior.",
        },
      }),
    ).toThrow(
      "Golden output configurationVersion must not be empty.",
    );
  });

  it("requires positive fixture evidence version", () => {
    expect(() =>
      validateGoldenOutput({
        goldenSchemaVersion: 1,

        id:
          "forecast/example-v1",

        scenarioId:
          "forecast/example-v1",

        configurationVersion:
          "forecast-config-v1",

        fixture: {
          fixtureId:
            "forecast/example-v1",

          fixtureVersion: 0,
        },

        expected: {},

        review: {
          status:
            "approved",

          rationale:
            "Reviewed behavior.",
        },
      }),
    ).toThrow(
      "Golden output fixtureVersion must be a positive safe integer.",
    );
  });

  it("requires fixture identity when fixture evidence is referenced", () => {
    expect(() =>
      validateGoldenOutput({
        goldenSchemaVersion: 1,

        id:
          "forecast/example-v1",

        scenarioId:
          "forecast/example-v1",

        configurationVersion:
          "forecast-config-v1",

        fixture: {
          fixtureId: " ",
          fixtureVersion: 1,
        },

        expected: {},

        review: {
          status:
            "approved",

          rationale:
            "Reviewed behavior.",
        },
      }),
    ).toThrow(
      "Golden output fixtureId must not be empty.",
    );
  });

  it("requires explicit review rationale", () => {
    expect(() =>
      validateGoldenOutput({
        goldenSchemaVersion: 1,

        id:
          "forecast/example-v1",

        scenarioId:
          "forecast/example-v1",

        configurationVersion:
          "forecast-config-v1",

        fixture: null,

        expected: {},

        review: {
          status:
            "approved",

          rationale: " ",
        },
      }),
    ).toThrow(
      "Golden output review rationale must not be empty.",
    );
  });
});
