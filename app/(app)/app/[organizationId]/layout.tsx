import {
  redirect,
} from "next/navigation";

import {
  AppShell,
} from "@/components/app-shell/app-shell";

import {
  requireAppIdentity,
} from "@/lib/auth/app-route";

import {
  createSupabaseServerClient,
} from "@/lib/supabase/server";

import {
  resolveServerOrganizationContext,
} from "@/lib/tenancy/server-organization-context";

export default async function OrganizationLayout({
  children,
  params,
}: LayoutProps<"/app/[organizationId]">) {
  const identity =
    await requireAppIdentity();

  const {
    organizationId,
  } =
    await params;

  const resolution =
    await resolveServerOrganizationContext(
      identity,
      organizationId,
    );

  if (
    !resolution.ok
  ) {
    redirect(
      "/app?tenant_error=organization_access_denied",
    );
  }

  const supabase =
    await createSupabaseServerClient();

  const {
    data:
      organization,
    error,
  } =
    await supabase
      .from(
        "organizations",
      )
      .select(
        "id,name",
      )
      .eq(
        "id",
        resolution.context.organizationId,
      )
      .maybeSingle();

  if (
    error ||
    !organization
  ) {
    throw new Error(
      "Unable to load authorized organization.",
    );
  }

  return (
    <AppShell
      organization={{
        id:
          organization.id,

        name:
          organization.name,
      }}
      identity={{
        email:
          identity.email,
      }}
      role={
        resolution.context.role
      }
    >
      {children}
    </AppShell>
  );
}
