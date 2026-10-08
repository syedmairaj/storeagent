export const STOREAGENT_EVALUATION_SCHEMA_VERSION =
  1 as const;

export type StoreAgentEvaluationDomain =
  | "metrics"
  | "forecast"
  | "decision"
  | "tenancy"
  | "worker"
  | "ai";

export type StoreAgentEvaluationRisk =
  | "critical"
  | "high"
  | "medium"
  | "low";

export interface StoreAgentEvaluationScenario<
  TInput,
  TExpected,
> {
  /**
   * Version of the evaluation-file contract itself.
   */
  schemaVersion:
    typeof STOREAGENT_EVALUATION_SCHEMA_VERSION;

  /**
   * Stable immutable scenario identity.
   *
   * Do not derive this from array position or filename order.
   */
  id: string;

  /**
   * Human-readable scenario purpose.
   */
  title: string;

  domain:
    StoreAgentEvaluationDomain;

  risk:
    StoreAgentEvaluationRisk;

  /**
   * Explicit version of the business rules/configuration against
   * which this expected output was approved.
   */
  configurationVersion: string;

  /**
   * Deterministic scenario inputs only.
   *
   * Credentials, live provider responses and runtime timestamps
   * do not belong in evaluation fixtures.
   */
  input: TInput;

  /**
   * Reviewed deterministic expected result.
   */
  expected: TExpected;

  /**
   * Why this scenario exists and what regression it protects.
   */
  protects: readonly string[];
}

export interface StoreAgentEvaluationFixtureRef {
  /**
   * Stable fixture identity.
   */
  fixtureId: string;

  /**
   * Explicit fixture evidence version.
   */
  fixtureVersion: number;
}
