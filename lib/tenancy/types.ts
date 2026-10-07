import type {
  OrganizationMemberRole,
  UUID,
} from "@/lib/commerce-domain/types";

export interface AuthenticatedIdentity {
  userId: UUID;
}

export interface TenantMembership {
  userId: UUID;
  organizationId: UUID;
  role: OrganizationMemberRole;
}

export interface TenantContext {
  userId: UUID;
  organizationId: UUID;
  role: OrganizationMemberRole;

  /**
   * Optional current store selection.
   *
   * Store ownership must still be validated independently.
   */
  storeId: UUID | null;
}

export interface RequestedTenantScope {
  organizationId: UUID;
  storeId?: UUID | null;
}
