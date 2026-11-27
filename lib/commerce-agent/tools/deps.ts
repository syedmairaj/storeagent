/**
 * AI-ARCH-1b — injectable read ports for L1 tools.
 * Production loaders are NOT wired here; tests / future slices inject ports.
 * Keeps unit tests offline (no Supabase / network).
 */

import type { MerchantInventoryIntelligenceRow } from "@/lib/inventory-intelligence/types";
import type { MerchantPlanningInputs } from "@/lib/planning-inputs/types";

export type L1SkuIntelligencePort = (input: {
  organizationId: string;
  storeId: string;
  locationId: string;
  variantId: string;
}) => Promise<MerchantInventoryIntelligenceRow | null>;

export type L1PlanningInputsPort = (input: {
  organizationId: string;
}) => Promise<MerchantPlanningInputs | null>;

export type L1ToolDeps = {
  getSkuIntelligence: L1SkuIntelligencePort;
  getPlanningInputs: L1PlanningInputsPort;
};

/** Offline fixture port that always misses — useful for negative tests. */
export function createEmptyL1ToolDeps(): L1ToolDeps {
  return {
    getSkuIntelligence: async () => null,
    getPlanningInputs: async () => null,
  };
}

export function createFixtureL1ToolDeps(input: {
  rows?: readonly MerchantInventoryIntelligenceRow[];
  planningByOrg?: ReadonlyMap<string, MerchantPlanningInputs | null>;
}): L1ToolDeps {
  const rows = input.rows ?? [];
  const planningByOrg = input.planningByOrg ?? new Map();

  return {
    getSkuIntelligence: async ({
      organizationId,
      storeId,
      locationId,
      variantId,
    }) => {
      const match = rows.find(
        (row) =>
          row.organizationId === organizationId &&
          row.storeId === storeId &&
          row.locationId === locationId &&
          row.variantId === variantId,
      );
      return match ?? null;
    },
    getPlanningInputs: async ({ organizationId }) => {
      if (!planningByOrg.has(organizationId)) {
        return null;
      }
      return planningByOrg.get(organizationId) ?? null;
    },
  };
}
