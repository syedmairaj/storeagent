import {
  describe,
  expect,
  it,
} from "vitest";

import {
  STOREAGENT_FIXTURE_SCHEMA_VERSION,
  validateEvaluationFixture,
} from "@/tests/evaluation/fixture";

import {
  steadyDemand28DaysFixture,
} from "@/tests/fixtures/forecast/steady-demand-28-days-v1";

describe("StoreAgent deterministic evaluation fixture contract", () => {
  it("freezes fixture schema version 1", () => {
    expect(
      STOREAGENT_FIXTURE_SCHEMA_VERSION,
    ).toBe(1);
  });

  it("accepts a versioned deterministic fixture", () => {
    const result =
      validateEvaluationFixture(
        steadyDemand28DaysFixture,
      );

    expect(result.id).toBe(
      "forecast/steady-demand-28-days-v1",
    );

    expect(
      result.fixtureVersion,
    ).toBe(1);

    expect(
      result.domain,
    ).toBe(
      "forecast",
    );
  });

  it("preserves all 28 explicit demand observations", () => {
    const result =
      validateEvaluationFixture(
        steadyDemand28DaysFixture,
      );

    expect(
      result.input.observations,
    ).toHaveLength(28);

    expect(
      result.input.observations.every(
        (observation) =>
          observation.unitsSold === 4,
      ),
    ).toBe(true);
  });

  it("preserves deterministic fixture output across repeated reads", () => {
    const first =
      JSON.stringify(
        validateEvaluationFixture(
          steadyDemand28DaysFixture,
        ),
      );

    const second =
      JSON.stringify(
        validateEvaluationFixture(
          steadyDemand28DaysFixture,
        ),
      );

    expect(first).toBe(
      second,
    );
  });

  it("rejects unsupported fixture schema versions", () => {
    expect(() =>
      validateEvaluationFixture({
        fixtureSchemaVersion:
          2 as 1,

        id:
          "forecast/example-v1",

        domain:
          "forecast",

        fixtureVersion: 1,

        description:
          "Example",

        input: {},
      }),
    ).toThrow(
      "Unsupported fixtureSchemaVersion: 2.",
    );
  });

  it("rejects zero fixture version", () => {
    expect(() =>
      validateEvaluationFixture({
        fixtureSchemaVersion: 1,

        id:
          "forecast/example-v1",

        domain:
          "forecast",

        fixtureVersion: 0,

        description:
          "Example",

        input: {},
      }),
    ).toThrow(
      "Evaluation fixture fixtureVersion must be a positive safe integer.",
    );
  });

  it("rejects blank fixture identity", () => {
    expect(() =>
      validateEvaluationFixture({
        fixtureSchemaVersion: 1,

        id: " ",

        domain:
          "forecast",

        fixtureVersion: 1,

        description:
          "Example",

        input: {},
      }),
    ).toThrow(
      "Evaluation fixture id must not be empty.",
    );
  });

  it("rejects blank fixture description", () => {
    expect(() =>
      validateEvaluationFixture({
        fixtureSchemaVersion: 1,

        id:
          "forecast/example-v1",

        domain:
          "forecast",

        fixtureVersion: 1,

        description: " ",

        input: {},
      }),
    ).toThrow(
      "Evaluation fixture description must not be empty.",
    );
  });
});
