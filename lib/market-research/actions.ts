"use server";

/**
 * AI-MKT-1e — thin server action for guarded merchant research.
 * Client supplies grain + supported intent/country/depth only.
 * Never accepts synthetic fixtures, forceEnabled, licenseOk, adapters, or bounds.
 * Production path never orchestrates — preview isolation is ports-only.
 */

import { requireAppIdentity } from "@/lib/auth/app-route";
import type { AuthenticatedIdentity } from "@/lib/auth/types";
import { loadMerchantInventoryIntelligence } from "@/lib/inventory-intelligence/load";
import {
  runGuardedMerchantResearch,
  type MerchantResearchInput,
} from "@/lib/market-research/merchant-research";
import type { MerchantResearchDto } from "@/lib/market-research/merchant-response";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveServerOrganizationContext } from "@/lib/tenancy/server-organization-context";

/**
 * Guarded structured market research for the SKU inspector.
 * Default OFF. Synthetic preview is NOT available through this production action.
 */
export async function runMarketResearchAction(
  input: MerchantResearchInput,
): Promise<MerchantResearchDto> {
  return runGuardedMerchantResearch(input, {
    requireIdentity: async () => {
      const identity = await requireAppIdentity();
      return { userId: identity.userId };
    },
    resolveOrganization: async (identity, orgId) => {
      const supabase = await createSupabaseServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        return { ok: false };
      }

      const authIdentity: AuthenticatedIdentity = {
        userId: identity.userId,
        email: user.email ?? null,
      };

      const resolution = await resolveServerOrganizationContext(
        authIdentity,
        orgId,
      );

      if (!resolution.ok) {
        return { ok: false };
      }

      return {
        ok: true,
        context: {
          organizationId: resolution.context.organizationId,
          role: resolution.context.role,
        },
      };
    },
    loadIntelligenceRows: async (orgId) => {
      const intelligence = await loadMerchantInventoryIntelligence(orgId);
      return intelligence.rows;
    },
    // previewIsolation intentionally omitted — production never injects fixtures.
    enforceProductionEnvIsolation: true,
  });
}
