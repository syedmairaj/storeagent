"use client";

import {
  useMemo,
} from "react";

import {
  ActionTypeChip,
} from "@/components/actions-demo/action-type-presentation";

import {
  DemoApprovalCluster,
} from "@/components/actions-demo/demo-approval-cluster";

import type {
  OrganizationMemberRole,
} from "@/lib/commerce-domain/types";

import {
  composeDemoDecisionBrief,
  formatQuantityFieldDisplay,
  isKnown,
  type DecisionBriefV1,
  type Field,
} from "@/lib/decision-brief";

import type {
  DemoActionItem,
} from "@/lib/demo/m7-decision-demo-fixtures";

import {
  explainDemoReasonCode,
  formatDemoConfidenceLabel,
  formatDemoDataQualityScore,
  formatDemoPriorityLabel,
  formatDemoUnknownNumber,
} from "@/lib/demo/m7-decision-demo-format";

type EvidenceFieldState =
  | "known"
  | "unknown"
  | "not_applicable";

type EvidenceField = {
  label: string;
  value: string;
  fieldState: EvidenceFieldState;
};

/** Fixture / brief codes that already encode stale evidence — never invent freshness. */
const STALE_EVIDENCE_CODES = [
  "stale_evidence",
  "stale_inventory_observation",
] as const;

interface DecisionBriefPanelProps {
  action: DemoActionItem;
  role: OrganizationMemberRole;
  /**
   * contained: desktop sticky shell — ONE scroll owner wraps the full brief
   * (decision → evidence → controls → technical). Never pin a tall non-scrolling
   * header that can clip quantity editors or Technical details.
   * flow: sheet/tablet — grow with content; parent owns scrolling.
   */
  heightMode?:
    | "contained"
    | "flow";
  /**
   * Optional server-precomposed brief (E3.3 soft-enable). When omitted, the
   * panel uses the local E1/E2 deterministic compose path. Never pass
   * client-authored enablement — only server-resolved briefs.
   */
  precomposedBrief?: DecisionBriefV1;
}

/**
 * Decision Brief inspector body.
 * Default: E1 trusted synthetic fixture path (E2 parity).
 * Soft-enable: render server-precomposed brief (may be ai_validated).
 */
export function DecisionBriefPanel({
  action,
  role,
  heightMode = "flow",
  precomposedBrief,
}: DecisionBriefPanelProps) {
  const composed =
    useMemo(
      () => {
        if (
          precomposedBrief
        ) {
          return {
            ok: true as const,
            brief: precomposedBrief,
          };
        }

        return composeDemoDecisionBrief(
          action,
          {
            role,
          },
        );
      },
      [
        action,
        role,
        precomposedBrief,
      ],
    );

  if (
    !composed.ok
  ) {
    return (
      <BriefCompositionError
        detail={composed.detail}
        reasons={composed.reasons}
        heightMode={heightMode}
      />
    );
  }

  return (
    <DecisionBriefView
      action={action}
      brief={composed.brief}
      role={role}
      heightMode={heightMode}
    />
  );
}

