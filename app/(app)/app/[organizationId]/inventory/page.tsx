import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Boxes,
  FileSpreadsheet,
  ShieldCheck,
} from "lucide-react";

import { InventoryIntelligenceWorkspace } from "@/components/inventory/inventory-intelligence-workspace";
import { DecisionReadinessPanel } from "@/components/inventory-readiness/decision-readiness-panel";
import { requireAppIdentity } from "@/lib/auth/app-route";
import { loadMerchantInventoryIntelligence } from "@/lib/inventory-intelligence";
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

  const [readiness, intelligence] = await Promise.all([
    loadMerchantDecisionReadiness(organizationId),
    loadMerchantInventoryIntelligence(organizationId),
  ]);

  const primaryRow = intelligence.rows[0] ?? null;
  let activationScope: { storeId: string; locationId: string } | null =
    primaryRow
      ? {
          storeId: primaryRow.storeId,
          locationId: primaryRow.locationId,
        }
      : null;

  if (!activationScope) {
    const bootstrapStoreId = String((storesData ?? [])[0]?.id ?? "");
    if (bootstrapStoreId) {
      const { data: bootstrapLocation } = await supabase
        .from("locations")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("store_id", bootstrapStoreId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (bootstrapLocation?.id) {
        activationScope = {
          storeId: bootstrapStoreId,
          locationId: String(bootstrapLocation.id),
        };
      }
    }
  }

  return (
    <div>
      <div className="flex flex-col gap-5 border-b border-zinc-200 pb-8 sm:pb-10">
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 shadow-sm">
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          Inventory intelligence
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-3xl">
            <p className="text-sm font-medium text-zinc-500">Inventory</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
              Stock, demand, and cover
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-600">
              Latest imported stock positions with current sales velocity and
              days of cover when evidence is complete. StoreAgent does not invent
              demand or commercial recommendations.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href={`/app/${organizationId}/inventory/import`}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-zinc-950 px-4 text-sm font-semibold text-white"
            >
              <FileSpreadsheet className="size-4" aria-hidden="true" />
              Import inventory
            </Link>
            <Link
              href={`/app/${organizationId}/inventory/sales-import`}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-zinc-200 px-4 text-sm font-medium text-zinc-700"
            >
              Import sales history
            </Link>
          </div>
        </div>
      </div>

      <section className="border-b border-zinc-200 py-8 sm:py-10">
        <DecisionReadinessPanel
          readiness={readiness}
          organizationId={organizationId}
          activationScope={activationScope}
        />
      </section>

      <section className="py-8 sm:py-10">
        {intelligence.rows.length === 0 ? (
          <div className="rounded-3xl border border-zinc-200 bg-white p-7 shadow-sm sm:p-9">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-zinc-950 text-white">
              <Boxes className="size-5" aria-hidden="true" />
            </div>
            <h2 className="mt-8 text-2xl font-semibold tracking-[-0.03em]">
              No inventory observations yet
            </h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-zinc-600">
              Import a CSV to create the first durable inventory snapshots for
              this organization. Demand and cover appear after sales metrics are
              activated for matching SKUs.
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
          <InventoryIntelligenceWorkspace
            rows={intelligence.rows}
            hasPendingMetricWork={intelligence.hasPendingMetricWork}
          />
        )}
      </section>
    </div>
  );
}
