import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import { SalesImportWizard } from "@/components/sales-import/sales-import-wizard";
import { requireAppIdentity } from "@/lib/auth/app-route";
import { AppError } from "@/lib/observability/app-error";
import {
  isOrganizationProfileIncomplete,
  type OrganizationProfileRecord,
} from "@/lib/organizations/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { roleHasPermission } from "@/lib/tenancy/permissions";
import { resolveServerOrganizationContext } from "@/lib/tenancy/server-organization-context";

export const metadata: Metadata = {
  title: "Sales import",
};

type StoreSummary = {
  id: string;
  name: string;
  currency: string;
  timezone: string;
};

type LocationSummary = {
  id: string;
  store_id: string;
  name: string;
};

export default async function SalesImportEntryPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const identity = await requireAppIdentity();
  const { organizationId } = await params;

  const resolution = await resolveServerOrganizationContext(
    identity,
    organizationId,
  );

  if (!resolution.ok) {
    redirect("/app?tenant_error=organization_access_denied");
  }

  const supabase = await createSupabaseServerClient();

  const { data: organization, error: organizationError } = await supabase
    .from("organizations")
    .select("id,name,country_code,default_currency,timezone")
    .eq("id", organizationId)
    .maybeSingle();

  if (organizationError || !organization) {
    throw new AppError({
      code: "DATA_LOAD_FAILED",
      kind: "operational",
      message: "Unable to load organization for sales import.",
      publicMessage: "Unable to load sales import right now.",
      httpStatus: 500,
      cause: organizationError,
    });
  }

  const org = organization as OrganizationProfileRecord;
  if (isOrganizationProfileIncomplete(org)) {
    redirect(`/app/onboarding?organizationId=${organizationId}`);
  }

  const { data: stores, error: storeError } = await supabase
    .from("stores")
    .select("id,name,currency,timezone")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  if (storeError) {
    throw new AppError({
      code: "DATA_LOAD_FAILED",
      kind: "operational",
      message: "Unable to load stores for sales import.",
      publicMessage: "Unable to load sales import right now.",
      httpStatus: 500,
      cause: storeError,
    });
  }

  const storeRows = (stores ?? []) as StoreSummary[];
  if (storeRows.length === 0) {
    redirect(`/app/onboarding/store?organizationId=${organizationId}`);
  }

  const { data: locations, error: locationError } = await supabase
    .from("locations")
    .select("id,store_id,name")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true });

  if (locationError) {
    throw new AppError({
      code: "DATA_LOAD_FAILED",
      kind: "operational",
      message: "Unable to load locations for sales import.",
      publicMessage: "Unable to load sales import right now.",
      httpStatus: 500,
      cause: locationError,
    });
  }

  const locationRows = ((locations ?? []) as LocationSummary[]).map(
    (location) => ({
      id: location.id,
      storeId: location.store_id,
      name: location.name,
    }),
  );

  const canImport = roleHasPermission(
    resolution.context.role,
    "integrations.manage",
  );

  return (
    <div>
      <div className="flex flex-col gap-5 border-b border-zinc-200 pb-8 sm:pb-10">
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 shadow-sm">
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          Trusted sales CSV import
        </div>

        <ol className="flex flex-wrap gap-2 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          <li className="rounded-full border border-zinc-200 bg-zinc-100 px-3 py-1 text-zinc-800">
            Organization
          </li>
          <li className="rounded-full border border-zinc-200 bg-zinc-100 px-3 py-1 text-zinc-800">
            First store
          </li>
          <li className="rounded-full border border-zinc-200 bg-zinc-100 px-3 py-1 text-zinc-800">
            Inventory
          </li>
          <li className="rounded-full border border-zinc-900 bg-zinc-950 px-3 py-1 text-white">
            Sales history
          </li>
          <li className="rounded-full border border-zinc-200 px-3 py-1">
            Decisions
          </li>
        </ol>

        <div className="max-w-3xl">
          <p className="text-sm font-medium text-zinc-500">Sales import</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
            Import sales history
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-600">
            Persist genuine order lines into the canonical commerce model. Cover
            and velocity stay blocked until an authorized M5 metric recompute
            produces grain-aligned demand — raw orders alone are not enough.
          </p>
        </div>
      </div>

      <div className="py-8 sm:py-10">
        <SalesImportWizard
          organizationId={organizationId}
          stores={storeRows}
          locations={locationRows}
          canImport={canImport}
        />
      </div>
    </div>
  );
}
