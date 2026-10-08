import type {
  StoreAgentEvaluationRisk,
  StoreAgentEvaluationScenario,
} from "@/tests/evaluation/types";

import {
  metricsV1Fixture,
  type MetricsV1EvaluationInput,
} from "@/tests/fixtures/metrics/metrics-v1-matrix";

import {
  metricsV1Goldens,
} from "@/tests/golden/metrics/metrics-v1-matrix";

const metadata:
  Readonly<
    Record<
      string,
      {
        title: string;
        risk:
          StoreAgentEvaluationRisk;
        protects:
          readonly string[];
      }
    >
  > =
{
  "metrics/sales-velocity-normal-v1": {
    "title": "Sales Velocity Normal",
    "risk": "high",
    "protects": [
      "Returns and cancellations must reduce demand before velocity is calculated."
    ]
  },
  "metrics/sales-velocity-zero-demand-v1": {
    "title": "Sales Velocity Zero Demand",
    "risk": "high",
    "protects": [
      "Known zero demand must remain zero rather than becoming unknown."
    ]
  },
  "metrics/sales-velocity-no-eligible-days-v1": {
    "title": "Sales Velocity No Eligible Days",
    "risk": "critical",
    "protects": [
      "No eligible history must fail closed rather than fabricating demand."
    ]
  },
  "metrics/days-of-stock-normal-v1": {
    "title": "Days Of Stock Normal",
    "risk": "high",
    "protects": [
      "Inventory coverage must equal available inventory divided by trusted daily demand."
    ]
  },
  "metrics/days-of-stock-known-zero-inventory-v1": {
    "title": "Days Of Stock Known Zero Inventory",
    "risk": "critical",
    "protects": [
      "Known zero inventory must produce zero coverage."
    ]
  },
  "metrics/days-of-stock-unknown-inventory-v1": {
    "title": "Days Of Stock Unknown Inventory",
    "risk": "critical",
    "protects": [
      "Unknown inventory must not be treated as zero inventory."
    ]
  },
  "metrics/days-of-stock-zero-demand-v1": {
    "title": "Days Of Stock Zero Demand",
    "risk": "critical",
    "protects": [
      "Zero demand must not create an infinite persisted coverage value."
    ]
  },
  "metrics/safety-stock-round-up-v1": {
    "title": "Safety Stock Round Up",
    "risk": "high",
    "protects": [
      "Whole-unit safety stock must round upward."
    ]
  },
  "metrics/reorder-point-basic-v1": {
    "title": "Reorder Point Basic",
    "risk": "critical",
    "protects": [
      "Reorder point must equal lead-time demand plus safety stock."
    ]
  },
  "metrics/target-stock-basic-v1": {
    "title": "Target Stock Basic",
    "risk": "critical",
    "protects": [
      "Target stock must include lead time review period and safety stock."
    ]
  },
  "metrics/order-quantity-valid-incoming-v1": {
    "title": "Order Quantity Valid Incoming",
    "risk": "critical",
    "protects": [
      "Trusted incoming inventory must reduce replenishment need."
    ]
  },
  "metrics/order-quantity-unknown-incoming-v1": {
    "title": "Order Quantity Unknown Incoming",
    "risk": "critical",
    "protects": [
      "Unknown incoming inventory must never be silently converted to zero."
    ]
  },
  "metrics/order-quantity-known-zero-incoming-v1": {
    "title": "Order Quantity Known Zero Incoming",
    "risk": "critical",
    "protects": [
      "Null incoming quantity may mean known zero only when incomingStateKnown is true."
    ]
  },
  "metrics/sell-through-normal-v1": {
    "title": "Sell Through Normal",
    "risk": "medium",
    "protects": [
      "Sell-through must remain a decimal ratio."
    ]
  },
  "metrics/inventory-age-exact-v1": {
    "title": "Inventory Age Exact",
    "risk": "high",
    "protects": [
      "Trusted receipt history must take precedence over estimates."
    ]
  },
  "metrics/inventory-age-estimated-v1": {
    "title": "Inventory Age Estimated",
    "risk": "high",
    "protects": [
      "Estimated age must remain explicitly marked as estimated."
    ]
  },
  "metrics/inventory-age-unavailable-v1": {
    "title": "Inventory Age Unavailable",
    "risk": "high",
    "protects": [
      "Missing age evidence must not fabricate inventory age."
    ]
  },
  "metrics/demand-trend-positive-boundary-v1": {
    "title": "Demand Trend Positive Boundary",
    "risk": "medium",
    "protects": [
      "Exactly positive ten percent remains inside the stable band."
    ]
  },
  "metrics/demand-trend-negative-boundary-v1": {
    "title": "Demand Trend Negative Boundary",
    "risk": "medium",
    "protects": [
      "Exactly negative ten percent remains inside the stable band."
    ]
  },
  "metrics/demand-trend-emerging-from-zero-v1": {
    "title": "Demand Trend Emerging From Zero",
    "risk": "medium",
    "protects": [
      "Demand emerging from known zero must be rising without fabricating a relative ratio."
    ]
  },
  "metrics/stockout-risk-lead-time-boundary-v1": {
    "title": "Stockout Risk Lead Time Boundary",
    "risk": "critical",
    "protects": [
      "Coverage equal to lead time must remain HIGH stockout risk."
    ]
  },
  "metrics/stockout-risk-horizon-boundary-v1": {
    "title": "Stockout Risk Horizon Boundary",
    "risk": "critical",
    "protects": [
      "Coverage equal to replenishment horizon must remain MEDIUM risk."
    ]
  },
  "metrics/stockout-risk-beyond-horizon-v1": {
    "title": "Stockout Risk Beyond Horizon",
    "risk": "critical",
    "protects": [
      "Coverage beyond replenishment horizon must be LOW risk."
    ]
  },
  "metrics/overstock-risk-target-boundary-v1": {
    "title": "Overstock Risk Target Boundary",
    "risk": "critical",
    "protects": [
      "Inventory position equal to target remains LOW overstock risk."
    ]
  },
  "metrics/overstock-risk-high-boundary-v1": {
    "title": "Overstock Risk High Boundary",
    "risk": "critical",
    "protects": [
      "Inventory position exactly 1.5 times target remains MEDIUM risk."
    ]
  },
  "metrics/overstock-risk-above-high-boundary-v1": {
    "title": "Overstock Risk Above High Boundary",
    "risk": "critical",
    "protects": [
      "Inventory position above 1.5 times target must become HIGH risk."
    ]
  },
  "metrics/overstock-zero-target-zero-position-v1": {
    "title": "Overstock Zero Target Zero Position",
    "risk": "high",
    "protects": [
      "Zero target with zero position must remain LOW without division by zero."
    ]
  },
  "metrics/overstock-zero-target-positive-position-v1": {
    "title": "Overstock Zero Target Positive Position",
    "risk": "critical",
    "protects": [
      "Positive inventory against zero target must be HIGH risk without division by zero."
    ]
  },
  "metrics/supplier-no-constraints-v1": {
    "title": "Supplier No Constraints",
    "risk": "high",
    "protects": [
      "No supplier constraints must preserve deterministic base need."
    ]
  },
  "metrics/supplier-moq-v1": {
    "title": "Supplier Moq",
    "risk": "critical",
    "protects": [
      "Positive need below MOQ must increase to MOQ."
    ]
  },
  "metrics/supplier-pack-rounding-v1": {
    "title": "Supplier Pack Rounding",
    "risk": "critical",
    "protects": [
      "Required quantity must round upward to a valid pack multiple."
    ]
  },
  "metrics/supplier-moq-pack-v1": {
    "title": "Supplier Moq Pack",
    "risk": "critical",
    "protects": [
      "MOQ is applied before pack-size rounding."
    ]
  },
  "metrics/supplier-zero-need-v1": {
    "title": "Supplier Zero Need",
    "risk": "critical",
    "protects": [
      "Supplier constraints must never create an order from zero base need."
    ]
  },
  "metrics/po-draft-v1": {
    "title": "Po Draft",
    "risk": "critical",
    "protects": [
      "Draft purchase orders must not suppress reorder need."
    ]
  },
  "metrics/po-submitted-v1": {
    "title": "Po Submitted",
    "risk": "critical",
    "protects": [
      "Submitted purchase orders count as trusted incoming inventory."
    ]
  },
  "metrics/po-partial-v1": {
    "title": "Po Partial",
    "risk": "critical",
    "protects": [
      "Partially received orders count only remaining quantity."
    ]
  },
  "metrics/po-partial-unknown-received-v1": {
    "title": "Po Partial Unknown Received",
    "risk": "critical",
    "protects": [
      "Missing partial receipt quantity must fail closed."
    ]
  },
  "metrics/po-received-v1": {
    "title": "Po Received",
    "risk": "critical",
    "protects": [
      "Fully received purchase orders are no longer incoming."
    ]
  },
  "metrics/po-cancelled-v1": {
    "title": "Po Cancelled",
    "risk": "critical",
    "protects": [
      "Cancelled purchase orders must not suppress reorder need."
    ]
  },
  "metrics/po-unknown-status-v1": {
    "title": "Po Unknown Status",
    "risk": "critical",
    "protects": [
      "Unknown PO status must not be treated as known zero incoming."
    ]
  },
  "metrics/po-over-received-v1": {
    "title": "Po Over Received",
    "risk": "critical",
    "protects": [
      "Over-receipt must never produce negative incoming inventory."
    ]
  },
  "metrics/po-aggregate-valid-v1": {
    "title": "Po Aggregate Valid",
    "risk": "critical",
    "protects": [
      "Trusted incoming PO lines must aggregate their valid remaining quantities."
    ]
  },
  "metrics/po-aggregate-ambiguous-v1": {
    "title": "Po Aggregate Ambiguous",
    "risk": "critical",
    "protects": [
      "One ambiguous PO line makes aggregate incoming state unknown."
    ]
  },
  "metrics/po-aggregate-empty-v1": {
    "title": "Po Aggregate Empty",
    "risk": "critical",
    "protects": [
      "An empty trusted incoming set represents known zero incoming inventory."
    ]
  }
};

const goldenByScenarioId =
  new Map(
    metricsV1Goldens.map(
      (golden) => [
        golden.scenarioId,
        golden,
      ],
    ),
  );

export const METRICS_V1_SCENARIOS:
  readonly StoreAgentEvaluationScenario<
    MetricsV1EvaluationInput,
    unknown
  >[] =
  metricsV1Fixture.input.cases.map(
    (fixtureCase) => {
      const scenarioMetadata =
        metadata[
          fixtureCase.id
        ];

      if (!scenarioMetadata) {
        throw new Error(
          `Missing evaluation metadata for "${fixtureCase.id}".`,
        );
      }

      const golden =
        goldenByScenarioId.get(
          fixtureCase.id,
        );

      if (!golden) {
        throw new Error(
          `Missing approved golden for "${fixtureCase.id}".`,
        );
      }

      return {
        schemaVersion: 1,

        id:
          fixtureCase.id,

        title:
          scenarioMetadata.title,

        domain:
          "metrics",

        risk:
          scenarioMetadata.risk,

        configurationVersion:
          golden.configurationVersion,

        input:
          fixtureCase.evaluation,

        expected:
          golden.expected,

        protects:
          scenarioMetadata.protects,
      };
    },
  );
