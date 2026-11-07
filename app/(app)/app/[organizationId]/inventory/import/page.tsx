import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  FileSpreadsheet,
  ShieldCheck,
} from "lucide-react";

import { requireAppIdentity } from "@/lib/auth/app-route";
import { AppError } from "@/lib/observability/app-error";
import {
  isOrganizationProfileIncomplete,
  type OrganizationProfileRecord,
} from "@/lib/organizations/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveServerOrganizationContext } from "@/lib/tenancy/server-organization-context";

export const metadata: Metadata = {
  title: "Inventory import",
};

type StoreSummary = {
  id: string;
  name: string;
  currency: string;
  timezone: string;
};

export default async function InventoryImportEntryPage({
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
      message: "Unable to load organization for inventory import entry.",
      publicMessage: "Unable to load inventory import right now.",
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
      message: "Unable to load stores for inventory import entry.",
      publicMessage: "Unable to load inventory import right now.",
      httpStatus: 500,
      cause: storeError,
    });
  }

  const storeRows = (stores ?? []) as StoreSummary[];
  if (storeRows.length === 0) {
    redirect(`/app/onboarding/store?organizationId=${organizationId}`);
  }

  const primaryStore = storeRows[0]!;

  return (
    <div>
      <div className="flex flex-col gap-5 border-b border-zinc-200 pb-8 sm:pb-10">
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 shadow-sm">
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          Inventory entry point
        </div>

        <ol className="flex flex-wrap gap-2 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
          <li className="rounded-full border border-zinc-200 bg-zinc-100 px-3 py-1 text-zinc-800">
            Organization
          </li>
          <li className="rounded-full border border-zinc-200 bg-zinc-100 px-3 py-1 text-zinc-800">
            First store
          </li>
          <li className="rounded-full border border-zinc-900 bg-zinc-950 px-3 py-1 text-white">
            Inventory
          </li>
          <li className="rounded-full border border-zinc-200 px-3 py-1">
            Decisions
          </li>
        </ol>

        <div className="max-w-3xl">
          <p className="text-sm font-medium text-zinc-500">Next step</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
            Connect inventory when you are ready.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-600">
            {primaryStore.name} is ready as a store boundary. StoreAgent will not
            invent products, stock levels, forecasts, or decisions until real
            inventory source data is imported.
          </p>
        </div>
      </div>

      <section className="grid gap-5 py-8 sm:py-10 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="rounded-3xl border border-zinc-200 bg-white p-7 shadow-sm sm:p-9">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-zinc-950 text-white">
            <FileSpreadsheet className="size-5" aria-hidden="true" />
          </div>

          <p className="mt-8 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
            CSV inventory
          </p>
          <h2 className="mt-3 max-w-xl text-2xl font-semibold tracking-[-0.03em]">
            Import is prepared, not populated.
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-6 text-zinc-600">
            A default Main location exists for {primaryStore.name}. Upload and
            provider binding arrive as a dedicated ingestion workflow. Until
            then, inventory counts remain empty on purpose.
          </p>

          <dl className="mt-8 grid gap-4 text-sm text-zinc-600 sm:grid-cols-3">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
                Store
              </dt>
              <dd className="mt-1 font-medium text-zinc-950">
                {primaryStore.name}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
                Currency
              </dt>
              <dd className="mt-1 font-medium text-zinc-950">
                {primaryStore.currency}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-zinc-500">
                Timezone
              </dt>
              <dd className="mt-1 font-medium text-zinc-950">
                {primaryStore.timezone}
              </dd>
            </div>
          </dl>
        </div>

        <aside className="flex flex-col justify-between rounded-3xl border border-zinc-200 bg-zinc-950 p-7 text-white shadow-sm sm:p-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">
              Decision workspace
            </p>
            <h2 className="mt-3 text-xl font-semibold tracking-[-0.025em]">
              Explore decisions without fake inventory.
            </h2>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              The Actions surface remains demonstration-only until live inventory
              and metric pipelines are connected for this organization.
            </p>
          </div>

          <div className="mt-8 flex flex-col gap-3">
            <Link
              href={`/app/${organizationId}/actions`}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-white px-4 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-100"
            >
              Open decision workspace
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <Link
              href={`/app/${organizationId}`}
              className="inline-flex min-h-11 items-center justify-center rounded-full border border-zinc-700 px-4 text-sm font-medium text-zinc-200 transition hover:border-zinc-500 hover:text-white"
            >
              Back to overview
            </Link>
          </div>
        </aside>
      </section>
    </div>
  );
}
