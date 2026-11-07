import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";

import { StoreSetupForm } from "@/components/auth/store-setup-form";
import { BrandMark } from "@/components/marketing/brand-mark";
import { requireAppIdentity } from "@/lib/auth/app-route";
import { AppError } from "@/lib/observability/app-error";
import {
  isOrganizationProfileIncomplete,
  type OrganizationProfileRecord,
} from "@/lib/organizations/profile";
import { ensureCurrentUserProvisioned } from "@/lib/provisioning/current-user";
import { isOrganizationUuid } from "@/lib/stores/bootstrap";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Create your first store",
};

type StoreRow = {
  id: string;
  organization_id: string;
};

type MembershipRow = {
  organization_id: string;
  role: string;
};

export default async function FirstStoreOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ organizationId?: string }>;
}) {
  const identity = await requireAppIdentity();

  const params = await searchParams;
  const requestedId = params.organizationId?.trim() ?? "";

  const supabase = await createSupabaseServerClient();

  try {
    await ensureCurrentUserProvisioned(supabase);
  } catch (cause) {
    throw new AppError({
      code: "PROVISIONING_FAILED",
      kind: "operational",
      message: "Unable to provision user during store onboarding.",
      publicMessage: "Unable to prepare your workspace right now.",
      httpStatus: 500,
      cause,
    });
  }

  const { data: orgData, error: orgError } = await supabase
    .from("organizations")
    .select("id,name,country_code,default_currency,timezone")
    .order("name", { ascending: true });

  if (orgError) {
    throw new AppError({
      code: "DATA_LOAD_FAILED",
      kind: "operational",
      message: "Unable to load organizations for store onboarding.",
      publicMessage: "Unable to load your organization right now.",
      httpStatus: 500,
      cause: orgError,
    });
  }

  const organizations = (orgData ?? []) as OrganizationProfileRecord[];
  const completeOrganizations = organizations.filter(
    (organization) => !isOrganizationProfileIncomplete(organization),
  );

  if (completeOrganizations.length === 0) {
    redirect("/app/onboarding");
  }

  let organization: OrganizationProfileRecord | undefined;

  if (requestedId) {
    if (!isOrganizationUuid(requestedId)) {
      redirect("/app");
    }
    organization = completeOrganizations.find(
      (entry) => entry.id === requestedId,
    );
    if (!organization) {
      redirect("/app");
    }
  } else if (completeOrganizations.length === 1) {
    organization = completeOrganizations[0];
  } else {
    redirect("/app");
  }

  if (!organization) {
    redirect("/app");
  }

  const { data: membershipData, error: membershipError } = await supabase
    .from("organization_members")
    .select("organization_id,role")
    .eq("organization_id", organization.id)
    .eq("user_id", identity.userId)
    .maybeSingle();

  if (membershipError) {
    throw new AppError({
      code: "DATA_LOAD_FAILED",
      kind: "operational",
      message: "Unable to load membership for store onboarding.",
      publicMessage: "Unable to load your organization right now.",
      httpStatus: 500,
      cause: membershipError,
    });
  }

  const membership = membershipData as MembershipRow | null;
  if (!membership) {
    redirect("/app?tenant_error=organization_access_denied");
  }

  if (membership.role !== "owner" && membership.role !== "admin") {
    redirect(`/app/${organization.id}`);
  }

  const { data: storeData, error: storeError } = await supabase
    .from("stores")
    .select("id,organization_id")
    .eq("organization_id", organization.id)
    .limit(1);

  if (storeError) {
    throw new AppError({
      code: "DATA_LOAD_FAILED",
      kind: "operational",
      message: "Unable to load stores for onboarding.",
      publicMessage: "Unable to load your store setup right now.",
      httpStatus: 500,
      cause: storeError,
    });
  }

  const stores = (storeData ?? []) as StoreRow[];
  if (stores.length > 0) {
    redirect(`/app/${organization.id}`);
  }

  return (
    <main className="marketing-surface min-h-screen bg-[var(--sa-porcelain)] px-4 py-8 text-[var(--sa-ink)] sm:px-6 sm:py-12">
      <div className="mx-auto w-full max-w-xl">
        <header className="mb-10 flex items-center justify-between gap-4">
          <BrandMark href="/app" />
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[var(--sa-frame)] bg-[var(--sa-porcelain)] px-3.5 text-sm font-medium text-[var(--sa-ink-muted)] transition hover:text-[var(--sa-ink)]"
            >
              <LogOut className="size-4" aria-hidden="true" />
              Sign out
            </button>
          </form>
        </header>

        <ol className="mb-8 flex flex-wrap gap-2 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-[var(--sa-ink-muted)]">
          <li className="rounded-full border border-[var(--sa-frame)] bg-[var(--sa-ink-soft)] px-3 py-1 text-[var(--sa-ink)]">
            Organization
          </li>
          <li className="rounded-full border border-[var(--sa-insight)] bg-[color-mix(in_srgb,var(--sa-insight)_12%,transparent)] px-3 py-1 text-[var(--sa-insight)]">
            First store
          </li>
          <li className="rounded-full border border-[var(--sa-frame)] px-3 py-1">
            Inventory
          </li>
          <li className="rounded-full border border-[var(--sa-frame)] px-3 py-1">
            Decisions
          </li>
        </ol>

        <p className="text-[0.7rem] font-bold uppercase tracking-[0.16em] text-[var(--sa-insight)]">
          First-time setup
        </p>
        <h1 className="mt-3 font-display text-[clamp(1.75rem,3vw,2.35rem)] font-semibold tracking-[-0.03em]">
          Create your first store.
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--sa-ink-muted)]">
          StoreAgent needs one real store before inventory import or decisions.
          Currency and timezone start from {organization.name}; no sample stock
          is created.
        </p>

        <div className="mt-8 rounded-[1.5rem] border border-[var(--sa-frame)] bg-[var(--sa-porcelain)] p-6 shadow-[0_24px_48px_-28px_color-mix(in_srgb,var(--sa-ink)_35%,transparent)] sm:p-8">
          <StoreSetupForm
            organizationId={organization.id}
            organizationName={organization.name}
            inheritedCurrency={organization.default_currency}
            inheritedTimezone={organization.timezone}
          />
        </div>
      </div>
    </main>
  );
}
