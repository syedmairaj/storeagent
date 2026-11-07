import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";

import { OrganizationSetupForm } from "@/components/auth/organization-setup-form";
import { BrandMark } from "@/components/marketing/brand-mark";
import { requireAppIdentity } from "@/lib/auth/app-route";
import { AppError } from "@/lib/observability/app-error";
import {
  isOrganizationProfileIncomplete,
  type OrganizationProfileRecord,
} from "@/lib/organizations/profile";
import { ensureCurrentUserProvisioned } from "@/lib/provisioning/current-user";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Set up organization",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function OrganizationOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ organizationId?: string }>;
}) {
  await requireAppIdentity();

  const params = await searchParams;
  const requestedId = params.organizationId?.trim() ?? "";

  const supabase = await createSupabaseServerClient();
  await ensureCurrentUserProvisioned(supabase);

  const { data, error } = await supabase
    .from("organizations")
    .select("id,name,country_code,default_currency,timezone")
    .order("name", { ascending: true });

  if (error) {
    throw new AppError({
      code: "DATA_LOAD_FAILED",
      kind: "operational",
      message: "Unable to load organizations for onboarding.",
      publicMessage: "Unable to load your organization right now.",
      httpStatus: 500,
      cause: error,
    });
  }

  const organizations = (data ?? []) as OrganizationProfileRecord[];
  const incomplete = organizations.filter(isOrganizationProfileIncomplete);

  if (incomplete.length === 0) {
    redirect("/app");
  }

  let organization: OrganizationProfileRecord | undefined;

  if (requestedId) {
    if (!UUID_RE.test(requestedId)) {
      redirect("/app");
    }
    organization = incomplete.find((entry) => entry.id === requestedId);
    if (!organization) {
      // Do not set up an arbitrary org when the requested id is invalid/complete.
      redirect("/app");
    }
  } else if (incomplete.length === 1) {
    organization = incomplete[0];
  } else {
    // Ambiguous multi-org membership: require explicit selection on /app.
    redirect("/app");
  }

  if (!organization) {
    redirect("/app");
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
          <li className="rounded-full border border-[var(--sa-insight)] bg-[color-mix(in_srgb,var(--sa-insight)_12%,transparent)] px-3 py-1 text-[var(--sa-insight)]">
            Organization
          </li>
          <li className="rounded-full border border-[var(--sa-frame)] px-3 py-1">
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
          Set your organization context.
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--sa-ink-muted)]">
          Name, country, currency, and timezone are required before StoreAgent
          runs business calculations for this organization. Bootstrap
          placeholders are never treated as merchant truth.
        </p>

        <div className="mt-8 rounded-[1.5rem] border border-[var(--sa-frame)] bg-[var(--sa-porcelain)] p-6 shadow-[0_24px_48px_-28px_color-mix(in_srgb,var(--sa-ink)_35%,transparent)] sm:p-8">
          <OrganizationSetupForm
            organizationId={organization.id}
            initialName={organization.name}
          />
        </div>
      </div>
    </main>
  );
}
