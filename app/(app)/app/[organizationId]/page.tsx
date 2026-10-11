import {
  ArrowRight,
  Database,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

export default async function OrganizationHome({
  params,
}: PageProps<"/app/[organizationId]">) {
  const {
    organizationId,
  } =
    await params;

  return (
    <div>
      <div className="flex flex-col gap-5 border-b border-zinc-200 pb-8 sm:pb-10">
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 shadow-sm">
          <ShieldCheck
            className="size-3.5"
            aria-hidden="true"
          />

          Authorized organization context
        </div>

        <div className="max-w-3xl">
          <p className="text-sm font-medium text-zinc-500">
            Overview
          </p>

          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
            Your StoreAgent workspace is ready.
          </h1>

          <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-600">
            The secure foundation is connected. Business data and inventory intelligence will appear here only after the later ingestion and decision milestones are implemented.
          </p>
        </div>
      </div>

      <section className="py-8 sm:py-10">
        <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
          <div className="rounded-3xl border border-zinc-200 bg-white p-7 shadow-sm sm:p-9">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-zinc-950 text-white">
              <Database
                className="size-5"
                aria-hidden="true"
              />
            </div>

            <p className="mt-8 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Current state
            </p>

            <h2 className="mt-3 max-w-xl text-2xl font-semibold tracking-[-0.03em]">
              No inventory data has been connected yet.
            </h2>

            <p className="mt-4 max-w-xl text-sm leading-6 text-zinc-600">
              This is an intentional foundation state, not missing sample data. StoreAgent will not invent inventory, forecasts or recommendations before canonical data exists.
            </p>

            <div className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-zinc-400">
              Data onboarding arrives in a later milestone

              <ArrowRight
                className="size-4"
                aria-hidden="true"
              />
            </div>
          </div>

          <aside className="rounded-3xl border border-zinc-200 bg-zinc-950 p-7 text-white shadow-sm sm:p-8">
            <Sparkles
              className="size-5 text-zinc-300"
              aria-hidden="true"
            />

            <p className="mt-8 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">
              Foundation
            </p>

            <h2 className="mt-3 text-xl font-semibold tracking-[-0.025em]">
              Tenant boundary active
            </h2>

            <p className="mt-3 text-sm leading-6 text-zinc-400">
              Authentication, explicit organization selection and database tenant isolation are now separated into independent security layers.
            </p>

            <p className="mt-8 break-all font-mono text-[10px] leading-5 text-zinc-500">
              {organizationId}
            </p>
          </aside>
        </div>
      </section>
    </div>
  );
}
