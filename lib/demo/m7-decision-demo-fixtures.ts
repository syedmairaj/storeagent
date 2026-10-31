/**
 * M7.4b synthetic demonstration fixtures for the Actions workspace.
 *
 * Isolation: static compile-time data only. Must not import persistence,
 * lifecycle RPCs, M5 metric loaders, M6 forecast loaders, or live decision
 * evaluation as a UI data path.
 */

import type {
  ConfidenceLevel,
  InventoryActionPriority,
  InventoryActionType,
} from "@/lib/commerce-domain/types";

export const M7_DEMO_ATTESTATION =
  "m7-synthetic-demonstration-v1" as const;

export type M7DemoAttestation =
  typeof M7_DEMO_ATTESTATION;

export type DemoActionType =
  InventoryActionType;

export interface DemoActionEvidence {
  availableQuantity: number | null;
  incomingQuantity: number | null;
  demandVelocity: number | null;
  daysOfStock: number | null;
  leadTimeDays: number | null;
  safetyStockUnits: number | null;
  reorderPointUnits: number | null;
  targetStockUnits: number | null;
  inventoryAgeDays: number | null;
  forecastExpectedDemandUnits: number | null;
  dataQualityScore: number | null;
  reasonCodes: string[];
}

export interface DemoActionItem {
  id: string;
  actionType: DemoActionType;
  priority: InventoryActionPriority;
  confidence: ConfidenceLevel;
  confidenceReasonCodes: string[];
  productTitle: string;
  variantTitle: string;
  conciseReason: string;
  /**
   * Recommended quantity is presentation-valid only for REORDER when the
   * fixture supplies an explicit positive integer.
   */
  recommendedQuantity: number | null;
  recommendedActionDate: string | null;
  evidence: DemoActionEvidence;
}

export interface DemoHealthySkimItem {
  id: string;
  productTitle: string;
  variantTitle: string;
  note: string;
}

export interface M7DecisionDemoFixtureRoot {
  demoAttestation: M7DemoAttestation;
  storeLabel: string;
  locationLabel: string;
  actions: DemoActionItem[];
  healthySkim: DemoHealthySkimItem[];
}

export type DemoDatasetLoadResult =
  | {
      ok: true;
      dataset: M7DecisionDemoFixtureRoot;
    }
  | {
      ok: false;
      reason: "missing_attestation" | "empty_actions";
    };

