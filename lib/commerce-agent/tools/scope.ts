/**
 * AI-ARCH-1b — tenant / grain scope checks against trusted MerchantContext.
 */

import type { MerchantContext } from "@/lib/commerce-agent/types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

export type GrainScopeInput = {
  organizationId?: unknown;
  storeId?: unknown;
  locationId?: unknown;
  variantId?: unknown;
};

export type ScopeFailureCode =
  | "MALFORMED_INPUT"
  | "TENANT_SCOPE_MISMATCH"
  | "PERMISSION_DENIED";

/**
 * Fail closed: untrusted input org/store/location/variant must match
 * trusted MerchantContext when context pins those fields.
 * organizationId in input, if present, must equal context.organizationId.
 */
export function assertGrainScope(
  context: MerchantContext,
  grain: GrainScopeInput,
): { ok: true } | { ok: false; code: ScopeFailureCode; detail: string } {
  const org =
    typeof grain.organizationId === "string"
      ? grain.organizationId.trim()
      : "";
  if (org) {
    if (!isUuid(org)) {
      return {
        ok: false,
        code: "MALFORMED_INPUT",
        detail: "organizationId must be a UUID.",
      };
    }
    if (org !== context.organizationId) {
      return {
        ok: false,
        code: "TENANT_SCOPE_MISMATCH",
        detail: "organizationId does not match trusted merchant context.",
      };
    }
  }

  const store =
    typeof grain.storeId === "string" ? grain.storeId.trim() : undefined;
  if (store !== undefined) {
    if (!isUuid(store)) {
      return {
        ok: false,
        code: "MALFORMED_INPUT",
        detail: "storeId must be a UUID.",
      };
    }
    if (context.storeId && store !== context.storeId) {
      return {
        ok: false,
        code: "TENANT_SCOPE_MISMATCH",
        detail: "storeId does not match trusted merchant context.",
      };
    }
  }

  const location =
    typeof grain.locationId === "string"
      ? grain.locationId.trim()
      : undefined;
  if (location !== undefined) {
    if (!isUuid(location)) {
      return {
        ok: false,
        code: "MALFORMED_INPUT",
        detail: "locationId must be a UUID.",
      };
    }
    if (context.locationId && location !== context.locationId) {
      return {
        ok: false,
        code: "TENANT_SCOPE_MISMATCH",
        detail: "locationId does not match trusted merchant context.",
      };
    }
  }

  const variant =
    typeof grain.variantId === "string"
      ? grain.variantId.trim()
      : undefined;
  if (variant !== undefined) {
    if (!isUuid(variant)) {
      return {
        ok: false,
        code: "MALFORMED_INPUT",
        detail: "variantId must be a UUID.",
      };
    }
    if (context.variantId && variant !== context.variantId) {
      return {
        ok: false,
        code: "TENANT_SCOPE_MISMATCH",
        detail: "variantId does not match trusted merchant context.",
      };
    }
  }

  return { ok: true };
}

export function contextHasToolPermission(
  context: MerchantContext,
  permission: string,
): boolean {
  return context.permissions.includes(
    permission as MerchantContext["permissions"][number],
  );
}
