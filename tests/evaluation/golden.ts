import type {
  StoreAgentEvaluationFixtureRef,
} from "./types";

export const STOREAGENT_GOLDEN_SCHEMA_VERSION =
  1 as const;

export type StoreAgentGoldenReviewStatus =
  | "approved";

export interface StoreAgentGoldenOutput<
  TExpected,
> {
  /**
   * Version of the golden-output file contract.
   */
  goldenSchemaVersion:
    typeof STOREAGENT_GOLDEN_SCHEMA_VERSION;

  /**
   * Stable golden artifact identity.
   *
   * Example:
   * decision/reorder-basic-v1
   */
  id: string;

  /**
   * Stable evaluation scenario this golden output belongs to.
   */
  scenarioId: string;

  /**
   * Explicit deterministic configuration version under which
   * this expected result was reviewed.
   */
  configurationVersion: string;

  /**
   * Optional deterministic fixture evidence used by this scenario.
   *
   * Small inline scenarios may legitimately have no fixture.
   */
  fixture:
    StoreAgentEvaluationFixtureRef | null;

  /**
   * Reviewed deterministic expected result.
   */
  expected: TExpected;

  /**
   * Golden output is never implicitly approved.
   */
  review: {
    status:
      StoreAgentGoldenReviewStatus;

    /**
     * Why this expected behavior is considered correct.
     */
    rationale: string;
  };
}

function requireNonEmpty(
  value: string,
  field: string,
): string {
  const normalized =
    value.trim();

  if (!normalized) {
    throw new Error(
      `Golden output ${field} must not be empty.`,
    );
  }

  return normalized;
}

function validateFixtureRef(
  fixture:
    StoreAgentEvaluationFixtureRef | null,
): StoreAgentEvaluationFixtureRef | null {
  if (fixture === null) {
    return null;
  }

  if (
    !Number.isSafeInteger(
      fixture.fixtureVersion,
    ) ||
    fixture.fixtureVersion < 1
  ) {
    throw new Error(
      "Golden output fixtureVersion must be a positive safe integer.",
    );
  }

  return {
    fixtureId:
      requireNonEmpty(
        fixture.fixtureId,
        "fixtureId",
      ),

    fixtureVersion:
      fixture.fixtureVersion,
  };
}

export function validateGoldenOutput<
  TExpected,
>(
  golden:
    StoreAgentGoldenOutput<TExpected>,
): StoreAgentGoldenOutput<TExpected> {
  if (
    golden.goldenSchemaVersion !==
    STOREAGENT_GOLDEN_SCHEMA_VERSION
  ) {
    throw new Error(
      `Unsupported goldenSchemaVersion: ${golden.goldenSchemaVersion}.`,
    );
  }

  if (
    golden.review.status !==
    "approved"
  ) {
    throw new Error(
      "Golden output must be explicitly approved.",
    );
  }

  return {
    ...golden,

    id:
      requireNonEmpty(
        golden.id,
        "id",
      ),

    scenarioId:
      requireNonEmpty(
        golden.scenarioId,
        "scenarioId",
      ),

    configurationVersion:
      requireNonEmpty(
        golden.configurationVersion,
        "configurationVersion",
      ),

    fixture:
      validateFixtureRef(
        golden.fixture,
      ),

    review: {
      status:
        "approved",

      rationale:
        requireNonEmpty(
          golden.review.rationale,
          "review rationale",
        ),
    },
  };
}
