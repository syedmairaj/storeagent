import type {
  OrganizationMemberRole,
  UUID,
} from "@/lib/commerce-domain/types";

import type {
  AuthenticatedIdentity,
  RequestedTenantScope,
  TenantContext,
  TenantMembership,
} from "./types";

export interface TenantStoreReference {
  id: UUID;
  organizationId: UUID;
}

export type TenantResolutionFailureCode =
  | "unauthenticated"
  | "organization_required"
  | "membership_not_found"
  | "store_not_found"
  | "store_wrong_organization";

export type TenantResolutionResult =
  | {
      ok: true;
      context: TenantContext;
    }
  | {
      ok: false;
      code: TenantResolutionFailureCode;
    };

export interface ResolveTenantContextInput {
  identity: AuthenticatedIdentity | null;
  requested: RequestedTenantScope | null;
  memberships: readonly TenantMembership[];
  stores: readonly TenantStoreReference[];
}

export function resolveTenantContext(
  input: ResolveTenantContextInput,
): TenantResolutionResult {
  const {
    identity,
    requested,
    memberships,
    stores,
  } = input;

  if (identity === null) {
    return {
      ok: false,
      code: "unauthenticated",
    };
  }

  if (requested === null || !requested.organizationId) {
    return {
      ok: false,
      code: "organization_required",
    };
  }

  const membership = memberships.find(
    (candidate) =>
      candidate.userId === identity.userId &&
      candidate.organizationId === requested.organizationId,
  );

  if (!membership) {
    return {
      ok: false,
      code: "membership_not_found",
    };
  }

  let resolvedStoreId: UUID | null = null;

  if (requested.storeId) {
    const store = stores.find(
      (candidate) => candidate.id === requested.storeId,
    );

    if (!store) {
      return {
        ok: false,
        code: "store_not_found",
      };
    }

    if (store.organizationId !== requested.organizationId) {
      return {
        ok: false,
        code: "store_wrong_organization",
      };
    }

    resolvedStoreId = store.id;
  }

  const role: OrganizationMemberRole = membership.role;

  return {
    ok: true,
    context: {
      userId: identity.userId,
      organizationId: requested.organizationId,
      role,
      storeId: resolvedStoreId,
    },
  };
}
