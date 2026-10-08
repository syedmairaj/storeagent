import type {
  StoreAgentGoldenOutput,
} from "./golden";

import type {
  StoreAgentEvaluationScenario,
} from "./types";

export type EvaluationValueNormalizer =
  (value: unknown) => unknown;

export type EvaluationRegressionAssessment =
  | {
      status: "match";

      scenarioId: string;
    }
  | {
      status: "regression";

      scenarioId: string;

      expected: unknown;

      actual: unknown;
    };

function identity(
  value: unknown,
): unknown {
  return value;
}

function stableSerialize(
  value: unknown,
): string {
  if (value === null) {
    return "null";
  }

  if (
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(
      value,
    );
  }

  if (
    typeof value === "number"
  ) {
    if (
      !Number.isFinite(value)
    ) {
      throw new Error(
        "Evaluation regression values must contain only finite numbers.",
      );
    }

    return JSON.stringify(
      value,
    );
  }

  if (
    Array.isArray(value)
  ) {
    return `[${value
      .map(
        stableSerialize,
      )
      .join(",")}]`;
  }

  if (
    typeof value === "object"
  ) {
    const entries =
      Object.entries(
        value as Record<
          string,
          unknown
        >,
      ).sort(
        ([left], [right]) =>
          left.localeCompare(
            right,
          ),
      );

    return `{${entries
      .map(
        ([key, item]) =>
          `${JSON.stringify(
            key,
          )}:${stableSerialize(
            item,
          )}`,
      )
      .join(",")}}`;
  }

  throw new Error(
    "Unsupported evaluation regression value.",
  );
}

export function evaluationValuesEqual(
  left: unknown,
  right: unknown,
  normalize:
    EvaluationValueNormalizer =
      identity,
): boolean {
  return (
    stableSerialize(
      normalize(left),
    ) ===
    stableSerialize(
      normalize(right),
    )
  );
}

export function assertEvaluationArtifactAlignment(
  scenario:
    StoreAgentEvaluationScenario<
      unknown,
      unknown
    >,

  golden:
    StoreAgentGoldenOutput<
      unknown
    >,
): void {
  if (
    golden.scenarioId !==
    scenario.id
  ) {
    throw new Error(
      `Golden scenario mismatch: expected "${scenario.id}", received "${golden.scenarioId}".`,
    );
  }

  if (
    golden.configurationVersion !==
    scenario.configurationVersion
  ) {
    throw new Error(
      `Golden configuration mismatch for "${scenario.id}".`,
    );
  }

  if (
    !evaluationValuesEqual(
      scenario.expected,
      golden.expected,
    )
  ) {
    throw new Error(
      `Scenario expected output is not the approved golden for "${scenario.id}".`,
    );
  }

  if (
    golden.review.status !==
    "approved" ||
    !golden.review.rationale
      .trim()
  ) {
    throw new Error(
      `Golden "${scenario.id}" is not explicitly reviewed and approved.`,
    );
  }
}

export function assessEvaluationRegression(
  input: {
    scenario:
      StoreAgentEvaluationScenario<
        unknown,
        unknown
      >;

    golden:
      StoreAgentGoldenOutput<
        unknown
      >;

    actual:
      unknown;

    normalize?:
      EvaluationValueNormalizer;
  },
): EvaluationRegressionAssessment {
  assertEvaluationArtifactAlignment(
    input.scenario,
    input.golden,
  );

  const normalize =
    input.normalize ??
    identity;

  if (
    evaluationValuesEqual(
      input.actual,
      input.golden.expected,
      normalize,
    )
  ) {
    return {
      status:
        "match",

      scenarioId:
        input.scenario.id,
    };
  }

  return {
    status:
      "regression",

    scenarioId:
      input.scenario.id,

    expected:
      input.golden.expected,

    actual:
      input.actual,
  };
}

export function assertNoEvaluationRegression(
  input: Parameters<
    typeof assessEvaluationRegression
  >[0],
): void {
  const assessment =
    assessEvaluationRegression(
      input,
    );

  if (
    assessment.status ===
    "regression"
  ) {
    throw new Error(
      `Unapproved evaluation regression detected for "${assessment.scenarioId}".`,
    );
  }
}