function DecisionBriefView({
  action,
  brief,
  role,
  heightMode,
}: {
  action: DemoActionItem;
  brief: DecisionBriefV1;
  role: OrganizationMemberRole;
  heightMode:
    | "contained"
    | "flow";
}) {
  const contained =
    heightMode === "contained";

  const isWatch =
    brief.recommendation.actionType === "WATCH";

  const showQuantity =
    brief.recommendation.actionType === "REORDER";

  const secondaryFields =
    getSecondaryEvidenceFields(
      action,
      brief,
    );

  const watchWhyNowFacts =
    action.evidence.reasonCodes
      .slice(0, 3)
      .map(
        (code) =>
          explainDemoReasonCode(code),
      );

  // Merchant strip: human explanations only. Raw codes stay in Technical details.
  // WATCH Grounded signals already explains evidence.reasonCodes — do not repeat.
  const uncertaintyExplanations =
    isWatch
      ? uniqueExplanationsForCodes(
          brief.uncertainty.codes,
          new Set(
            action.evidence.reasonCodes,
          ),
        )
      : [];

  const staleEvidenceCopy =
    resolveStaleEvidenceCopy(
      action,
      brief,
    );

  const recommendationBlock = (
    <div data-actions-brief-section="recommendation">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2">
        <ActionTypeChip
          actionType={brief.recommendation.actionType}
        />
        <PriorityBadge
          priority={brief.recommendation.priority}
        />
        <ConfidenceBadge
          confidence={brief.confidence.level}
        />
      </div>

      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5 sm:mt-2.5 sm:gap-2">
        <span
          data-actions-brief-provenance="synthetic"
          className="inline-flex max-w-full items-center rounded-full border border-amber-200/90 bg-amber-50/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-950 sm:px-2.5 sm:py-1 sm:text-[11px]"
        >
          Synthetic demonstration
        </span>
        <span
          role="status"
          data-actions-brief-provenance="generator"
          className="inline-flex max-w-full items-center rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[10px] font-medium text-zinc-600 sm:px-2.5 sm:py-1 sm:text-[11px]"
        >
          {generatorLabel(brief)}
        </span>
      </div>

      <h2 className="mt-3 text-lg font-semibold tracking-[-0.03em] text-zinc-950 sm:mt-3.5 sm:text-xl">
        {brief.recommendation.productTitle}
      </h2>
      <p className="mt-0.5 text-sm text-zinc-500">
        {brief.recommendation.variantTitle}
      </p>

      {showQuantity && (
        <div className="mt-3 rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 sm:mt-3.5 sm:px-4 sm:py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Recommended quantity
          </p>
          <p
            data-actions-brief-quantity={
              isKnown(brief.recommendation.recommendedQuantity)
                ? "known"
                : "unknown"
            }
            className={`mt-1 text-2xl font-semibold tracking-[-0.03em] tabular-nums sm:text-[1.75rem] ${
              isKnown(brief.recommendation.recommendedQuantity)
                ? "text-zinc-950"
                : "text-zinc-400"
            }`}
          >
            {formatQuantityFieldDisplay(
              brief.recommendation.recommendedQuantity,
            )}
          </p>
          <RecommendedActionDate
            field={brief.recommendation.recommendedActionDate}
          />
          <p className="mt-1 text-xs leading-5 text-zinc-500">
            Quantity grounded in this synthetic fixture only.
          </p>
        </div>
      )}

      {!showQuantity && !isWatch && (
        <p className="mt-3 text-xs leading-5 text-zinc-500 sm:mt-3.5">
          No recommended quantity for{" "}
          {brief.recommendation.label} in this demonstration.
        </p>
      )}

      {isWatch && (
        <div
          data-actions-brief-watch="uncertainty-first"
          className="mt-3 rounded-xl border border-zinc-300 bg-zinc-50 px-3.5 py-2.5 sm:mt-3.5 sm:px-4 sm:py-3"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
            Uncertainty first
          </p>
          <p className="mt-1.5 text-sm leading-6 text-zinc-800">
            {brief.uncertainty.summary}
          </p>
          <p className="mt-1.5 text-xs leading-5 text-zinc-500">
            Watch only. No buy, reduce, or promote recommendation on this SKU.
          </p>
        </div>
      )}
    </div>
  );

  const bodySections = (
    <div className="space-y-3 sm:space-y-4">
      <section
        data-actions-brief-section="why"
        aria-labelledby={`why-now-${brief.briefId}`}
      >
        <h3
          id={`why-now-${brief.briefId}`}
          className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 sm:text-xs"
        >
          {isWatch
            ? "Grounded signals"
            : "Why now"}
        </h3>
        {isWatch ? (
          watchWhyNowFacts.length > 0 ? (
            <ul className="mt-2 space-y-1.5">
              {watchWhyNowFacts.map(
                (fact) => (
                  <li
                    key={fact}
                    className="text-sm leading-6 text-zinc-700"
                  >
                    {fact}
                  </li>
                ),
              )}
            </ul>
          ) : (
            <p className="mt-2 text-sm leading-6 text-zinc-700">
              Key evidence fields are incomplete in this demonstration snapshot.
            </p>
          )
        ) : (
          <p className="mt-2 text-sm leading-6 text-zinc-700">
            {brief.whyNow.summary}
          </p>
        )}
      </section>

      <section
        data-actions-brief-section="evidence"
        aria-labelledby={`key-evidence-${brief.briefId}`}
      >
        <h3
          id={`key-evidence-${brief.briefId}`}
          className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 sm:text-xs"
        >
          Key evidence
        </h3>
        <EvidenceGrid
          fields={brief.evidence.keyFacts.map(
            (fact) => ({
              label: fact.label,
              value: fact.display,
              fieldState: fact.fieldState,
            }),
          )}
        />
      </section>

      <section
        data-actions-brief-section="uncertainty"
        aria-labelledby={`confidence-uncertainty-${brief.briefId}`}
      >
        <h3
          id={`confidence-uncertainty-${brief.briefId}`}
          className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 sm:text-xs"
        >
          Confidence & uncertainty
        </h3>

        {staleEvidenceCopy && (
          <p
            data-actions-stale-evidence="true"
            className="mt-2 rounded-xl border border-zinc-300 bg-zinc-50 px-3.5 py-2.5 text-sm leading-6 text-zinc-700"
          >
            <span className="font-semibold text-zinc-800">
              Stale evidence
            </span>
            <span className="mt-0.5 block text-zinc-600">
              {staleEvidenceCopy}
            </span>
          </p>
        )}

        <div className="mt-2 grid gap-2 sm:grid-cols-2 sm:gap-2.5">
          <div className="rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 sm:px-3.5 sm:py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
              Confidence
            </p>
            <p className="mt-1 text-sm font-semibold text-zinc-900">
              {formatDemoConfidenceLabel(brief.confidence.level)}
            </p>
            {brief.confidence.displayNotes.length > 0 && (
              <ul className="mt-1.5 space-y-1">
                {brief.confidence.displayNotes.slice(0, 2).map(
                  (note) => (
                    <li
                      key={note}
                      className="text-xs leading-5 text-zinc-600"
                    >
                      {note}
                    </li>
                  ),
                )}
              </ul>
            )}
          </div>

          <div
            className={
              isWatch || brief.uncertainty.hasMaterialUncertainty
                ? "rounded-xl border border-zinc-300 bg-zinc-50 px-3.5 py-2.5 sm:px-3.5 sm:py-3"
                : "rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 sm:px-3.5 sm:py-3"
            }
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
              Uncertainty
            </p>
            {isWatch ? (
              uncertaintyExplanations.length > 0 ? (
                <ul className="mt-1.5 space-y-1.5">
                  {uncertaintyExplanations.slice(0, 3).map(
                    (explanation) => (
                      <li
                        key={explanation}
                        className="text-xs leading-5 text-zinc-700"
                      >
                        {explanation}
                      </li>
                    ),
                  )}
                </ul>
              ) : (
                <p className="mt-1.5 text-sm leading-6 text-zinc-800">
                  See uncertainty-first note above. Raw codes remain in Technical details.
                </p>
              )
            ) : (
              <p className="mt-1.5 text-sm leading-6 text-zinc-800">
                {brief.uncertainty.hasMaterialUncertainty
                  ? brief.uncertainty.summary
                  : "No material uncertainty flagged."}
              </p>
            )}
            {isWatch && (
              <p className="mt-2 text-[11px] leading-5 text-zinc-500">
                Incomplete evidence — watch only. Not actionable as a purchase.
              </p>
            )}
          </div>
        </div>
      </section>

      <section
        data-actions-brief-section="next-step"
        aria-labelledby={`next-step-${brief.briefId}`}
      >
        <h3
          id={`next-step-${brief.briefId}`}
          className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 sm:text-xs"
        >
          Suggested next step
        </h3>
        <p className="mt-1.5 text-sm leading-6 text-zinc-700">
          {brief.suggestedNextStep.summary}
        </p>
      </section>

      {/* Controls after next step for both height modes — must live inside the
          single scroll owner so REORDER editors stay reachable on short desktops. */}
      <div data-actions-brief-section="controls">
        <DemoApprovalCluster
          key={action.id}
          action={action}
          role={role}
        />
      </div>

      <details
        data-actions-brief-section="technical"
        className="rounded-xl border border-zinc-200 bg-zinc-50/70 px-3.5 py-2 open:bg-white sm:px-4 sm:py-2.5"
      >
        <summary className="cursor-pointer list-none rounded-xl text-sm font-medium text-zinc-800 marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 [&::-webkit-details-marker]:hidden">
          <span className="inline-flex min-h-11 items-center">
            Technical details
          </span>
        </summary>

        <div className="pb-2 pt-1">
          {secondaryFields.length > 0 && (
            <>
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                Additional evidence
              </h4>
              <EvidenceGrid
                fields={secondaryFields}
              />
            </>
          )}

          <RawReasonCodeList
            title="Raw reason codes"
            codes={[
              ...new Set([
                ...action.evidence.reasonCodes,
                ...brief.confidence.reasonCodes,
              ]),
            ]}
          />

          {brief.confidence.displayNotes.length > 0 && (
            <div className="mt-4">
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                Confidence notes
              </h4>
              <ul className="mt-2 space-y-2">
                {brief.confidence.reasonCodes.map(
                  (code, index) => (
                    <li
                      key={code}
                      className="text-sm leading-5 text-zinc-600"
                    >
                      <span>
                        {brief.confidence.displayNotes[index] ??
                          explainDemoReasonCode(code)}
                      </span>
                      <span className="mt-0.5 block font-mono text-[11px] text-zinc-400">
                        {code}
                      </span>
                    </li>
                  ),
                )}
              </ul>
            </div>
          )}

          <div className="mt-4 rounded-xl border border-zinc-200 bg-white px-3.5 py-3">
            <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
              How this brief was built
            </h4>
            <dl className="mt-2 space-y-1.5 text-xs leading-5 text-zinc-600">
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-medium text-zinc-500">
                  Mode
                </dt>
                <dd>{brief.briefMode}</dd>
              </div>
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-medium text-zinc-500">
                  Generator
                </dt>
                <dd>{generatorLabel(brief)}</dd>
              </div>
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-medium text-zinc-500">
                  Validation
                </dt>
                <dd>{brief.validationStatus}</dd>
              </div>
              {brief.rejection && (
                <div className="flex flex-wrap gap-x-2">
                  <dt className="font-medium text-zinc-500">
                    Fallback reasons
                  </dt>
                  <dd className="font-mono text-[11px] text-zinc-500">
                    {brief.rejection.reasons.join(", ")}
                  </dd>
                </div>
              )}
              {brief.provenance.ai && (
                <div className="flex flex-wrap gap-x-2">
                  <dt className="font-medium text-zinc-500">
                    AI provenance
                  </dt>
                  <dd className="font-mono text-[11px] text-zinc-500">
                    {brief.provenance.ai.provider}/{brief.provenance.ai.model}
                  </dd>
                </div>
              )}
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-medium text-zinc-500">
                  Algorithm
                </dt>
                <dd>{brief.provenance.algorithmVersion}</dd>
              </div>
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-medium text-zinc-500">
                  Freshness
                </dt>
                <dd>
                  {brief.provenance.freshnessStatus === "unknown"
                    ? "Unknown"
                    : brief.provenance.freshnessStatus}
                </dd>
              </div>
              <div className="flex flex-wrap gap-x-2">
                <dt className="font-medium text-zinc-500">
                  Production approval eligible
                </dt>
                <dd>
                  {brief.humanControls.productionApprovalEligible
                    ? "true"
                    : "false"}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </details>
    </div>
  );

  const briefInner = (
    <>
      <header className="border-b border-zinc-100 px-4 py-3.5 sm:px-5 sm:py-5">
        {recommendationBlock}
      </header>

      <div className="px-4 py-3 sm:px-5 sm:py-4">
        {bodySections}
      </div>
    </>
  );

  return (
    <article
      className={
        contained
          ? "flex h-full min-h-0 max-h-[inherit] flex-1 flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm motion-safe:transition-shadow motion-safe:duration-200"
          : "rounded-3xl border border-zinc-200 bg-white shadow-sm"
      }
      aria-label="Decision brief"
    >
      {contained ? (
        <div
          data-actions-brief-scroll="true"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]"
        >
          {briefInner}
        </div>
      ) : (
        briefInner
      )}
    </article>
  );
}

