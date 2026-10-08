import {
  applySupplierOrderConstraints,
  calculateDaysOfStock,
  calculateDemandTrend,
  calculateInventoryAge,
  calculateOverstockRisk,
  calculateRecommendedOrderQuantity,
  calculateReorderPoint,
  calculateSafetyStock,
  calculateSalesVelocity,
  calculateSellThrough,
  calculateStockoutRisk,
  calculateTargetStock,
  calculateValidIncomingPurchaseOrderLine,
  calculateValidIncomingPurchaseOrders,
} from "@/lib/metrics/inventory-math";

import type {
  DaysOfStockInput,
  DemandTrendInput,
  IncomingPurchaseOrderLineInput,
  InventoryAgeInput,
  OverstockRiskInput,
  RecommendedOrderQuantityInput,
  ReorderPointInput,
  SafetyStockInput,
  SalesVelocityInput,
  SellThroughInput,
  StockoutRiskInput,
  SupplierOrderConstraintInput,
  TargetStockInput,
} from "@/lib/metrics/types";

export type MetricsEvaluationCase =
  | {
      operation: "sales_velocity";
      input: SalesVelocityInput;
      expected: ReturnType<typeof calculateSalesVelocity>;
    }
  | {
      operation: "days_of_stock";
      input: DaysOfStockInput;
      expected: ReturnType<typeof calculateDaysOfStock>;
    }
  | {
      operation: "safety_stock";
      input: SafetyStockInput;
      expected: ReturnType<typeof calculateSafetyStock>;
    }
  | {
      operation: "reorder_point";
      input: ReorderPointInput;
      expected: ReturnType<typeof calculateReorderPoint>;
    }
  | {
      operation: "target_stock";
      input: TargetStockInput;
      expected: ReturnType<typeof calculateTargetStock>;
    }
  | {
      operation: "recommended_order_quantity";
      input: RecommendedOrderQuantityInput;
      expected: ReturnType<
        typeof calculateRecommendedOrderQuantity
      >;
    }
  | {
      operation: "sell_through";
      input: SellThroughInput;
      expected: ReturnType<typeof calculateSellThrough>;
    }
  | {
      operation: "inventory_age";
      input: InventoryAgeInput;
      expected: ReturnType<typeof calculateInventoryAge>;
    }
  | {
      operation: "demand_trend";
      input: DemandTrendInput;
      expected: ReturnType<typeof calculateDemandTrend>;
    }
  | {
      operation: "stockout_risk";
      input: StockoutRiskInput;
      expected: ReturnType<typeof calculateStockoutRisk>;
    }
  | {
      operation: "overstock_risk";
      input: OverstockRiskInput;
      expected: ReturnType<typeof calculateOverstockRisk>;
    }
  | {
      operation: "supplier_constraints";
      input: SupplierOrderConstraintInput;
      expected: ReturnType<typeof applySupplierOrderConstraints>;
    }
  | {
      operation: "incoming_po_line";
      input: IncomingPurchaseOrderLineInput;
      expected: ReturnType<
        typeof calculateValidIncomingPurchaseOrderLine
      >;
    }
  | {
      operation: "incoming_po_aggregate";
      input: readonly IncomingPurchaseOrderLineInput[];
      expected: ReturnType<
        typeof calculateValidIncomingPurchaseOrders
      >;
    };

export function runMetricsEvaluationCase(
  evaluationCase: MetricsEvaluationCase,
): MetricsEvaluationCase["expected"] {
  switch (evaluationCase.operation) {
    case "sales_velocity":
      return calculateSalesVelocity(
        evaluationCase.input,
      );

    case "days_of_stock":
      return calculateDaysOfStock(
        evaluationCase.input,
      );

    case "safety_stock":
      return calculateSafetyStock(
        evaluationCase.input,
      );

    case "reorder_point":
      return calculateReorderPoint(
        evaluationCase.input,
      );

    case "target_stock":
      return calculateTargetStock(
        evaluationCase.input,
      );

    case "recommended_order_quantity":
      return calculateRecommendedOrderQuantity(
        evaluationCase.input,
      );

    case "sell_through":
      return calculateSellThrough(
        evaluationCase.input,
      );

    case "inventory_age":
      return calculateInventoryAge(
        evaluationCase.input,
      );

    case "demand_trend":
      return calculateDemandTrend(
        evaluationCase.input,
      );

    case "stockout_risk":
      return calculateStockoutRisk(
        evaluationCase.input,
      );

    case "overstock_risk":
      return calculateOverstockRisk(
        evaluationCase.input,
      );

    case "supplier_constraints":
      return applySupplierOrderConstraints(
        evaluationCase.input,
      );

    case "incoming_po_line":
      return calculateValidIncomingPurchaseOrderLine(
        evaluationCase.input,
      );

    case "incoming_po_aggregate":
      return calculateValidIncomingPurchaseOrders(
        evaluationCase.input,
      );
  }
}
