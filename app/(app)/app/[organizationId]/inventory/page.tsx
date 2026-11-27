import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Boxes } from "lucide-react";

import { IncomingEvidenceEditor } from "@/components/inventory/incoming-evidence-editor";
import { InventoryIntelligenceWorkspace } from "@/components/inventory/inventory-intelligence-workspace";
import { PlanningInputsEditor } from "@/components/inventory/planning-inputs-editor";
import { DecisionReadinessPanel } from "@/components/inventory-readiness/decision-readiness-panel";
import { requireAppIdentity } from "@/lib/auth/app-route";
import { mayRunCommerceAgent } from "@/lib/commerce-agent/orchestrator/enablement";
import {
  mayShowMarketResearchPanel,
  resolveMarketResearchEnablement,
} from "@/lib/market-research";
import { loadStoreIncomingEvidenceAttestations } from "@/lib/incoming-evidence/load";
import {
  INVENTORY_EVIDENCE_ANCHOR,
  loadMerchantInventoryIntelligence,
  parseInventoryAttentionFilter,
} from "@/lib/inventory-intelligence";
import {
  inventoryEvidenceSourceDetail,
  inventoryEvidenceSourceLabel,
  loadMerchantDecisionReadiness,
  resolveMerchantActivationScope,
  type ActivationPlace,
} from "@/lib/inventory-readiness";
import { AppError } from "@/lib/observability/app-error";
import {
  isOrganizationProfileIncomplete,
  type OrganizationProfileRecord,
} from "@/lib/organizations/profile";
import { loadMerchantPlanningInputs } from "@/lib/planning-inputs";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { roleHasPermission } from "@/lib/tenancy/permissions";
import { resolveServerOrganizationContext } from "@/lib/tenancy/server-organization-context";

export const metadata: Metadata = {
  title: "Inventory",
};

const INVENTORY_SOURCE_KIND = "csv" as const;