const DEMO_FIXTURE: M7DecisionDemoFixtureRoot = {
  demoAttestation: M7_DEMO_ATTESTATION,
  storeLabel: "Demo Northside Market",
  locationLabel: "Main floor — synthetic",
  actions: [
    {
      id: "demo-action-reorder-001",
      actionType: "REORDER",
      priority: "critical",
      confidence: "high",
      confidenceReasonCodes: [
        "stable_recent_velocity",
        "lead_time_covered_by_policy",
      ],
      productTitle: "Atlas Cold Brew Concentrate",
      variantTitle: "1 L bottle",
      conciseReason:
        "Available stock falls below reorder point before lead time covers demand.",
      recommendedQuantity: 24,
      recommendedActionDate: "2026-11-03",
      evidence: {
        availableQuantity: 6,
        incomingQuantity: 0,
        demandVelocity: 2.4,
        daysOfStock: 2.5,
        leadTimeDays: 7,
        safetyStockUnits: 8,
        reorderPointUnits: 18,
        targetStockUnits: 30,
        inventoryAgeDays: 4,
        forecastExpectedDemandUnits: 17,
        dataQualityScore: 0.92,
        reasonCodes: [
          "below_reorder_point",
          "incoming_insufficient",
        ],
      },
    },
    {
      id: "demo-action-reduce-001",
      actionType: "REDUCE",
      priority: "high",
      confidence: "medium",
      confidenceReasonCodes: [
        "elevated_days_of_stock",
      ],
      productTitle: "Harbor Trail Mix",
      variantTitle: "Family pack 500 g",
      conciseReason:
        "Days of stock and inventory age indicate excess exposure on a slow mover.",
      recommendedQuantity: null,
      recommendedActionDate: null,
      evidence: {
        availableQuantity: 86,
        incomingQuantity: 0,
        demandVelocity: 0.6,
        daysOfStock: 143,
        leadTimeDays: 10,
        safetyStockUnits: 6,
        reorderPointUnits: 12,
        targetStockUnits: 20,
        inventoryAgeDays: 61,
        forecastExpectedDemandUnits: 8,
        dataQualityScore: 0.81,
        reasonCodes: [
          "excess_days_of_stock",
          "aging_inventory",
        ],
      },
    },
    {
      id: "demo-action-promote-001",
      actionType: "PROMOTE",
      priority: "medium",
      confidence: "medium",
      confidenceReasonCodes: [
        "clearance_candidate",
      ],
      productTitle: "Solstice Sparkling Water",
      variantTitle: "Case of 12 — seasonal citrus",
      conciseReason:
        "Seasonal variant is aging with soft demand; promote to clear before expiry pressure.",
      recommendedQuantity: null,
      recommendedActionDate: null,
      evidence: {
        availableQuantity: 48,
        incomingQuantity: 0,
        demandVelocity: 0.9,
        daysOfStock: 53,
        leadTimeDays: 5,
        safetyStockUnits: 4,
        reorderPointUnits: 8,
        targetStockUnits: 16,
        inventoryAgeDays: 38,
        forecastExpectedDemandUnits: 6,
        dataQualityScore: 0.77,
        reasonCodes: [
          "seasonal_clearance",
          "soft_demand",
        ],
      },
    },
    {
      id: "demo-action-watch-001",
      actionType: "WATCH",
      priority: "medium",
      confidence: "low",
      confidenceReasonCodes: [
        "conflicting_signals",
        "incomplete_incoming",
      ],
      productTitle: "Cedar Peak Protein Bars",
      variantTitle: "Box of 12 — dark chocolate",
      conciseReason:
        "Signals conflict and key evidence is incomplete — watch rather than act.",
      recommendedQuantity: null,
      recommendedActionDate: null,
      evidence: {
        availableQuantity: 14,
        incomingQuantity: null,
        demandVelocity: null,
        daysOfStock: null,
        leadTimeDays: 9,
        safetyStockUnits: null,
        reorderPointUnits: null,
        targetStockUnits: null,
        inventoryAgeDays: 12,
        forecastExpectedDemandUnits: null,
        dataQualityScore: 0.41,
        reasonCodes: [
          "insufficient_velocity_history",
          "incoming_quantity_unknown",
          "conflicting_days_of_stock_signals",
        ],
      },
    },
    {
      id: "demo-action-watch-stale-001",
      actionType: "WATCH",
      priority: "low",
      confidence: "low",
      confidenceReasonCodes: [
        "stale_evidence",
      ],
      productTitle: "Riverstone Oat Milk",
      variantTitle: "1 L carton",
      conciseReason:
        "Evidence snapshot is stale or incomplete; insufficient basis to reorder or reduce.",
      recommendedQuantity: null,
      recommendedActionDate: null,
      evidence: {
        availableQuantity: null,
        incomingQuantity: null,
        demandVelocity: 1.1,
        daysOfStock: null,
        leadTimeDays: null,
        safetyStockUnits: 5,
        reorderPointUnits: 12,
        targetStockUnits: 20,
        inventoryAgeDays: null,
        forecastExpectedDemandUnits: null,
        dataQualityScore: 0.28,
        reasonCodes: [
          "stale_inventory_observation",
          "missing_available_quantity",
        ],
      },
    },
  ],
  healthySkim: [
    {
      id: "demo-healthy-001",
      productTitle: "Brightleaf Green Tea",
      variantTitle: "20-bag tin",
      note: "No intervention — demonstration. Stock and velocity are within policy bands.",
    },
  ],
};

/**
 * Fail-closed loader: missing attestation yields no action rows.
 */
export function loadM7DecisionDemoDataset(
  fixture: M7DecisionDemoFixtureRoot = DEMO_FIXTURE,
): DemoDatasetLoadResult {
  if (fixture.demoAttestation !== M7_DEMO_ATTESTATION) {
    return {
      ok: false,
      reason: "missing_attestation",
    };
  }

  if (!Array.isArray(fixture.actions) || fixture.actions.length === 0) {
    return {
      ok: false,
      reason: "empty_actions",
    };
  }

  return {
    ok: true,
    dataset: fixture,
  };
}

export function getM7DecisionDemoFixtureRoot(): M7DecisionDemoFixtureRoot {
  return DEMO_FIXTURE;
}

export function demoActionShowsRecommendedQuantity(
  action: DemoActionItem,
): boolean {
  return (
    action.actionType === "REORDER" &&
    typeof action.recommendedQuantity === "number" &&
    Number.isFinite(action.recommendedQuantity) &&
    action.recommendedQuantity > 0
  );
}
