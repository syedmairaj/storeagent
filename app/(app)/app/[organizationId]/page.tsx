import { redirect } from "next/navigation";

import { MerchantOverviewDashboard } from "@/components/overview/merchant-overview-dashboard";
import { requireAppIdentity } from "@/lib/auth/app-route";
import {
  loadMerchantInventoryIntelligence,
  summarizeMerchantAttention,
} from "@/lib/inventory-intelligence";
import { loadMerchantDecisionReadiness } from "@/lib/inventory-readiness";
import { buildMerchantOverviewPresentation } from "@/lib/inventory-readiness/overview-presentation";
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

  let readiness = null;
  let attention = null;
  let lastObservationLabel: string | null = null;

  if (hasStore) {
    try {
      const [decisionReadiness, intelligence] = await Promise.all([
        loadMerchantDecisionReadiness(organizationId),
        loadMerchantInventoryIntelligence(organizationId),
      ]);
      readiness = decisionReadiness;
      attention = summarizeMerchantAttention(intelligence.rows);
      lastObservationLabel = formatLastObservationLabel(
        intelligence.rows.map((row) => row.observedAt),
      );
    } catch (cause) {
      throw new AppError({
        code: "DATA_LOAD_FAILED",
        kind: "operational",
        message: "Unable to load merchant overview evidence.",
        publicMessage:
          "Unable to load inventory attention for this workspace right now.",
        httpStatus: 500,
        cause,
      });
    }
  }

  const presentation = buildMerchantOverviewPresentation({
    organizationId,
    storeName: primaryStore?.name ?? null,
    readiness,
    attention,
    inventorySourceKind: "csv",
    lastObservationLabel,
  });

  return (
    <MerchantOverviewDashboard
      organizationId={organizationId}
      presentation={presentation}
      hasStore={hasStore}
      canManageSetup={canCreateStore}
    />
  );
}

function formatLastObservationLabel(
  isoTimes: readonly string[],
): string | null {
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
