import Link from "next/link";
import {
  ArrowRight,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  ShieldAlert,
} from "lucide-react";

import type {
  EvidenceSufficiency,
  MerchantDecisionReadiness,
} from "@/lib/inventory-readiness/types";
import { cn } from "@/lib/utils";

export function DecisionReadinessPanel({
  readiness,
  organizationId,
  variant = "full",
  showActionsDemoLink = true,
}: {
  readiness: MerchantDecisionReadiness;
  organizationId: string;
  variant?: "full" | "compact";
  showActionsDemoLink?: boolean;
}) {
  const compact = variant === "compact";

  return (
    <section
      aria-labelledby="decision-readiness-heading"
      data-decision-readiness="true"
      data-commercial-eligible={
        readiness.commercialActionsEligible ? "true" : "false"
      }
      className={cn(
        "rounded-3xl border border-zinc-200 bg-white shadow-sm",
        compact ? "p-5 sm:p-6" : "p-6 sm:p-8",
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 max-w-2xl">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Live evidence
          </p>
          <h2
            id="decision-readiness-heading"
            className="mt-2 text-xl font-semibold tracking-[-0.03em] text-zinc-950 sm:text-2xl"
          >
            Decision readiness
          </h2>
          <p className="mt-2 text-sm leading-6 text-zinc-600">
            {readiness.summary}
          </p>
        </div>

        <div
          className={cn(
            "inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold",
            readiness.commercialActionsEligible
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : "border-amber-200 bg-amber-50 text-amber-950",
          )}
        >
          {readiness.commercialActionsEligible ? (
            <CircleCheck className="size-3.5" aria-hidden="true" />
          ) : (
            <ShieldAlert className="size-3.5" aria-hidden="true" />
          )}
          {readiness.commercialActionsEligible
            ? "Commercial actions eligible"
            : "No fabricated recommendations"}
        </div>
      </div>

      <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="SKU positions"
          value={String(readiness.presence.knownAvailableSkuCount)}
        />
        <Stat
          label="Stores"
          value={String(readiness.presence.distinctStoreCount)}
        />
        <Stat
          label="Locations"
          value={String(readiness.presence.distinctLocationCount)}
        />
        <Stat
          label="Snapshots loaded"
          value={String(readiness.presence.inventorySnapshotCount)}
        />
      </dl>

      {!compact ? (
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">
              Capabilities
            </h3>
            <ul className="mt-3 space-y-3">
              {readiness.capabilities.map((capability) => (
                <li
                  key={capability.key}
                  className="flex items-start gap-3 text-sm"
                >
                  {capability.ready ? (
                    <CircleCheck
                      className="mt-0.5 size-4 shrink-0 text-emerald-700"
                      aria-hidden="true"
                    />
                  ) : (
                    <CircleDashed
                      className="mt-0.5 size-4 shrink-0 text-zinc-400"
                      aria-hidden="true"
                    />
                  )}
                  <span>
                    <span className="font-medium text-zinc-950">
                      {capability.label}
                    </span>
                    <span className="mt-1 block text-zinc-600">
                      {capability.detail}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-zinc-900">
              Evidence checklist
            </h3>
            <ul className="mt-3 space-y-3">
              {readiness.inputs.map((item) => (
                <li
                  key={item.key}
                  className="flex items-start gap-3 text-sm"
                  data-evidence-present={item.present ? "true" : "false"}
                  data-evidence-status={item.status}
                >
                  <EvidenceStatusIcon status={item.status} />
                  <span>
                    <span className="font-medium text-zinc-950">
                      {item.label}
                      <span className="ml-2 text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                        {item.status}
                      </span>
                    </span>
                    <span className="mt-1 block text-zinc-600">
                      {item.detail}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {readiness.nextSteps.length > 0 ? (
        <div className="mt-8 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-4 sm:px-5">
          <h3 className="text-sm font-semibold text-zinc-900">Next steps</h3>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-zinc-700">
            {readiness.nextSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      ) : null}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Link
          href={`/app/${organizationId}/inventory`}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-zinc-950 px-4 text-sm font-semibold text-white"
        >
          View inventory
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
        <Link
          href={`/app/${organizationId}/inventory/import`}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-zinc-200 px-4 text-sm font-medium text-zinc-700"
        >
          Import inventory
        </Link>
        <Link
          href={`/app/${organizationId}/inventory/sales-import`}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-zinc-200 px-4 text-sm font-medium text-zinc-700"
        >
          Import sales history
        </Link>
        {showActionsDemoLink ? (
          <Link
            href={`/app/${organizationId}/actions`}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-zinc-200 px-4 text-sm font-medium text-zinc-700"
          >
            Open synthetic Actions demo
          </Link>
        ) : null}
      </div>
    </section>
  );
}

function EvidenceStatusIcon({ status }: { status: EvidenceSufficiency }) {
  if (status === "available") {
    return (
      <CircleCheck
        className="mt-0.5 size-4 shrink-0 text-emerald-700"
        aria-hidden="true"
      />
    );
  }
  if (status === "insufficient") {
    return (
      <CircleAlert
        className="mt-0.5 size-4 shrink-0 text-amber-600"
        aria-hidden="true"
      />
    );
  }
  return (
    <CircleDashed
      className="mt-0.5 size-4 shrink-0 text-zinc-400"
      aria-hidden="true"
    />
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
      <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-zinc-500">
        {label}
      </dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums tracking-[-0.02em] text-zinc-950">
        {value}
      </dd>
    </div>
  );
}
