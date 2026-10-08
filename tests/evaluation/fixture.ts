import type {
  StoreAgentEvaluationDomain,
} from "./types";

export const STOREAGENT_FIXTURE_SCHEMA_VERSION =
  1 as const;

export interface StoreAgentEvaluationFixture<
  TInput,
> {
  /**
   * Version of the fixture-file format itself.
   */
  fixtureSchemaVersion:
    typeof STOREAGENT_FIXTURE_SCHEMA_VERSION;

  /**
   * Stable fixture identity.
   *
   * Example:
   * forecast/steady-demand-28-days-v1
   */
  id: string;

  domain:
    StoreAgentEvaluationDomain;

  /**
   * Version of this fixture's input evidence.
   *
   * Increment deliberately when evidence changes.
   */
  fixtureVersion: number;

  /**
   * Human-readable explanation of the fixture.
   */
  description: string;

  /**
   * Deterministic fixture input only.
   *
   * No live calls, credentials, random values or implicit current time.
   */
  input: TInput;
}

function requireNonEmpty(
  value: string,
  field: string,
): string {
  const normalized =
    value.trim();

  if (!normalized) {
    throw new Error(
      `Evaluation fixture ${field} must not be empty.`,
    );
  }

  return normalized;
}

export function validateEvaluationFixture<
  TInput,
>(
  fixture: StoreAgentEvaluationFixture<TInput>,
): StoreAgentEvaluationFixture<TInput> {
  if (
    fixture.fixtureSchemaVersion !==
    STOREAGENT_FIXTURE_SCHEMA_VERSION
  ) {
    throw new Error(
      `Unsupported fixtureSchemaVersion: ${fixture.fixtureSchemaVersion}.`,
    );
  }

  if (
    !Number.isSafeInteger(
      fixture.fixtureVersion,
    ) ||
    fixture.fixtureVersion < 1
  ) {
    throw new Error(
      "Evaluation fixture fixtureVersion must be a positive safe integer.",
    );
  }

  return {
    ...fixture,

    id:
      requireNonEmpty(
        fixture.id,
        "id",
      ),

    description:
      requireNonEmpty(
        fixture.description,
        "description",
      ),
  };
}
