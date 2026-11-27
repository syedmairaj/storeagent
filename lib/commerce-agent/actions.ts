"use server";

/**
 * AI-ARCH-1e — thin server action for guarded merchant intelligence.
 * Client supplies grain + structured intent only. No public API route.
 * Never accepts forceEnabled, draftAdapter, config, or tool deps from the browser.
 */

import { requireAppIdentity } from "@/lib/auth/app-route";
import type { AuthenticatedIdentity } from "@/lib/auth/types";
import { createAuthorizedL1ToolDeps } from "@/lib/commerce-agent/authorized-l1-deps";
import {
  runGuardedMerchantInvestigation,
  type MerchantInvestigationInput,
} from "@/lib/commerce-agent/merchant-investigation";
import type { MerchantInvestigationDto } from "@/lib/commerce-agent/merchant-response";
import { loadStoreIncomingEvidenceAttestations } from "@/lib/incoming-evidence/load";
import type { IncomingTrustClass } from "@/lib/inventory-explainer/types";
import { loadMerchantInventoryIntelligence } from "@/lib/inventory-intelligence/load";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveServerOrganizationContext } from "@/lib/tenancy/server-organization-context";

function resolveIncomingTrustClass(
  storeId: string,
  attestations: readonly { storeId: string; evidenceComplete: boolean }[],
): IncomingTrustClass {
  const match = attestations.find((item) => item.storeId === storeId);
  if (match?.evidenceComplete === true) {
    return "attested_complete";
  }
  return "unknown";
}

/**
 * Guarded structured-intent investigation for the SKU inspector.
 * Soft-enable default OFF. Activation remains OFF.
 */
export async function runCommerceAgentInvestigationAction(
  input: MerchantInvestigationInput,
): Promise<MerchantInvestigationDto> {
  const organizationId = input.organizationId?.trim() ?? "";

  return runGuardedMerchantInvestigation(input, {
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
    createToolDeps: () => createAuthorizedL1ToolDeps(),
    resolveIncomingTrust: async (storeId) => {
      if (!organizationId) {
        return "unknown";
      }
      try {
        const attestations =
          await loadStoreIncomingEvidenceAttestations(organizationId);
        return resolveIncomingTrustClass(storeId, attestations);
      } catch {
        return "unknown";
      }
    },
  });
}