function BriefCompositionError({
  detail,
  reasons,
  heightMode,
}: {
  detail: string;
  reasons: readonly string[];
  heightMode:
    | "contained"
    | "flow";
}) {
  const contained =
    heightMode === "contained";

  return (
    <article
      className={
        contained
          ? "flex h-full min-h-0 max-h-[inherit] flex-1 flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm"
          : "rounded-3xl border border-zinc-200 bg-white shadow-sm"
      }
      role="alert"
    >
      <div className="px-5 py-8 sm:px-7">
        <p className="text-sm font-semibold text-zinc-950">
          Decision brief unavailable
        </p>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          This demonstration brief failed closed and will not be shown.
        </p>
        <p className="mt-3 text-xs leading-5 text-zinc-500">
          {detail}
        </p>
        {reasons.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {reasons.map(
              (reason) => (
                <li
                  key={reason}
                  className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 font-mono text-[11px] text-zinc-600"
                >
                  {reason}
                </li>
              ),
            )}
          </ul>
        )}
      </div>
    </article>
  );
}

function generatorLabel(
  brief: DecisionBriefV1,
): string {
  if (
    brief.generator === "ai_validated"
  ) {
    return "AI-assisted explanation";
  }

  return "StoreAgent explanation";
}

/**
 * Map uncertainty codes to approved deterministic merchant copy.
 * Skips excluded codes (already shown elsewhere) and duplicate explanations.
 */