export default async function InventoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationId: string }>;
  searchParams: Promise<{ filter?: string }>;
}) {
  const identity = await requireAppIdentity();
  const { organizationId } = await params;
  const query = await searchParams;
  const initialFilter = parseInventoryAttentionFilter(query.filter) ?? "all";

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
    .select("id,name")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  if ((storesData ?? []).length === 0) {
    redirect(`/app/onboarding/store?organizationId=${organizationId}`);
  }

  const canEditPlanning = roleHasPermission(
    resolution.context.role,
    "organization.manage",
  );

  const [readiness, intelligence, planning, incomingAttestations] =
    await Promise.all([
      loadMerchantDecisionReadiness(organizationId),
      loadMerchantInventoryIntelligence(organizationId),
      loadMerchantPlanningInputs(organizationId),
      loadStoreIncomingEvidenceAttestations(organizationId),
    ]);

  const inventoryPlaces: ActivationPlace[] = [];
  const seenInventory = new Set<string>();
  for (const row of intelligence.rows) {
    const key = `${row.storeId}:${row.locationId}`;
    if (seenInventory.has(key)) {
      continue;
    }
    seenInventory.add(key);
    inventoryPlaces.push({
      storeId: row.storeId,
      locationId: row.locationId,
      storeName: row.storeName,
      locationName: row.locationName,
    });
  }

  let organizationPlaces: ActivationPlace[] | undefined;
  if (inventoryPlaces.length === 0) {
    const storeIds = (storesData ?? []).map((store) => String(store.id));
    const { data: locationRows } = await supabase
      .from("locations")
      .select("id,store_id,name")
      .eq("organization_id", organizationId)
      .in("store_id", storeIds)
      .order("created_at", { ascending: true });

    const storeNameById = new Map(
      (storesData ?? []).map((store) => [String(store.id), String(store.name)]),
    );
    organizationPlaces = (locationRows ?? []).map((location) => ({
      storeId: String(location.store_id),
      locationId: String(location.id),
      storeName: storeNameById.get(String(location.store_id)),
      locationName: String(location.name ?? ""),
    }));
  }

  const activationResolution = resolveMerchantActivationScope({
    inventoryPlaces,
    organizationPlaces,
  });

  const activationScope =
    activationResolution.status === "resolved"
      ? activationResolution.scope
      : null;
  const activationScopeBlockMessage =
    activationResolution.status === "ambiguous" ||
    activationResolution.status === "missing"
      ? activationResolution.message
      : null;

  const lastObservationLabel = formatLastObservation(
    intelligence.rows.map((row) => row.observedAt),
  );

  const stockObservationsStale =
    !readiness.presence.hasCurrentDayInventoryObservation ||
    readiness.presence.inventoryPlaceFreshnessKind === "all_stale" ||
    readiness.presence.inventoryPlaceFreshnessKind === "mixed";

  const asOfLabel = readiness.presence.primaryAsOfMetricDate;

  // Trusted server-resolved soft-enable (default OFF / empty allowlist).
  // Distinct from AI-INV / Actions flags. Client never overrides.
  const commerceAgentVisible = mayRunCommerceAgent({
    organizationId,
  }).mayRun;

  // Market research panel visibility (default OFF). Soft-show ≠ orchestration unlock.
  // Production action never injects synthetic fixtures regardless of this flag.
  const marketResearchEnablement =
    resolveMarketResearchEnablement(organizationId);
  const marketResearchVisible = mayShowMarketResearchPanel({
    organizationId,
    researchEnabled: marketResearchEnablement.researchEnabled,
    allowlistMatch: marketResearchEnablement.allowlistMatch,
  });

  // Stable DOM order: SKU evidence always above readiness. Never swap sections
  // when filter=all ↔ filtered — that remount jump landed merchants on Decision
  // Readiness after clicking All. Overview deep links still use #inventory-evidence.
  const attentionDeepLink = initialFilter !== "all";

  return (
    <div>
      <div className="flex flex-col gap-3 border-b border-zinc-200 pb-6 sm:pb-8">
        <p className="text-sm font-medium text-zinc-500">Inventory</p>
        <h1 className="text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
          Inventory
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-zinc-600 sm:text-base sm:leading-7">
          Review products that need attention. Stock condition stays separate
          from cover availability — StoreAgent does not invent demand or unlock
          commercial recommendations here.
        </p>
      </div>

      <section
        id={INVENTORY_EVIDENCE_ANCHOR}
        className="scroll-mt-24 border-b border-zinc-200 py-6 sm:py-8"
        data-inventory-evidence="true"
        data-attention-deep-link={attentionDeepLink ? "true" : "false"}
      >
        {intelligence.rows.length === 0 ? (
          <div className="rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-zinc-950 text-white">
              <Boxes className="size-5" aria-hidden="true" />
            </div>
            <h2 className="mt-6 text-xl font-semibold tracking-[-0.03em]">
              No inventory observations yet
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-600">
              Import a CSV to create the first durable inventory snapshots for
              this organization. Demand and cover appear after sales metrics are
              activated for matching SKUs.
            </p>
            <Link
              href={`/app/${organizationId}/inventory/import`}
              className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-zinc-950 px-4 text-sm font-semibold text-white"
            >
              Import inventory
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        ) : (
          <InventoryIntelligenceWorkspace
            rows={intelligence.rows}
            initialFilter={initialFilter}
            stockObservationsStale={stockObservationsStale}
            sourceLabel={inventoryEvidenceSourceLabel(INVENTORY_SOURCE_KIND)}
            asOfLabel={asOfLabel}
            commerceAgentVisible={commerceAgentVisible}
            marketResearchVisible={marketResearchVisible}
            planning={{
              leadTimeDays: planning.leadTimeDays,
              safetyStockDays: planning.safetyStockDays,
              reviewPeriodDays: planning.reviewPeriodDays,
            }}
          />
        )}
      </section>

      <section className="border-b border-zinc-200 py-6 sm:py-8">
        <DecisionReadinessPanel
          readiness={readiness}
          organizationId={organizationId}
          activationScope={activationScope}
          activationScopeBlockMessage={activationScopeBlockMessage}
          inventorySourceKind={INVENTORY_SOURCE_KIND}
          inventorySourceLabel={inventoryEvidenceSourceLabel(
            INVENTORY_SOURCE_KIND,
          )}
          inventorySourceDetail={inventoryEvidenceSourceDetail(
            INVENTORY_SOURCE_KIND,
          )}
          lastObservationLabel={lastObservationLabel}
        />
      </section>

      <section className="border-b border-zinc-200 py-6 sm:py-8">
        <PlanningInputsEditor
          organizationId={organizationId}
          canEdit={canEditPlanning}
          initial={{
            leadTimeDays: planning.leadTimeDays,
            safetyStockDays: planning.safetyStockDays,
            reviewPeriodDays: planning.reviewPeriodDays,
          }}
        />
      </section>

      <section className="py-6 sm:py-8">
        <IncomingEvidenceEditor
          organizationId={organizationId}
          canEdit={canEditPlanning}
          initial={incomingAttestations}
          trustedIncoming={readiness.presence.trustedIncoming}
        />
      </section>
    </div>
  );
}

function formatLastObservation(isoTimes: readonly string[]): string | null {
  if (isoTimes.length === 0) {
    return null;
  }
  let latestMs = Number.NEGATIVE_INFINITY;
  let latestIso: string | null = null;
  for (const iso of isoTimes) {
    const ms = Date.parse(iso);
    if (!Number.isNaN(ms) && ms > latestMs) {
      latestMs = ms;
      latestIso = iso;
    }
  }
  if (!latestIso) {
    return null;
  }
  try {
    return new Date(latestIso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return latestIso.slice(0, 10);
  }
}
