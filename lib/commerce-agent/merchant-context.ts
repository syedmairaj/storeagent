/**
 * AI-ARCH-1a — trusted MerchantContext helpers.
 * Query / model hints never override membership-resolved tenant fields.
 */

import type { OrganizationMemberRole } from "@/lib/commerce-domain/types";
import type { Permission } from "@/lib/tenancy/permissions";
import {
  COMMERCE_AGENT_CONTEXT_VERSION,
  COMMERCE_AGENT_QUERY_VERSION,
  type AgentQuery,
  type MerchantContext,
} from "@/lib/commerce-agent/types";

export type TrustedMerchantContextInput = {
  userId: string;
  organizationId: string;
  role: OrganizationMemberRole;
  permissions: readonly Permission[];
  storeId?: string;
  locationId?: string;
  variantId?: string;
  countryCode?: string | null;
  currencyCode?: string | null;
  asOf?: string;
};

/**
 * Build MerchantContext solely from trusted server-resolved fields.
 * Ignores any AgentQuery / model-proposed tenant identifiers.
 */
export function buildTrustedMerchantContext(
  trusted: TrustedMerchantContextInput,
): MerchantContext {
  const organizationId = trusted.organizationId.trim();
  const userId = trusted.userId.trim();
  if (!organizationId || !userId) {
    throw new Error("TRUSTED_CONTEXT_INCOMPLETE");
  }

  return {
    schemaVersion: COMMERCE_AGENT_CONTEXT_VERSION,
    userId,
    organizationId,
    role: trusted.role,
    permissions: [...trusted.permissions],
    storeId: trusted.storeId?.trim() || undefined,
    locationId: trusted.locationId?.trim() || undefined,
    variantId: trusted.variantId?.trim() || undefined,
    countryCode: trusted.countryCode ?? null,
    currencyCode: trusted.currencyCode ?? null,
    asOf: trusted.asOf ?? new Date().toISOString(),
  };
}

/**
 * Detect when an untrusted query attempts to assert a different org than
 * the trusted MerchantContext. Callers must fail closed — never swap context.
 */
export function queryAttemptsTenantOverride(
  context: MerchantContext,
  query: AgentQuery,
): boolean {
  if (query.schemaVersion !== COMMERCE_AGENT_QUERY_VERSION) {
    return false;
  }
  const hintOrg = query.hintGrain?.organizationId?.trim() ?? "";
  if (!hintOrg) {
    return false;
  }
  return hintOrg !== context.organizationId;
}

/**
 * Return the trusted organizationId always — never the query hint.
 */
export function resolveAuthoritativeOrganizationId(
  context: MerchantContext,
): string {
  return context.organizationId;
}
