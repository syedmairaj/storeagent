import {
  STOREAGENT_EVALUATION_SCHEMA_VERSION,
} from "./types";

import type {
  StoreAgentEvaluationScenario,
} from "./types";

function requireNonEmpty(
  value: string,
  field: string,
): string {
  const normalized =
    value.trim();

  if (!normalized) {
    throw new Error(
      `Evaluation scenario ${field} must not be empty.`,
    );
  }

  return normalized;
}

export function validateEvaluationScenario<
  TInput,
  TExpected,
>(
  scenario: StoreAgentEvaluationScenario<
    TInput,
    TExpected
  >,
): StoreAgentEvaluationScenario<
  TInput,
  TExpected
> {
  if (
    scenario.schemaVersion !==
    STOREAGENT_EVALUATION_SCHEMA_VERSION
  ) {
    throw new Error(
      `Unsupported evaluation schemaVersion: ${scenario.schemaVersion}.`,
    );
  }

  if (
    scenario.protects.length === 0
  ) {
    throw new Error(
      "Evaluation scenario protects must contain at least one invariant.",
    );
  }

  return {
    ...scenario,

    id:
      requireNonEmpty(
        scenario.id,
        "id",
      ),

    title:
      requireNonEmpty(
        scenario.title,
        "title",
      ),

    configurationVersion:
      requireNonEmpty(
        scenario.configurationVersion,
        "configurationVersion",
      ),

    protects:
      scenario.protects.map(
        (item) =>
          requireNonEmpty(
            item,
            "protects item",
          ),
      ),
  };
}
