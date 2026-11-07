import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Boxes,
  FileSpreadsheet,
  ShieldCheck,
} from "lucide-react";

import { DecisionReadinessPanel } from "@/components/inventory-readiness/decision-readiness-panel";
import { requireAppIdentity } from "@/lib/auth/app-route";
import { loadMerchantDecisionReadiness } from "@/lib/inventory-readiness";
import { AppError } from "@/lib/observability/app-error";
import {
  isOrganizationProfileIncomplete,
  type OrganizationProfileRecord,
} from "@/lib/organizations/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveServerOrganizationContext } from "@/lib/tenancy/server-organization-context";

export const metadata: Metadata = {
  title: "Inventory",
};

type InventoryRow = {
  id: string;
  observed_at: string;
  available_quantity: number | null;
  on_hand_quantity: number | null;
  committed_quantity: number | null;
  incoming_quantity: number | null;
  source: string;
  store_id: string;
  location_id: string;
  variant_id: string;
};

type VariantRow = {
  id: string;
  sku: string;
  title: string | null;
};

type StoreRow = {
  id: string;
  name: string;
};

type LocationRow = {
  id: string;
  name: string;
};

export default async function InventoryPage({
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
      message: "Unable to load organization inventory.",
      publicMessage: "Unable to load inventory right now.",
      httpStatus: 500,
      cause: organizationError,
    });
  }

  const org = organization as OrganizationProfileRecord;
  if (isOrganizationProfileIncomplete(org)) {
    redirect(`/app/onboarding?organizationId=${organizationId}`);
  }

  const { data: storesData } = await supabase
    .from("stores")
    .select("id")
    .eq("organization_id", organizationId)
    .limit(1);

  if ((storesData ?? []).length === 0) {
    redirect(`/app/onboarding/store?organizationId=${organizationId}`);
  }

  const { data: snapshots, error: snapshotError } = await supabase
    .from("inventory_snapshots")
    .select(
      "id,observed_at,available_quantity,on_hand_quantity,committed_quantity,incoming_quantity,source,store_id,location_id,variant_id",
    )
    .eq("organization_id", organizationId)
    .order("observed_at", { ascending: false })
    .limit(100);

  if (snapshotError) {
    throw new AppError({
      code: "DATA_LOAD_FAILED",
      kind: "operational",
      message: "Unable to load inventory snapshots.",
      publicMessage: "Unable to load inventory right now.",
      httpStatus: 500,
      cause: snapshotError,
    });
  }

  const rows = (snapshots ?? []) as InventoryRow[];
  const variantIds = [...new Set(rows.map((row) => row.variant_id))];
  const storeIds = [...new Set(rows.map((row) => row.store_id))];
  const locationIds = [...new Set(rows.map((row) => row.location_id))];

  const [{ data: variants }, { data: stores }, { data: locations }] =
    await Promise.all([
      variantIds.length
        ? supabase
            .from("product_variants")
            .select("id,sku,title")
            .eq("organization_id", organizationId)
            .in("id", variantIds)
        : Promise.resolve({ data: [] as VariantRow[] }),
      storeIds.length
        ? supabase
            .from("stores")
            .select("id,name")
            .eq("organization_id", organizationId)
            .in("id", storeIds)
        : Promise.resolve({ data: [] as StoreRow[] }),
      locationIds.length
        ? supabase
            .from("locations")
            .select("id,name")
            .eq("organization_id", organizationId)
            .in("id", locationIds)
        : Promise.resolve({ data: [] as LocationRow[] }),
    ]);

  const variantById = new Map(
    ((variants ?? []) as VariantRow[]).map((variant) => [variant.id, variant]),
  );
  const storeById = new Map(
    ((stores ?? []) as StoreRow[]).map((store) => [store.id, store]),
  );
  const locationById = new Map(
    ((locations ?? []) as LocationRow[]).map((location) => [
      location.id,
      location,
    ]),
  );

  // Latest observation per variant+location for a readable current view.
  const latestByGrain = new Map<string, InventoryRow>();
  for (const row of rows) {
    const key = `${row.variant_id}:${row.location_id}`;
    if (!latestByGrain.has(key)) {
      latestByGrain.set(key, row);
    }
  }
  const latestRows = [...latestByGrain.values()];
  const readiness = await loadMerchantDecisionReadiness(organizationId);

  return (
    <div>
      <div className="flex flex-col gap-5 border-b border-zinc-200 pb-8 sm:pb-10">
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 shadow-sm">
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          Canonical inventory
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm font-medium text-zinc-500">Inventory</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
              Imported inventory positions
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-600">
              Showing the latest CSV observation per SKU and location. Empty
              means not imported yet — StoreAgent does not invent stock,
              demand, or recommendations.
            </p>
          </div>

          <Link
            href={`/app/${organizationId}/inventory/import`}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-zinc-950 px-4 text-sm font-semibold text-white"
          >
            <FileSpreadsheet className="size-4" aria-hidden="true" />
            Import CSV
          </Link>
        </div>
      </div>

      <section className="border-b border-zinc-200 py-8 sm:py-10">
        <DecisionReadinessPanel
          readiness={readiness}
          organizationId={organizationId}
        />
      </section>

      <section className="py-8 sm:py-10">
        {latestRows.length === 0 ? (
          <div className="rounded-3xl border border-zinc-200 bg-white p-7 shadow-sm sm:p-9">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-zinc-950 text-white">
              <Boxes className="size-5" aria-hidden="true" />
            </div>
            <h2 className="mt-8 text-2xl font-semibold tracking-[-0.03em]">
              No inventory observations yet
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-zinc-600">
              Import a CSV to create the first durable inventory snapshots for
              this organization.
            </p>
            <Link
              href={`/app/${organizationId}/inventory/import`}
              className="mt-8 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-zinc-900"
            >
              Go to inventory import
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-3xl border border-zinc-200 bg-white shadow-sm">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-[0.12em] text-zinc-500">
                <tr>
                  <th className="px-5 py-4">SKU</th>
                  <th className="px-5 py-4">Product</th>
                  <th className="px-5 py-4">Store</th>
                  <th className="px-5 py-4">Location</th>
                  <th className="px-5 py-4">Available</th>
                  <th className="px-5 py-4">On hand</th>
                  <th className="px-5 py-4">Observed</th>
                </tr>
              </thead>
              <tbody>
                {latestRows.map((row) => {
                  const variant = variantById.get(row.variant_id);
                  const store = storeById.get(row.store_id);
                  const location = locationById.get(row.location_id);
                  return (
                    <tr key={row.id} className="border-t border-zinc-100">
                      <td className="px-5 py-4 font-medium">
                        {variant?.sku ?? "—"}
                      </td>
                      <td className="px-5 py-4">
                        {variant?.title ?? "—"}
                      </td>
                      <td className="px-5 py-4">{store?.name ?? "—"}</td>
                      <td className="px-5 py-4">
                        {location?.name ?? "—"}
                      </td>
                      <td className="px-5 py-4">
                        {row.available_quantity ?? "—"}
                      </td>
                      <td className="px-5 py-4">
                        {row.on_hand_quantity ?? "—"}
                      </td>
                      <td className="px-5 py-4 font-mono text-xs text-zinc-500">
                        {new Date(row.observed_at).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
