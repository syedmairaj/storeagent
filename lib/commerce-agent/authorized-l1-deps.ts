/**
 * AI-ARCH-1e — L1 tool deps bound to membership-scoped authorized loaders.
 * No service-role bypass. Call only after auth + enablement gates pass.
 */

import type { L1ToolDeps } from "@/lib/commerce-agent/tools/deps";
import { loadMerchantInventoryIntelligence } from "@/lib/inventory-intelligence/load";
import { loadMerchantPlanningInputs } from "@/lib/planning-inputs";

/**
 * Build injectable L1 ports over existing authorized loaders.
 * Grain lookups remain organization-scoped via the loader contracts.
 */
export function createAuthorizedL1ToolDeps(): L1ToolDeps {
  return {
    getSkuIntelligence: async ({
      organizationId,
      storeId,
      locationId,
      variantId,
    }) => {
      const intelligence =
        await loadMerchantInventoryIntelligence(organizationId);
      return (
        intelligence.rows.find(
          (row) =>
            row.organizationId === organizationId &&
            row.storeId === storeId &&
            row.locationId === locationId &&
            row.variantId === variantId,
        ) ?? null
      );
    },
    getPlanningInputs: async ({ organizationId }) => {
      return loadMerchantPlanningInputs(organizationId);
    },
  };
}
