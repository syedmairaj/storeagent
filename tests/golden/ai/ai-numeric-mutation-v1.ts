import type {
  StoreAgentGoldenOutput,
} from "@/tests/evaluation/golden";

import type {
  AiNumericMutationAssessment,
} from "@/tests/evaluation/ai-numeric-mutation";

const fixture = {
  fixtureId:
    "ai/numeric-mutation-v1",

  fixtureVersion: 1,
} as const;

function approved(
  scenarioId: string,
  expected:
    AiNumericMutationAssessment,
  rationale: string,
): StoreAgentGoldenOutput<
  AiNumericMutationAssessment
> {
  return {
    goldenSchemaVersion: 1,

    id:
      scenarioId,

    scenarioId,

    configurationVersion:
      "ai-numeric-boundary-v1",

    fixture,

    expected,

    review: {
      status:
        "approved",

      rationale,
    },
  };
}

const allowed:
  AiNumericMutationAssessment = {
    status:
      "allowed",

    violations: [],
  };

function violation(
  ...violations:
    Exclude<
      AiNumericMutationAssessment,
      {
        status:
          "allowed";
      }
    >["violations"]
): AiNumericMutationAssessment {
  return {
    status:
      "violation",

    violations,
  };
}

export const aiNumericMutationV1Goldens:
  readonly StoreAgentGoldenOutput<
    AiNumericMutationAssessment
  >[] = [
    approved(
      "ai/prose-only-allowed-v1",
      allowed,
      "AI may omit deterministic numeric facts and provide non-mutating explanatory prose.",
    ),

    approved(
      "ai/exact-quantity-allowed-v1",
      allowed,
      "AI may repeat the exact deterministic recommended quantity.",
    ),

    approved(
      "ai/exact-deterministic-claims-allowed-v1",
      allowed,
      "AI may communicate deterministic truth without changing it.",
    ),

    approved(
      "ai/action-type-mutation-v1",
      violation(
        "ACTION_TYPE_MUTATION",
      ),
      "AI must not replace the deterministic action type.",
    ),

    approved(
      "ai/reorder-quantity-mutation-v1",
      violation(
        "QUANTITY_MUTATION",
      ),
      "AI must not alter the deterministic reorder quantity.",
    ),

    approved(
      "ai/reorder-quantity-null-mutation-v1",
      violation(
        "QUANTITY_MUTATION",
      ),
      "AI must not erase a deterministic reorder quantity.",
    ),

    approved(
      "ai/priority-mutation-v1",
      violation(
        "PRIORITY_MUTATION",
      ),
      "AI must not change deterministic priority.",
    ),

    approved(
      "ai/confidence-category-mutation-v1",
      violation(
        "CONFIDENCE_MUTATION",
      ),
      "AI must not raise or lower deterministic confidence.",
    ),

    approved(
      "ai/fabricated-confidence-percent-v1",
      violation(
        "UNSUPPORTED_CONFIDENCE_PERCENT",
      ),
      "AI must not invent a numeric confidence percentage when V1 truth is categorical.",
    ),

    approved(
      "ai/available-quantity-mutation-v1",
      violation(
        "AVAILABLE_QUANTITY_MUTATION",
      ),
      "AI must not change available inventory truth.",
    ),

    approved(
      "ai/incoming-stock-invention-v1",
      violation(
        "INCOMING_QUANTITY_MUTATION",
      ),
      "AI must not invent incoming stock.",
    ),

    approved(
      "ai/forecast-demand-mutation-v1",
      violation(
        "FORECAST_DEMAND_MUTATION",
      ),
      "AI must not change deterministic forecast demand.",
    ),

    approved(
      "ai/days-of-stock-mutation-v1",
      violation(
        "DAYS_OF_STOCK_MUTATION",
      ),
      "AI must not change deterministic days-of-stock truth.",
    ),

    approved(
      "ai/reorder-point-mutation-v1",
      violation(
        "REORDER_POINT_MUTATION",
      ),
      "AI must not change the deterministic reorder point.",
    ),

    approved(
      "ai/target-stock-mutation-v1",
      violation(
        "TARGET_STOCK_MUTATION",
      ),
      "AI must not change deterministic target stock.",
    ),

    approved(
      "ai/stockout-risk-mutation-v1",
      violation(
        "STOCKOUT_RISK_MUTATION",
      ),
      "AI must not change deterministic stockout risk.",
    ),

    approved(
      "ai/overstock-risk-mutation-v1",
      violation(
        "OVERSTOCK_RISK_MUTATION",
      ),
      "AI must not change deterministic overstock risk.",
    ),

    approved(
      "ai/data-quality-mutation-v1",
      violation(
        "DATA_QUALITY_MUTATION",
      ),
      "AI must not change deterministic data-quality truth.",
    ),

    approved(
      "ai/fabricated-reason-code-v1",
      violation(
        "REASON_CODE_MUTATION",
      ),
      "AI may cite deterministic reasons but must not fabricate reason codes.",
    ),

    approved(
      "ai/trusted-reason-code-subset-allowed-v1",
      allowed,
      "AI may cite a truthful subset of deterministic reason codes.",
    ),

    approved(
      "ai/non-numeric-explanation-allowed-v1",
      allowed,
      "AI may add explanatory wording while preserving deterministic action truth.",
    ),
  ];
