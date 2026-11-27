/**
 * AI-MKT-1a — trusted research scope resolution.
 *
 * organizationId / grain come only from MerchantContext.
 * Reject foreign tenant, forged scope, adapter overrides, malformed requests.
 */

import {
  COMMERCE_AGENT_CONTEXT_VERSION,
  type MerchantContext,
} from "@/lib/commerce-agent/types";
import type { ResearchFailureCode } from "@/lib/market-research/types";

export type TrustedResearchScope = {
  organizationId: string;
  storeId?: string;
  variantId?: string;
  countryCode?: string | null;
  currencyCode?: string | null;
  asOf: string;
  userId: string;
};

export type ResearchScopeResolution =
  | { ok: true; scope: TrustedResearchScope }
  | {
      ok: false;
      code: ResearchFailureCode;
      detail: string;
    };

/**
 * Fields that must never be accepted from untrusted request / adapter payloads
 * as authority for tenant scope or licensing.
 */
export const FORBIDDEN_SCOPE_OVERRIDE_KEYS = [
  "licenseOk",
  "policy",
  "permissions",
  "approval",
  "sourcePolicy",
  "rightsClass",
  "adapterOverride",
  "adapterId",
  "forceOrganizationId",
  "impersonateOrganizationId",
] as const;

export type UntrustedResearchScopeHints = {
  organizationId?: unknown;
  storeId?: unknown;
  variantId?: unknown;
  countryCode?: unknown;
  currencyCode?: unknown;
  adapterOverride?: unknown;
  adapterId?: unknown;
  licenseOk?: unknown;
  policy?: unknown;
  permissions?: unknown;
  approval?: unknown;
  sourcePolicy?: unknown;
  rightsClass?: unknown;
  forceOrganizationId?: unknown;
  impersonateOrganizationId?: unknown;
  [key: string]: unknown;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Resolve research organization / grain solely from trusted MerchantContext.
 * Untrusted hints may only be checked for mismatch — never applied.
 */
export function resolveTrustedResearchScope(input: {
  merchantContext: MerchantContext;
  untrustedHints?: UntrustedResearchScopeHints | null;
}): ResearchScopeResolution {
  const context = input.merchantContext;

  if (!context || typeof context !== "object") {
    return {
      ok: false,
      code: "MALFORMED_REQUEST",
      detail: "MerchantContext is required",
    };
  }

  if (context.schemaVersion !== COMMERCE_AGENT_CONTEXT_VERSION) {
    return {
      ok: false,
      code: "MALFORMED_REQUEST",
      detail: `Unsupported MerchantContext schemaVersion '${String(context.schemaVersion)}'`,
    };
  }

  const organizationId = context.organizationId?.trim() ?? "";
  const userId = context.userId?.trim() ?? "";
  if (!organizationId || !userId) {
    return {
      ok: false,
      code: "UNAUTHORIZED",
      detail: "Trusted MerchantContext missing organizationId or userId",
    };
  }

  const hints = input.untrustedHints;
  if (hints && typeof hints === "object") {
    for (const key of FORBIDDEN_SCOPE_OVERRIDE_KEYS) {
      if (hints[key] !== undefined) {
        return {
          ok: false,
          code: "FORGED_POLICY_INPUT",
          detail: `Forbidden untrusted override key '${key}'`,
        };
      }
    }

    if (
      isNonEmptyString(hints.organizationId) &&
      hints.organizationId.trim() !== organizationId
    ) {
      return {
        ok: false,
        code: "TENANT_SCOPE_MISMATCH",
        detail: "Untrusted organizationId does not match MerchantContext",
      };
    }

    if (
      isNonEmptyString(hints.storeId) &&
      context.storeId &&
      hints.storeId.trim() !== context.storeId
    ) {
      return {
        ok: false,
        code: "TENANT_SCOPE_MISMATCH",
        detail: "Untrusted storeId does not match MerchantContext",
      };
    }

    if (
      isNonEmptyString(hints.variantId) &&
      context.variantId &&
      hints.variantId.trim() !== context.variantId
    ) {
      return {
        ok: false,
        code: "TENANT_SCOPE_MISMATCH",
        detail: "Untrusted variantId does not match MerchantContext",
      };
    }
  }

  return {
    ok: true,
    scope: {
      organizationId,
      storeId: context.storeId,
      variantId: context.variantId,
      countryCode: context.countryCode ?? null,
      currencyCode: context.currencyCode ?? null,
      asOf: context.asOf,
      userId,
    },
  };
}

/**
 * Distinguishes retrieval time from actual observation time.
 * Unknown observation must not be treated as current.
 */
export function resolveEvidenceTimeClasses(input: {
  retrievedAt: string;
  observationPeriodStart?: string | null;
  observationPeriodEnd?: string | null;
}): {
  retrievedAt: string;
  observationKnown: boolean;
  freshnessClass: "current" | "stale" | "unknown";
} {
  const retrievedAt = input.retrievedAt?.trim() ?? "";
  const start = input.observationPeriodStart?.trim() || null;
  const end = input.observationPeriodEnd?.trim() || null;

  if (!retrievedAt || Number.isNaN(Date.parse(retrievedAt))) {
    return {
      retrievedAt: retrievedAt || "",
      observationKnown: false,
      freshnessClass: "unknown",
    };
  }

  if (!start && !end) {
    // Retrieval ≠ observation. Unknown observation stays unknown.
    return {
      retrievedAt,
      observationKnown: false,
      freshnessClass: "unknown",
    };
  }

  const observationAnchor = end ?? start;
  if (!observationAnchor || Number.isNaN(Date.parse(observationAnchor))) {
    return {
      retrievedAt,
      observationKnown: false,
      freshnessClass: "unknown",
    };
  }

  const retrievedMs = Date.parse(retrievedAt);
  const observedMs = Date.parse(observationAnchor);
  const ageMs = retrievedMs - observedMs;
  // > 7 days between observation end and retrieval → stale heuristic for 1a.
  const STALE_MS = 7 * 24 * 60 * 60 * 1000;
  if (ageMs > STALE_MS) {
    return {
      retrievedAt,
      observationKnown: true,
      freshnessClass: "stale",
    };
  }

  return {
    retrievedAt,
    observationKnown: true,
    freshnessClass: "current",
  };
}
