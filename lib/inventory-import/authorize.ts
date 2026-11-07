import "server-only";

import type { AuthenticatedIdentity } from "@/lib/auth/types";
import type { OrganizationMemberRole } from "@/lib/commerce-domain/types";
import { AppError } from "@/lib/observability/app-error";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { roleHasPermission } from "@/lib/tenancy/permissions";
import { resolveServerOrganizationContext } from "@/lib/tenancy/server-organization-context";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AuthorizedImportScope = {
  organizationId: string;
  storeId: string;
  locationId: string;
  storeName: string;
  locationName: string;
  storeCurrency: string;
  role: OrganizationMemberRole;
};

export async function authorizeMerchantInventoryImport(input: {
  identity: AuthenticatedIdentity;
  organizationId: string;
  storeId: string;
  locationId: string;
}): Promise<
  | { ok: true; scope: AuthorizedImportScope }
  | { ok: false; error: string }
> {
  if (
    !UUID_RE.test(input.organizationId) ||
    !UUID_RE.test(input.storeId) ||
    !UUID_RE.test(input.locationId)
  ) {
    return { ok: false, error: "Store and location are required." };
  }

  const resolution = await resolveServerOrganizationContext(
    input.identity,
    input.organizationId,
  );

  if (!resolution.ok) {
    return {
      ok: false,
      error: "You do not have access to this organization.",
    };
  }

  if (!roleHasPermission(resolution.context.role, "integrations.manage")) {
    return {
      ok: false,
      error: "Only owners and admins can import inventory.",
    };
  }

  const supabase = await createSupabaseServerClient();

  const { data: store, error: storeError } = await supabase
    .from("stores")
    .select("id,name,currency,organization_id")
    .eq("id", input.storeId)
    .eq("organization_id", input.organizationId)
    .maybeSingle();

  if (storeError) {
    throw new AppError({
      code: "DATA_LOAD_FAILED",
      kind: "operational",
      message: "Unable to authorize store for inventory import.",
      publicMessage: "Unable to verify store access right now.",
      httpStatus: 500,
      cause: storeError,
    });
  }

  if (!store) {
    return {
      ok: false,
      error: "Store was not found in this organization.",
    };
  }

  const { data: location, error: locationError } = await supabase
    .from("locations")
    .select("id,name,store_id,organization_id")
    .eq("id", input.locationId)
    .eq("organization_id", input.organizationId)
    .eq("store_id", input.storeId)
    .maybeSingle();

  if (locationError) {
    throw new AppError({
      code: "DATA_LOAD_FAILED",
      kind: "operational",
      message: "Unable to authorize location for inventory import.",
      publicMessage: "Unable to verify location access right now.",
      httpStatus: 500,
      cause: locationError,
    });
  }

  if (!location) {
    return {
      ok: false,
      error: "Location was not found for this store.",
    };
  }

  return {
    ok: true,
    scope: {
      organizationId: input.organizationId,
      storeId: store.id,
      locationId: location.id,
      storeName: store.name,
      locationName: location.name,
      storeCurrency: store.currency,
      role: resolution.context.role,
    },
  };
}