function uniqueExplanationsForCodes(
  codes: readonly string[],
  excludeCodes?: ReadonlySet<string>,
): string[] {
  const explanations: string[] = [];
  const seen =
    new Set<string>();

  for (
    const code of codes
  ) {
    if (
      excludeCodes?.has(code)
    ) {
      continue;
    }

    // Synthetic field keys (e.g. availableQuantity_unknown) stay machine-ish;
    // still humanize via the approved reason-code explainer.
    const explanation =
      explainDemoReasonCode(
        code,
      );

    if (
      seen.has(explanation)
    ) {
      continue;
    }

    seen.add(explanation);
    explanations.push(explanation);
  }

  return explanations;
}

/**
 * Surface stale evidence only when existing fixture/brief codes already say so.
 * Never invents freshness timestamps or live-data claims.
 */
function resolveStaleEvidenceCopy(
  action: DemoActionItem,
  brief: DecisionBriefV1,
): string | null {
  const presentCodes = new Set<string>([
    ...action.evidence.reasonCodes,
    ...action.confidenceReasonCodes,
    ...brief.uncertainty.codes,
    ...brief.confidence.reasonCodes,
  ]);

  for (
    const code of STALE_EVIDENCE_CODES
  ) {
    if (
      presentCodes.has(code)
    ) {
      return explainDemoReasonCode(code);
    }
  }

  return null;
}

