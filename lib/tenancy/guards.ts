import type {
  RequestedTenantScope,
  TenantContext,
  TenantMembership,
} from "./types";

export function membershipAuthorizesOrganization(
  membership: TenantMembership,
  userId: string,
  organizationId: string,
): boolean {
  return (
    membership.userId === userId &&
    membership.organizationId === organizationId
  );
}

export function tenantContextMatchesOrganization(
  context: TenantContext,
  organizationId: string,
): boolean {
  return context.organizationId === organizationId;
}

export function tenantContextMatchesRequestedScope(
  context: TenantContext,
  requested: RequestedTenantScope,
): boolean {
  if (context.organizationId !== requested.organizationId) {
    return false;
  }

  if (
    requested.storeId !== undefined &&
    requested.storeId !== null &&
    context.storeId !== null &&
    requested.storeId !== context.storeId
  ) {
    return false;
  }

  return true;
}
