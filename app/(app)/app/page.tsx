import type {
  Metadata,
} from "next";

import Link from "next/link";

import {
  ArrowRight,
  Building2,
  LogOut,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import {
  requireAppIdentity,
} from "@/lib/auth/app-route";

import {
  createSupabaseServerClient,
} from "@/lib/supabase/server";

export const metadata:
Metadata = {
  title:
    "Choose organization",
};

interface OrganizationSummary {
  id: string;
  name: string;
  country_code:
    string | null;
  default_currency:
    string;
  timezone:
    string;
}

export default async function OrganizationSelectionPage() {
  const identity =
    await requireAppIdentity();

  const supabase =
    await createSupabaseServerClient();

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "organizations",
      )
      .select(
        "id,name,country_code,default_currency,timezone",
      )
      .order(
        "name",
        {
          ascending: true,
        },
      );

  if (
    error
  ) {
    throw new Error(
      "Unable to load organizations.",
    );
  }

  const organizations =
    (data ??
      []) as OrganizationSummary[];

  return (
    <main className="min-h-screen bg-[#f7f8f7] px-4 py-8 text-zinc-950 sm:px-6 sm:py-12 lg:px-10 lg:py-16">
      <div className="mx-auto w-full max-w-5xl">
        <header className="flex items-center justify-between gap-4">
          <div className="inline-flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-zinc-950 text-white shadow-sm">
              <Sparkles
                className="size-4"
                aria-hidden="true"
              />
            </span>

            <div>
              <div className="font-semibold tracking-[-0.02em]">
                StoreAgent
              </div>

              <div className="text-xs font-medium text-zinc-500">
                Inventory operating system
              </div>
            </div>
          </div>

          <form
            action="/auth/signout"
            method="post"
          >
            <button
              type="submit"
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3.5 text-sm font-medium text-zinc-600 shadow-sm transition hover:border-zinc-300 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
            >
              <LogOut
                className="size-4"
                aria-hidden="true"
              />

              <span className="hidden sm:inline">
                Sign out
              </span>
            </button>
          </form>
        </header>

        <section className="pb-8 pt-16 sm:pb-10 sm:pt-24">
          <div className="max-w-2xl">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 shadow-sm">
              <ShieldCheck
                className="size-3.5"
                aria-hidden="true"
              />

              Authenticated workspace
            </div>

            <h1 className="text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
              Choose where you want to work.
            </h1>

            <p className="mt-5 max-w-xl text-base leading-7 text-zinc-600 sm:text-lg sm:leading-8">
              Organization selection is explicit so StoreAgent never guesses which business context you intended.
            </p>

            {identity.email && (
              <p className="mt-4 text-sm text-zinc-500">
                Signed in as{" "}
                <span className="font-medium text-zinc-700">
                  {identity.email}
                </span>
              </p>
            )}
          </div>
        </section>

        {organizations.length === 0 ? (
          <section className="rounded-3xl border border-zinc-200 bg-white p-7 shadow-sm sm:p-10">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700">
              <Building2
                className="size-5"
                aria-hidden="true"
              />
            </div>

            <h2 className="mt-6 text-xl font-semibold tracking-[-0.025em]">
              No organization access
            </h2>

            <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-600">
              Your authenticated account currently has no StoreAgent organization membership. No fallback organization has been selected.
            </p>
          </section>
        ) : (
          <section
            aria-label="Organizations"
            className="grid gap-4 md:grid-cols-2"
          >
            {organizations.map(
              (organization) => (
                <Link
                  key={
                    organization.id
                  }
                  href={`/app/${organization.id}`}
                  className="group rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-4 sm:p-7"
                >
                  <div className="flex items-start justify-between gap-6">
                    <span className="flex size-11 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700 transition group-hover:bg-zinc-950 group-hover:text-white">
                      <Building2
                        className="size-5"
                        aria-hidden="true"
                      />
                    </span>

                    <ArrowRight
                      className="mt-2 size-5 text-zinc-400 transition group-hover:translate-x-1 group-hover:text-zinc-950"
                      aria-hidden="true"
                    />
                  </div>

                  <h2 className="mt-8 text-xl font-semibold tracking-[-0.025em]">
                    {organization.name}
                  </h2>

                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-zinc-500">
                    <span>
                      {organization.country_code ??
                        "Country not set"}
                    </span>

                    <span>
                      {organization.default_currency ===
                      "XXX"
                        ? "Currency not set"
                        : organization.default_currency}
                    </span>

                    <span>
                      {organization.timezone}
                    </span>
                  </div>

                </Link>
              ),
            )}
          </section>
        )}
      </div>
    </main>
  );
}