function evidenceFieldStateFromDisplay(
  value: string,
): EvidenceFieldState {
  return value === "Unknown"
    ? "unknown"
    : "known";
}

function secondaryEvidenceField(
  label: string,
  value: string,
): EvidenceField {
  return {
    label,
    value,
    fieldState: evidenceFieldStateFromDisplay(value),
  };
}

function RecommendedActionDate({
  field,
}: {
  field: Field<string>;
}) {
  if (
    !isKnown(field)
  ) {
    return null;
  }

  return (
    <p className="mt-1.5 text-sm text-zinc-600">
      Suggested by{" "}
      <span className="font-medium text-zinc-800">
        {field.value}
      </span>
    </p>
  );
}

function PriorityBadge({
  priority,
}: {
  priority: DecisionBriefV1["recommendation"]["priority"];
}) {
  return (
    <span className="inline-flex max-w-full items-center rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-700 sm:px-2.5 sm:py-1 sm:text-[11px]">
      {formatDemoPriorityLabel(priority)}
    </span>
  );
}

function ConfidenceBadge({
  confidence,
}: {
  confidence: DecisionBriefV1["confidence"]["level"];
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[10px] font-medium text-zinc-600 sm:gap-1.5 sm:px-2.5 sm:py-1 sm:text-[11px]">
      <span
        className={`size-1.5 shrink-0 rounded-full ${
          confidence === "high"
            ? "bg-emerald-500"
            : confidence === "medium"
              ? "bg-amber-500"
              : "bg-zinc-400"
        }`}
        aria-hidden="true"
      />
      <span className="truncate">
        {formatDemoConfidenceLabel(confidence)}{" "}
        <span className="hidden min-[380px]:inline">
          confidence
        </span>
      </span>
    </span>
  );
}

