import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Database,
  FileSpreadsheet,
  ShieldCheck,
  Sparkles,
  Store,
} from "lucide-react";

import { requireAppIdentity } from "@/lib/auth/app-route";
import { AppError } from "@/lib/observability/app-error";
import {
  isOrganizationProfileIncomplete,
  type OrganizationProfileRecord,
} from "@/lib/organizations/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveServerOrganizationContext } from "@/lib/tenancy/server-organization-context";

type StoreSummary = {
  id: string;
  name: string;
  currency: string;
  timezone: string;
};

export default async function OrganizationHome({
  params,
}: PageProps<"/app/[organizationId]">) {
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
      message: "Unable to load organization overview.",
      publicMessage: "Unable to load this workspace right now.",
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
      message: "Unable to load organization stores.",
      publicMessage: "Unable to load this workspace right now.",
      httpStatus: 500,
      cause: storeError,
    });
  }

  const storeRows = (stores ?? []) as StoreSummary[];
  const canCreateStore =
    resolution.context.role === "owner" ||
    resolution.context.role === "admin";

  if (storeRows.length === 0 && canCreateStore) {
    redirect(`/app/onboarding/store?organizationId=${organizationId}`);
  }

  const hasStore = storeRows.length > 0;
  const primaryStore = storeRows[0] ?? null;

  return (
    <div>
      <div className="flex flex-col gap-5 border-b border-zinc-200 pb-8 sm:pb-10">
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 shadow-sm">
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          Authorized organization context
        </div>

        <ol className="flex flex-wrap gap-2 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          <li className="rounded-full border border-zinc-200 bg-zinc-100 px-3 py-1 text-zinc-800">
            Organization
          </li>
          <li
            className={
              hasStore
                ? "rounded-full border border-zinc-200 bg-zinc-100 px-3 py-1 text-zinc-800"
                : "rounded-full border border-zinc-200 px-3 py-1"
            }
          >
            First store
          </li>
          <li className="rounded-full border border-zinc-200 px-3 py-1">
            Inventory
          </li>
          <li className="rounded-full border border-zinc-200 px-3 py-1">
            Decisions
          </li>
        </ol>

        <div className="max-w-3xl">
          <p className="text-sm font-medium text-zinc-500">Overview</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
            {hasStore
              ? "Your store boundary is ready."
              : "Waiting for the first store."}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-600">
            {hasStore
              ? "Organization and store setup are complete. Inventory import and decisions stay empty until real source data arrives."
              : "This organization has no store yet. An owner or admin needs to create the first store before inventory import can begin."}
          </p>
        </div>
      </div>

      <section className="py-8 sm:py-10">
        <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
          <div className="rounded-3xl border border-zinc-200 bg-white p-7 shadow-sm sm:p-9">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-zinc-950 text-white">
              {hasStore ? (
                <Store className="size-5" aria-hidden="true" />
              ) : (
                <Database className="size-5" aria-hidden="true" />
              )}
            </div>

            <p className="mt-8 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Current state
            </p>

            <h2 className="mt-3 max-w-xl text-2xl font-semibold tracking-[-0.03em]">
              {hasStore
                ? `${primaryStore!.name} is active — no inventory imported yet.`
                : "No store has been created for this organization."}
            </h2>

            <p className="mt-4 max-w-xl text-sm leading-6 text-zinc-600">
              StoreAgent does not fabricate SKUs, stock positions, forecasts, or
              recommendations. Only completed setup stages are shown as done.
            </p>

            {hasStore ? (
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href={`/app/${organizationId}/inventory/import`}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800"
                >
                  <FileSpreadsheet className="size-4" aria-hidden="true" />
                  Inventory import entry
                </Link>
                <Link
                  href={`/app/${organizationId}/actions`}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-zinc-200 px-4 text-sm font-medium text-zinc-700 transition hover:border-zinc-300 hover:text-zinc-950"
                >
                  Decision workspace
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </div>
            ) : (
              <p className="mt-8 text-sm font-medium text-zinc-400">
                Ask an owner or admin to finish first-store setup
              </p>
            )}
          </div>

          <aside className="rounded-3xl border border-zinc-200 bg-zinc-950 p-7 text-white shadow-sm sm:p-8">
            <Sparkles className="size-5 text-zinc-300" aria-hidden="true" />

            <p className="mt-8 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">
              Foundation
            </p>

            <h2 className="mt-3 text-xl font-semibold tracking-[-0.025em]">
              Tenant boundary active
            </h2>

            <p className="mt-3 text-sm leading-6 text-zinc-400">
              Authentication, explicit organization selection, and store
              creation stay on separate trusted boundaries. No first-store
              fallback is used for authorization.
            </p>

            {primaryStore ? (
              <dl className="mt-8 space-y-3 text-sm text-zinc-300">
                <div>
                  <dt className="text-xs uppercase tracking-[0.12em] text-zinc-500">
                    Store
                  </dt>
                  <dd className="mt-1 font-medium text-white">
                    {primaryStore.name}
                  </dd>
                </div>
                <div className="flex gap-6">
                  <div>
                    <dt className="text-xs uppercase tracking-[0.12em] text-zinc-500">
                      Currency
                    </dt>
                    <dd className="mt-1 font-medium text-white">
                      {primaryStore.currency}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-[0.12em] text-zinc-500">
                      Timezone
                    </dt>
                    <dd className="mt-1 font-medium text-white">
                      {primaryStore.timezone}
                    </dd>
                  </div>
                </div>
              </dl>
            ) : (
              <p className="mt-8 break-all font-mono text-[10px] leading-5 text-zinc-500">
                {organizationId}
              </p>
            )}
          </aside>
        </div>
      </section>
    </div>
  );
}
