import "server-only";

import type {
  AuthenticatedIdentity,
} from "@/lib/auth/types";

import type {
  OrganizationMemberRole,
} from "@/lib/commerce-domain/types";

import {
  resolveTenantContext,
  type TenantResolutionResult,
} from "@/lib/tenancy/resolve-context";

import {
  createSupabaseServerClient,
} from "@/lib/supabase/server";

const ORGANIZATION_MEMBER_ROLES =
  new Set<OrganizationMemberRole>([
    "owner",
    "admin",
    "analyst",
    "operator",
  ]);

export class TenantPersistenceError
  extends Error {
  constructor() {
    super(
      "Unable to resolve tenant persistence.",
    );

    this.name =
      "TenantPersistenceError";
  }
}

function isOrganizationMemberRole(
  value: unknown,
): value is OrganizationMemberRole {
  return (
    typeof value === "string" &&
    ORGANIZATION_MEMBER_ROLES.has(
      value as OrganizationMemberRole,
    )
  );
}

export async function resolveServerOrganizationContext(
  identity:
    AuthenticatedIdentity,

  organizationId:
    string,
): Promise<TenantResolutionResult> {
  if (
    organizationId.trim().length === 0
  ) {
    return {
      ok: false,
      code: "organization_required",
    };
  }

  const supabase =
    await createSupabaseServerClient();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "organization_members",
      )
      .select(
        "organization_id,user_id,role",
      )
      .eq(
        "organization_id",
        organizationId,
      )
      .eq(
        "user_id",
        identity.userId,
      )
      .maybeSingle();

  if (
    error
  ) {
    throw new TenantPersistenceError();
  }

  if (
    data &&
    !isOrganizationMemberRole(
      data.role,
    )
  ) {
    throw new TenantPersistenceError();
  }

  return resolveTenantContext({
    identity: {
      userId:
        identity.userId,
    },

    requested: {
      organizationId,
    },

    memberships:
      data
        ? [
            {
              userId:
                data.user_id,

              organizationId:
                data.organization_id,

              role:
                data.role,
            },
          ]
        : [],

    stores: [],
  });
}