function EvidenceGrid({
  fields,
}: {
  fields: EvidenceField[];
}) {
  return (
    <dl className="mt-2.5 grid grid-cols-1 gap-2 min-[380px]:grid-cols-2 sm:mt-3 sm:grid-cols-3 sm:gap-2.5">
      {fields.map(
        ({
          label,
          value,
          fieldState,
        }) => {
          const isUnknown =
            fieldState === "unknown" ||
            value === "Unknown";

          return (
            <div
              key={label}
              data-actions-evidence-cell={
                isUnknown
                  ? "unknown"
                  : "known"
              }
              className={
                isUnknown
                  ? "min-w-0 rounded-xl border border-zinc-100 bg-zinc-50/60 px-3.5 py-2.5"
                  : "min-w-0 rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5"
              }
            >
              <dt className="text-[11px] font-medium uppercase tracking-[0.1em] text-zinc-500">
                {label}
              </dt>
              <dd
                className={`mt-1 text-sm font-semibold tabular-nums tracking-[-0.01em] ${
                  isUnknown
                    ? "text-zinc-400"
                    : "text-zinc-950"
                }`}
              >
                {isUnknown
                  ? "Unknown"
                  : value}
              </dd>
            </div>
          );
        },
      )}
    </dl>
  );
}

function RawReasonCodeList({
  title,
  codes,
}: {
  title: string;
  codes: string[];
}) {
  return (
    <div className="mt-4">
      <h4 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
        {title}
      </h4>

      {codes.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-400">
          Unknown
        </p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-2">
          {codes.map(
            (code) => (
              <li
                key={code}
                className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 font-mono text-[11px] text-zinc-600"
              >
                {code}
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}

function getSecondaryEvidenceFields(
  action: DemoActionItem,
  brief: DecisionBriefV1,
): EvidenceField[] {
  const evidence =
    action.evidence;

  const keyLabels =
    new Set(
      brief.evidence.keyFacts.map(
        (fact) =>
          fact.label,
      ),
    );

  const candidates: EvidenceField[] = [
    secondaryEvidenceField(
      "Safety stock",
      formatDemoUnknownNumber(
        evidence.safetyStockUnits,
      ),
    ),
    secondaryEvidenceField(
      "Reorder point",
      formatDemoUnknownNumber(
        evidence.reorderPointUnits,
      ),
    ),
    secondaryEvidenceField(
      "Target stock",
      formatDemoUnknownNumber(
        evidence.targetStockUnits,
      ),
    ),
    secondaryEvidenceField(
      "Inventory age",
      formatDemoUnknownNumber(
        evidence.inventoryAgeDays,
        {
          suffix: " days",
        },
      ),
    ),
    secondaryEvidenceField(
      "Forecast demand",
      formatDemoUnknownNumber(
        evidence.forecastExpectedDemandUnits,
      ),
    ),
    secondaryEvidenceField(
      "Demand velocity",
      formatDemoUnknownNumber(
        evidence.demandVelocity,
        {
          digits: 1,
          suffix: "/day",
        },
      ),
    ),
    secondaryEvidenceField(
      "Days of stock",
      formatDemoUnknownNumber(
        evidence.daysOfStock,
        {
          digits: 1,
        },
      ),
    ),
    secondaryEvidenceField(
      "Lead time",
      formatDemoUnknownNumber(
        evidence.leadTimeDays,
        {
          suffix: " days",
        },
      ),
    ),
    secondaryEvidenceField(
      "Data quality",
      formatDemoDataQualityScore(
        evidence.dataQualityScore,
      ),
    ),
  ];

  return candidates.filter(
    (field) =>
      !keyLabels.has(field.label),
  );
}
