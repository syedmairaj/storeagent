import type {
  ConfidenceLevel,
  InventoryActionPriority,
  InventoryActionType,
} from "@/lib/commerce-domain/types";

import type {
  InventoryRiskLevel,
} from "@/lib/metrics/types";

export type AiNumericMutationViolationCode =
  | "ACTION_TYPE_MUTATION"
  | "QUANTITY_MUTATION"
  | "PRIORITY_MUTATION"
  | "CONFIDENCE_MUTATION"
  | "UNSUPPORTED_CONFIDENCE_PERCENT"
  | "AVAILABLE_QUANTITY_MUTATION"
  | "INCOMING_QUANTITY_MUTATION"
  | "FORECAST_DEMAND_MUTATION"
  | "DAYS_OF_STOCK_MUTATION"
  | "REORDER_POINT_MUTATION"
  | "TARGET_STOCK_MUTATION"
  | "STOCKOUT_RISK_MUTATION"
  | "OVERSTOCK_RISK_MUTATION"
  | "DATA_QUALITY_MUTATION"
  | "REASON_CODE_MUTATION";

export interface AiDeterministicTruth {
  actionType:
    InventoryActionType | null;

  recommendedQuantity:
    number | null;

  priority:
    InventoryActionPriority | null;

  confidence:
    ConfidenceLevel;

  availableQuantity:
    number | null;

  incomingQuantity:
    number | null;

  forecastExpectedDemandUnits:
    number | null;

  daysOfStock:
    number | null;

  reorderPointUnits:
    number | null;

  targetStockUnits:
    number | null;

  stockoutRisk:
    InventoryRiskLevel | null;

  overstockRisk:
    InventoryRiskLevel | null;

  dataQualityScore:
    number | null;

  reasonCodes:
    readonly string[];
}

export interface AiExplanationClaims {
  actionType?:
    InventoryActionType | null;

  recommendedQuantity?:
    number | null;

  priority?:
    InventoryActionPriority | null;

  confidence?:
    ConfidenceLevel;

  /**
   * StoreAgent V1 has no deterministic numeric confidence percentage.
   *
   * Any AI-produced percentage is therefore unsupported numeric truth.
   */
  confidencePercent?:
    number;

  availableQuantity?:
    number | null;

  incomingQuantity?:
    number | null;

  forecastExpectedDemandUnits?:
    number | null;

  daysOfStock?:
    number | null;

  reorderPointUnits?:
    number | null;

  targetStockUnits?:
    number | null;

  stockoutRisk?:
    InventoryRiskLevel | null;

  overstockRisk?:
    InventoryRiskLevel | null;

  dataQualityScore?:
    number | null;

  reasonCodes?:
    readonly string[];
}

export interface AiExplanationCandidate {
  /**
   * Merchant-facing prose.
   *
   * V1 evaluation does not parse free prose to manufacture truth.
   * All factual/numeric claims that matter to the mutation boundary
   * must be represented in `claims`.
   */
  explanation: string;

  claims:
    AiExplanationClaims;
}

export type AiNumericMutationAssessment =
  | {
      status:
        "allowed";

      violations:
        readonly [];
    }
  | {
      status:
        "violation";

      violations:
        readonly AiNumericMutationViolationCode[];
    };

function differs<T>(
  claim: T | undefined,
  truth: T,
): boolean {
  return (
    claim !== undefined &&
    claim !== truth
  );
}

export function assessAiNumericMutation(
  truth:
    AiDeterministicTruth,

  candidate:
    AiExplanationCandidate,
): AiNumericMutationAssessment {
  const violations:
    AiNumericMutationViolationCode[] =
      [];

  const claims =
    candidate.claims;

  if (
    differs(
      claims.actionType,
      truth.actionType,
    )
  ) {
    violations.push(
      "ACTION_TYPE_MUTATION",
    );
  }

  if (
    differs(
      claims.recommendedQuantity,
      truth.recommendedQuantity,
    )
  ) {
    violations.push(
      "QUANTITY_MUTATION",
    );
  }

  if (
    differs(
      claims.priority,
      truth.priority,
    )
  ) {
    violations.push(
      "PRIORITY_MUTATION",
    );
  }

  if (
    differs(
      claims.confidence,
      truth.confidence,
    )
  ) {
    violations.push(
      "CONFIDENCE_MUTATION",
    );
  }

  if (
    claims.confidencePercent !==
    undefined
  ) {
    violations.push(
      "UNSUPPORTED_CONFIDENCE_PERCENT",
    );
  }

  if (
    differs(
      claims.availableQuantity,
      truth.availableQuantity,
    )
  ) {
    violations.push(
      "AVAILABLE_QUANTITY_MUTATION",
    );
  }

  if (
    differs(
      claims.incomingQuantity,
      truth.incomingQuantity,
    )
  ) {
    violations.push(
      "INCOMING_QUANTITY_MUTATION",
    );
  }

  if (
    differs(
      claims.forecastExpectedDemandUnits,
      truth.forecastExpectedDemandUnits,
    )
  ) {
    violations.push(
      "FORECAST_DEMAND_MUTATION",
    );
  }

  if (
    differs(
      claims.daysOfStock,
      truth.daysOfStock,
    )
  ) {
    violations.push(
      "DAYS_OF_STOCK_MUTATION",
    );
  }

  if (
    differs(
      claims.reorderPointUnits,
      truth.reorderPointUnits,
    )
  ) {
    violations.push(
      "REORDER_POINT_MUTATION",
    );
  }

  if (
    differs(
      claims.targetStockUnits,
      truth.targetStockUnits,
    )
  ) {
    violations.push(
      "TARGET_STOCK_MUTATION",
    );
  }

  if (
    differs(
      claims.stockoutRisk,
      truth.stockoutRisk,
    )
  ) {
    violations.push(
      "STOCKOUT_RISK_MUTATION",
    );
  }

  if (
    differs(
      claims.overstockRisk,
      truth.overstockRisk,
    )
  ) {
    violations.push(
      "OVERSTOCK_RISK_MUTATION",
    );
  }

  if (
    differs(
      claims.dataQualityScore,
      truth.dataQualityScore,
    )
  ) {
    violations.push(
      "DATA_QUALITY_MUTATION",
    );
  }

  if (
    claims.reasonCodes !==
    undefined
  ) {
    const trusted =
      new Set(
        truth.reasonCodes,
      );

    if (
      claims.reasonCodes.some(
        (reasonCode) =>
          !trusted.has(
            reasonCode,
          ),
      )
    ) {
      violations.push(
        "REASON_CODE_MUTATION",
      );
    }
  }

  if (
    violations.length === 0
  ) {
    return {
      status:
        "allowed",

      violations: [],
    };
  }

  return {
    status:
      "violation",

    violations,
  };
}
