"use client";

import Link from "next/link";
import { useId, useState } from "react";
import {
  ArrowRight,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  ChevronDown,
  ShieldAlert,
} from "lucide-react";

import { ActivateDemandMetricsButton } from "@/components/inventory-readiness/activate-demand-metrics-button";
import { resolveDemandFreshnessGuidance } from "@/lib/inventory-readiness/demand-freshness";
import {
  inventoryEvidenceSourceDetail,
  inventoryEvidenceSourceLabel,
  type InventoryEvidenceSourceKind,
} from "@/lib/inventory-readiness/inventory-source";
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
  activationScope = null,
  activationScopeBlockMessage = null,
  inventorySourceKind = "csv",
  inventorySourceLabel,
  inventorySourceDetail,
  lastObservationLabel = null,
}: {
  readiness: MerchantDecisionReadiness;
  organizationId: string;
  variant?: "full" | "compact";
  showActionsDemoLink?: boolean;
  activationScope?: { storeId: string; locationId: string } | null;
  /** Fail-closed copy when scope is ambiguous or missing. */
  activationScopeBlockMessage?: string | null;
  /** Extensible evidence source (csv today; shopify later). */
  inventorySourceKind?: InventoryEvidenceSourceKind;
  inventorySourceLabel?: string;
  inventorySourceDetail?: string;
  /** Latest observation date shown next to as-of / freshness. */
  lastObservationLabel?: string | null;
}) {
  const sourceLabel =
    inventorySourceLabel ?? inventoryEvidenceSourceLabel(inventorySourceKind);
  const sourceDetail =
    inventorySourceDetail ?? inventoryEvidenceSourceDetail(inventorySourceKind);

  const freshness = resolveDemandFreshnessGuidance({
    hasSalesHistory: readiness.presence.hasSalesHistory,
    knownAvailableSkuCount: readiness.presence.knownAvailableSkuCount,
    hasCurrentDayInventoryObservation:
      readiness.presence.hasCurrentDayInventoryObservation,
    hasCurrentDayMetrics: readiness.presence.hasCurrentDayMetrics,
    hasPendingMetricWork: readiness.presence.hasPendingMetricWork,
    grainAlignedKnownDemandCount:
      readiness.presence.grainAlignedKnownDemandCount,
    hasActivationScope: Boolean(
      activationScope?.storeId && activationScope.locationId,
    ),
    asOfMetricDate: readiness.presence.primaryAsOfMetricDate,
    inventoryPlaceFreshnessKind:
      readiness.presence.inventoryPlaceFreshnessKind,
    planning: readiness.presence.planning,
  });

  const showActivate =
    freshness.showActivateButton &&
    Boolean(activationScope?.storeId && activationScope.locationId);
  const compact = variant === "compact";
  const detailsId = useId();
  const [detailsOpen, setDetailsOpen] = useState(false);

  const ctaHref =
    freshness.ctaHref === "inventory-import"
      ? `/app/${organizationId}/inventory/import`
      : freshness.ctaHref === "sales-import"
        ? `/app/${organizationId}/inventory/sales-import`
        : freshness.ctaHref === "inventory"
          ? `/app/${organizationId}/inventory`
          : null;

  return (
    <section
      aria-labelledby="decision-readiness-heading"
      data-decision-readiness="true"
      data-demand-freshness={freshness.kind}
      data-planning-configuration={
        freshness.planningConfiguration ?? "n/a"
      }
      data-show-activate={showActivate ? "true" : "false"}
      data-inventory-source={sourceLabel}
      data-inventory-source-kind={inventorySourceKind}
      data-activation-scope={
        activationScope ? "resolved" : activationScopeBlockMessage ? "blocked" : "none"
      }
      data-commercial-eligible={
        readiness.commercialActionsEligible ? "true" : "false"
      }
      className={cn(
        "rounded-3xl border border-zinc-200 bg-white shadow-sm",
        compact ? "p-4 sm:p-5" : "p-5 sm:p-6",
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 max-w-2xl">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Imported evidence
          </p>
          <h2
            id="decision-readiness-heading"
            className="mt-1.5 text-lg font-semibold tracking-[-0.03em] text-zinc-950 sm:text-xl"
          >
            Decision readiness
          </h2>
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

      <dl
        className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
        data-inventory-meta="true"
      >
        <Meta
          label="Source"
          value={sourceLabel}
          hint={sourceDetail}
        />
        <Meta
          label="Last observation"
          value={lastObservationLabel ?? "—"}
        />
        <Meta
          label="Store-local as-of"
          value={readiness.presence.primaryAsOfMetricDate ?? "—"}
        />
        <Meta
          label="Freshness"
          value={freshnessLabel(freshness.kind)}
        />
      </dl>

      <div
        className={cn(
          "mt-4 rounded-2xl border px-4 py-3",
          freshness.kind === "ready"
            ? "border-emerald-200 bg-emerald-50 text-emerald-950"
            : "border-amber-200 bg-amber-50 text-amber-950",
        )}
        data-freshness-banner={freshness.kind}
        data-planning-configuration={
          freshness.planningConfiguration ?? "n/a"
        }
      >
        <p className="text-sm font-semibold tracking-[-0.01em]">
          {freshness.headline}
        </p>
        <p className="mt-1 text-sm leading-6 opacity-95">
          {freshness.primaryNextStep}
        </p>

        {activationScopeBlockMessage &&
        freshness.kind === "activate_metrics" &&
        !showActivate ? (
          <p
            className="mt-2 text-sm leading-6 opacity-95"
            data-activation-scope-blocked="true"
            role="status"
          >
            {activationScopeBlockMessage}
          </p>
        ) : null}

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          {showActivate && activationScope ? (
            <ActivateDemandMetricsButton
              organizationId={organizationId}
              storeId={activationScope.storeId}
              locationId={activationScope.locationId}
            />
          ) : null}
          {!showActivate && freshness.ctaLabel && ctaHref ? (
            <Link
              href={ctaHref}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-zinc-950 px-4 text-sm font-semibold text-white"
              data-primary-inventory-cta={freshness.kind}
            >
              {freshness.ctaLabel}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      </div>

      <p className="mt-3 text-xs leading-5 text-zinc-500">
        {readiness.presence.knownAvailableSkuCount} SKU position(s) ·{" "}
        {readiness.presence.distinctStoreCount} store(s) ·{" "}
        {readiness.presence.distinctLocationCount} location(s) ·{" "}
        {readiness.presence.inventorySnapshotCount} snapshot(s)
      </p>

      {!compact ? (
        <div className="mt-4">
          <button
            type="button"
            className="inline-flex min-h-9 items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 hover:border-zinc-300"
            aria-expanded={detailsOpen}
            aria-controls={detailsId}
            onClick={() => setDetailsOpen((open) => !open)}
            data-evidence-disclosure="true"
          >
            {detailsOpen ? "Hide detailed evidence" : "Show detailed evidence"}
            <ChevronDown
              className={cn(
                "size-3.5 transition-transform",
                detailsOpen && "rotate-180",
              )}
              aria-hidden="true"
            />
          </button>

          {detailsOpen ? (
            <div
              id={detailsId}
              className="mt-4 space-y-5 border-t border-zinc-100 pt-4"
            >
              <p className="text-sm leading-6 text-zinc-600">
                {readiness.summary}
              </p>

              <div className="grid gap-6 lg:grid-cols-2">
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

              {readiness.nextSteps.length > 1 ? (
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3">
                  <h3 className="text-sm font-semibold text-zinc-900">
                    Additional steps
                  </h3>
                  <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm leading-6 text-zinc-700">
                    {readiness.nextSteps.slice(1).map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                </div>
              ) : null}

              {showActionsDemoLink ? (
                <Link
                  href={`/app/${organizationId}/actions`}
                  className="inline-flex min-h-9 items-center gap-2 text-sm font-medium text-zinc-700 underline-offset-2 hover:underline"
                >
                  Open synthetic Actions demo
                  <ArrowRight className="size-3.5" aria-hidden="true" />
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : showActionsDemoLink ? (
        <div className="mt-4">
          <Link
            href={`/app/${organizationId}/actions`}
            className="inline-flex min-h-9 items-center gap-2 text-sm font-medium text-zinc-700 underline-offset-2 hover:underline"
          >
            Open synthetic Actions demo
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
      ) : null}
    </section>
  );
}

function freshnessLabel(
  kind: ReturnType<typeof resolveDemandFreshnessGuidance>["kind"],
): string {
  switch (kind) {
    case "missing_inventory":
      return "Needs stock import";
    case "missing_sales":
      return "Needs sales import";
    case "missing_current_day_stock":
      return "Stock observation stale";
    case "activate_metrics":
      return "Metrics need refresh";
    case "ready":
      return "Current";
  }
}

function Meta({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5">
      <dt className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-zinc-500">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-semibold tracking-[-0.01em] text-zinc-950">
        {value}
      </dd>
      {hint ? (
        <p className="mt-1 text-[0.65rem] leading-4 text-zinc-500">{hint}</p>
      ) : null}
    </div>
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
