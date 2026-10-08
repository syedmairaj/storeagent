import type {
  StoreAgentEvaluationFixture,
} from "@/tests/evaluation/fixture";

import type {
  AiDeterministicTruth,
  AiExplanationCandidate,
} from "@/tests/evaluation/ai-numeric-mutation";

export interface AiNumericMutationFixtureCase {
  readonly id: string;

  readonly truth:
    AiDeterministicTruth;

  readonly candidate:
    AiExplanationCandidate;
}

const reorderTruth:
  AiDeterministicTruth = {
    actionType:
      "REORDER",

    recommendedQuantity:
      40,

    priority:
      "high",

    confidence:
      "medium",

    availableQuantity:
      8,

    incomingQuantity:
      0,

    forecastExpectedDemandUnits:
      28,

    daysOfStock:
      4,

    reorderPointUnits:
      18,

    targetStockUnits:
      32,

    stockoutRisk:
      "high",

    overstockRisk:
      "low",

    dataQualityScore:
      95,

    reasonCodes: [
      "REORDER_QUANTITY_POSITIVE",
      "STOCKOUT_RISK_HIGH",
      "BELOW_REORDER_POINT",
      "DECISION_CONFIDENCE_CAPPED_BY_FORECAST",
    ],
  };

export const aiNumericMutationV1Fixture:
  StoreAgentEvaluationFixture<{
    cases:
      readonly AiNumericMutationFixtureCase[];
  }> = {
    fixtureSchemaVersion: 1,

    id:
      "ai/numeric-mutation-v1",

    domain:
      "ai",

    fixtureVersion: 1,

    description:
      "Deterministic AI explanation mutation-boundary scenarios.",

    input: {
      cases: [
        {
          id:
            "ai/prose-only-allowed-v1",

          truth:
            reorderTruth,

          candidate: {
            explanation:
              "Inventory is running low and replenishment should be considered.",

            claims: {},
          },
        },

        {
          id:
            "ai/exact-quantity-allowed-v1",

          truth:
            reorderTruth,

          candidate: {
            explanation:
              "Reorder 40 units.",

            claims: {
              recommendedQuantity:
                40,
            },
          },
        },

        {
          id:
            "ai/exact-deterministic-claims-allowed-v1",

          truth:
            reorderTruth,

          candidate: {
            explanation:
              "Reorder 40 units because stockout risk is high.",

            claims: {
              actionType:
                "REORDER",

              recommendedQuantity:
                40,

              priority:
                "high",

              confidence:
                "medium",

              availableQuantity:
                8,

              incomingQuantity:
                0,

              forecastExpectedDemandUnits:
                28,

              daysOfStock:
                4,

              reorderPointUnits:
                18,

              targetStockUnits:
                32,

              stockoutRisk:
                "high",

              overstockRisk:
                "low",

              dataQualityScore:
                95,

              reasonCodes: [
                "STOCKOUT_RISK_HIGH",
                "BELOW_REORDER_POINT",
              ],
            },
          },
        },

        {
          id:
            "ai/action-type-mutation-v1",

          truth:
            reorderTruth,

          candidate: {
            explanation:
              "Watch this item.",

            claims: {
              actionType:
                "WATCH",
            },
          },
        },

        {
          id:
            "ai/reorder-quantity-mutation-v1",

          truth:
            reorderTruth,

          candidate: {
            explanation:
              "Reorder 50 units.",

            claims: {
              recommendedQuantity:
                50,
            },
          },
        },

        {
          id:
            "ai/reorder-quantity-null-mutation-v1",

          truth:
            reorderTruth,

          candidate: {
            explanation:
              "No reorder quantity is required.",

            claims: {
              recommendedQuantity:
                null,
            },
          },
        },

        {
          id:
            "ai/priority-mutation-v1",

          truth:
            reorderTruth,

          candidate: {
            explanation:
              "This is critical.",

            claims: {
              priority:
                "critical",
            },
          },
        },

        {
          id:
            "ai/confidence-category-mutation-v1",

          truth:
            reorderTruth,

          candidate: {
            explanation:
              "Confidence is high.",

            claims: {
              confidence:
                "high",
            },
          },
        },

        {
          id:
            "ai/fabricated-confidence-percent-v1",

          truth:
            reorderTruth,

          candidate: {
            explanation:
              "This recommendation has 90% confidence.",

            claims: {
              confidencePercent:
                90,
            },
          },
        },

        {
          id:
            "ai/available-quantity-mutation-v1",

          truth:
            reorderTruth,

          candidate: {
            explanation:
              "You have no stock available.",

            claims: {
              availableQuantity:
                0,
            },
          },
        },

        {
          id:
            "ai/incoming-stock-invention-v1",

          truth:
            reorderTruth,

          candidate: {
            explanation:
              "Ten units are already incoming.",

            claims: {
              incomingQuantity:
                10,
            },
          },
        },

        {
          id:
            "ai/forecast-demand-mutation-v1",

          truth:
            reorderTruth,

          candidate: {
            explanation:
              "Expected demand is 35 units.",

            claims: {
              forecastExpectedDemandUnits:
                35,
            },
          },
        },

        {
          id:
            "ai/days-of-stock-mutation-v1",

          truth:
            reorderTruth,

          candidate: {
            explanation:
              "You have six days of stock.",

            claims: {
              daysOfStock:
                6,
            },
          },
        },

        {
          id:
            "ai/reorder-point-mutation-v1",

          truth:
            reorderTruth,

          candidate: {
            explanation:
              "The reorder point is 20 units.",

            claims: {
              reorderPointUnits:
                20,
            },
          },
        },

        {
          id:
            "ai/target-stock-mutation-v1",

          truth:
            reorderTruth,

          candidate: {
            explanation:
              "Target stock is 35 units.",

            claims: {
              targetStockUnits:
                35,
            },
          },
        },

        {
          id:
            "ai/stockout-risk-mutation-v1",

          truth:
            reorderTruth,

          candidate: {
            explanation:
              "Stockout risk is low.",

            claims: {
              stockoutRisk:
                "low",
            },
          },
        },

        {
          id:
            "ai/overstock-risk-mutation-v1",

          truth:
            reorderTruth,

          candidate: {
            explanation:
              "Overstock risk is high.",

            claims: {
              overstockRisk:
                "high",
            },
          },
        },

        {
          id:
            "ai/data-quality-mutation-v1",

          truth:
            reorderTruth,

          candidate: {
            explanation:
              "Data quality is 80.",

            claims: {
              dataQualityScore:
                80,
            },
          },
        },

        {
          id:
            "ai/fabricated-reason-code-v1",

          truth:
            reorderTruth,

          candidate: {
            explanation:
              "Demand is falling.",

            claims: {
              reasonCodes: [
                "FALLING_DEMAND",
              ],
            },
          },
        },

        {
          id:
            "ai/trusted-reason-code-subset-allowed-v1",

          truth:
            reorderTruth,

          candidate: {
            explanation:
              "Stockout risk is high.",

            claims: {
              reasonCodes: [
                "STOCKOUT_RISK_HIGH",
              ],
            },
          },
        },

        {
          id:
            "ai/non-numeric-explanation-allowed-v1",

          truth:
            reorderTruth,

          candidate: {
            explanation:
              "This item needs attention because current inventory conditions support replenishment.",

            claims: {
              actionType:
                "REORDER",
            },
          },
        },
      ],
    },
  };
