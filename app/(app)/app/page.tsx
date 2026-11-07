import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  Building2,
  LogOut,
  ShieldCheck,
} from "lucide-react";

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
  title: "Choose organization",
};

export default async function OrganizationSelectionPage() {
  const identity = await requireAppIdentity();
  const supabase = await createSupabaseServerClient();

  // Password sessions and restored cookies never hit /auth/callback.
  // Provisioning remains idempotent for existing members.
  await ensureCurrentUserProvisioned(supabase);

  const { data, error } = await supabase
    .from("organizations")
    .select("id,name,country_code,default_currency,timezone")
    .order("name", { ascending: true });

  if (error) {
    throw new AppError({
      code: "DATA_LOAD_FAILED",
      kind: "operational",
      message: "Unable to load organizations.",
      publicMessage: "Unable to load your organizations right now.",
      httpStatus: 500,
      cause: error,
    });
  }

  const organizations = (data ?? []) as OrganizationProfileRecord[];
  const incompleteOrganizations = organizations.filter(
    isOrganizationProfileIncomplete,
  );

  // Single incomplete org means first-time setup — not tenant auto-selection.
  if (
    organizations.length === 1 &&
    incompleteOrganizations.length === 1
  ) {
    redirect("/app/onboarding");
  }

  return (
    <main className="marketing-surface min-h-screen bg-[var(--sa-porcelain)] px-4 py-8 text-[var(--sa-ink)] sm:px-6 sm:py-12 lg:px-10 lg:py-16">
      <div className="mx-auto w-full max-w-5xl">
        <header className="flex items-center justify-between gap-4">
          <BrandMark href="/" />

          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[var(--sa-frame)] bg-[var(--sa-porcelain)] px-3.5 text-sm font-medium text-[var(--sa-ink-muted)] shadow-sm transition hover:text-[var(--sa-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sa-insight)]"
            >
              <LogOut className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </form>
        </header>

        <section className="pb-8 pt-16 sm:pb-10 sm:pt-24">
          <div className="max-w-2xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[var(--sa-frame)] bg-[var(--sa-porcelain)] px-3 py-1.5 text-xs font-medium text-[var(--sa-ink-muted)] shadow-sm">
              <ShieldCheck className="size-3.5" aria-hidden="true" />
              Authenticated workspace
            </div>

            <h1 className="font-display text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
              Choose where you want to work.
            </h1>

            <p className="mt-5 max-w-xl text-base leading-7 text-[var(--sa-ink-muted)] sm:text-lg sm:leading-8">
              Organization selection is explicit so StoreAgent never guesses
              which business context you intended.
            </p>

            {identity.email ? (
              <p className="mt-4 text-sm text-[var(--sa-ink-muted)]">
                Signed in as{" "}
                <span className="font-medium text-[var(--sa-ink)]">
                  {identity.email}
                </span>
              </p>
            ) : null}
          </div>
        </section>

        {organizations.length === 0 ? (
          <section className="rounded-3xl border border-[var(--sa-frame)] bg-[var(--sa-porcelain)] p-7 shadow-sm sm:p-10">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-[var(--sa-ink-soft)] text-[var(--sa-ink)]">
              <Building2 className="size-5" aria-hidden="true" />
            </div>

            <h2 className="mt-6 text-xl font-semibold tracking-[-0.025em]">
              No organization access
            </h2>

            <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--sa-ink-muted)]">
              Your authenticated account currently has no StoreAgent organization
              membership. No fallback organization has been selected.
            </p>
          </section>
        ) : (
          <section
            aria-label="Organizations"
            className="grid gap-4 md:grid-cols-2"
          >
            {organizations.map((organization) => {
              const incomplete =
                isOrganizationProfileIncomplete(organization);
              const href = incomplete
                ? `/app/onboarding?organizationId=${organization.id}`
                : `/app/${organization.id}`;

              return (
                <Link
                  key={organization.id}
                  href={href}
                  className="group rounded-3xl border border-[var(--sa-frame)] bg-[var(--sa-porcelain)] p-6 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--sa-ink)_28%,var(--sa-frame))] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sa-insight)] focus-visible:ring-offset-4 sm:p-7"
                >
                  <div className="flex items-start justify-between gap-6">
                    <span className="flex size-11 items-center justify-center rounded-2xl bg-[var(--sa-ink-soft)] text-[var(--sa-ink)] transition group-hover:bg-[var(--sa-ink)] group-hover:text-[var(--sa-porcelain)]">
                      <Building2 className="size-5" aria-hidden="true" />
                    </span>
                    <ArrowRight
                      className="mt-2 size-5 text-[var(--sa-ink-muted)] transition group-hover:translate-x-1 group-hover:text-[var(--sa-ink)]"
                      aria-hidden="true"
                    />
                  </div>

                  <h2 className="mt-8 text-xl font-semibold tracking-[-0.025em]">
                    {organization.name}
                  </h2>

                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-[var(--sa-ink-muted)]">
                    <span>
                      {organization.country_code ?? "Country not set"}
                    </span>
                    <span>
                      {organization.default_currency === "XXX"
                        ? "Currency not set"
                        : organization.default_currency}
                    </span>
                    <span>{organization.timezone}</span>
                  </div>

                  {incomplete ? (
                    <p className="mt-4 text-xs font-semibold text-[var(--sa-insight)]">
                      Finish setup before opening the workspace
                    </p>
                  ) : null}
                </Link>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}
