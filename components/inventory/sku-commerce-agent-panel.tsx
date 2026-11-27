"use client";

import { useId, useRef, useState, useTransition } from "react";
import { LoaderCircle, Sparkles } from "lucide-react";

import { runCommerceAgentInvestigationAction } from "@/lib/commerce-agent/actions";
import {
  createCommerceAgentClientRequestId,
  isCurrentCommerceAgentResponse,
  type CommerceAgentRequestKey,
} from "@/lib/commerce-agent/client-request";
import {
  COMMERCE_AGENT_STRUCTURED_INTENTS,
  type CommerceAgentStructuredIntent,
} from "@/lib/commerce-agent/intents";
import type {
  MerchantInvestigationAnswerDto,
  MerchantInvestigationAbstentionDto,
  MerchantInvestigationDto,
} from "@/lib/commerce-agent/merchant-response";
import type { MerchantInventoryIntelligenceRow } from "@/lib/inventory-intelligence/types";
import { cn } from "@/lib/utils";

type PanelState =
  | { kind: "idle" }
  | { kind: "loading"; intentClass: CommerceAgentStructuredIntent }
  | {
      kind: "ready";
      intentClass: CommerceAgentStructuredIntent;
      result: MerchantInvestigationAnswerDto | MerchantInvestigationAbstentionDto;
    }
  | {
      kind: "error";
      intentClass: CommerceAgentStructuredIntent;
      message: string;
    };

function claimClassLabel(claimClass: string): string {
  switch (claimClass) {
    case "observed_fact":
      return "Verified fact";
    case "engine_calculation":
      return "Calculated";
    case "estimate":
      return "Estimate";
    case "hypothesis":
      return "Hypothesis";
    case "unknown":
      return "Unknown";
    case "sourced_signal":
      return "Sourced signal";
    default:
      return claimClass;
  }
}

function generatorLabel(
  generator: MerchantInvestigationAnswerDto["generator"],
): string {
  switch (generator) {
    case "deterministic":
      return "Deterministic evidence";
    case "ai_validated":
      return "Validated draft";
    case "fallback_deterministic":
      return "Safe fallback";
    default:
      return generator;
  }
}

/**
 * Thin structured-intent investigation panel inside the SKU inspector.
 * Visible only when server-resolved commerce-agent soft-enable allows it.
 */
export function SkuCommerceAgentPanel({
  row,
  organizationId,
  stockObservationsStale,
  visible,
}: {
  row: MerchantInventoryIntelligenceRow;
  organizationId: string;
  stockObservationsStale: boolean;
  /** Server-resolved enablement ∧ allowlist — never trust client toggles. */
  visible: boolean;
}) {
  const headingId = useId();
  const [state, setState] = useState<PanelState>({ kind: "idle" });
  const [pending, startTransition] = useTransition();
  const latestRequestRef = useRef<CommerceAgentRequestKey | null>(null);

  if (!visible) {
    return null;
  }

  function investigate(intentClass: CommerceAgentStructuredIntent) {
    const clientRequestId = createCommerceAgentClientRequestId();
    const requestKey: CommerceAgentRequestKey = {
      clientRequestId,
      grainKey: row.grainKey,
      intentClass,
    };
    latestRequestRef.current = requestKey;
    setState({ kind: "loading", intentClass });

    startTransition(async () => {
      let result: MerchantInvestigationDto;
      try {
        result = await runCommerceAgentInvestigationAction({
          organizationId,
          storeId: row.storeId,
          locationId: row.locationId,
          variantId: row.variantId,
          intentClass,
          clientRequestId,
          stockObservationsStaleHint: stockObservationsStale,
        });
      } catch {
        if (
          !isCurrentCommerceAgentResponse({
            latest: latestRequestRef.current,
            responseClientRequestId: clientRequestId,
            responseIntentClass: intentClass,
            grainKey: row.grainKey,
          })
        ) {
          return;
        }
        setState({
          kind: "error",
          intentClass,
          message: "Unable to investigate this SKU right now.",
        });
        return;
      }

      if (
        !isCurrentCommerceAgentResponse({
          latest: latestRequestRef.current,
          responseClientRequestId: clientRequestId,
          responseIntentClass: intentClass,
          grainKey: row.grainKey,
        })
      ) {
        return;
      }

      if (!result.ok) {
        setState({
          kind: "error",
          intentClass,
          message: result.error,
        });
        return;
      }

      setState({
        kind: "ready",
        intentClass,
        result,
      });
    });
  }

  const activeIntent =
    state.kind === "idle" ? null : state.intentClass;

  return (
    <section
      className="rounded-2xl border border-zinc-200 bg-gradient-to-b from-white to-zinc-50 p-3 sm:p-4"
      data-inspector-section="commerce-agent"
      data-sku-commerce-agent="true"
      aria-labelledby={headingId}
    >
      <div className="flex items-start gap-2.5">
        <span
          className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700"
          aria-hidden="true"
        >
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3
            id={headingId}
            className="text-sm font-semibold tracking-[-0.01em] text-zinc-950"
          >
            Investigate with evidence
          </h3>
          <p className="mt-0.5 text-xs leading-5 text-zinc-500">
            Structured checks over trusted inventory facts — not a chatbot, and
            not a buy action.
          </p>
        </div>
      </div>

      <ul
        className="mt-3 grid gap-2 sm:grid-cols-2"
        data-sku-commerce-agent-intents="true"
      >
        {COMMERCE_AGENT_STRUCTURED_INTENTS.map((intent) => {
          const selected = activeIntent === intent.id;
          const loading =
            pending &&
            state.kind === "loading" &&
            state.intentClass === intent.id;
          return (
            <li key={intent.id}>
              <button
                type="button"
                className={cn(
                  "flex min-h-11 w-full items-start gap-2 rounded-xl border px-3 py-2.5 text-left outline-none transition-[border-color,background-color]",
                  "focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2",
                  selected
                    ? "border-zinc-900 bg-zinc-950 text-white"
                    : "border-zinc-200 bg-white text-zinc-800 hover:border-zinc-300 hover:bg-zinc-50",
                )}
                aria-pressed={selected}
                aria-busy={loading || undefined}
                disabled={pending}
                data-sku-commerce-agent-intent={intent.id}
                onClick={() => investigate(intent.id)}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium leading-5">
                    {intent.label}
                  </span>
                  <span
                    className={cn(
                      "mt-0.5 block text-xs leading-4",
                      selected ? "text-zinc-300" : "text-zinc-500",
                    )}
                  >
                    {intent.hint}
                  </span>
                </span>
                {loading ? (
                  <LoaderCircle
                    className="mt-0.5 size-4 shrink-0 animate-spin"
                    aria-hidden="true"
                  />
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>

      <div
        className="mt-3 min-h-[2.75rem]"
        aria-live="polite"
        data-sku-commerce-agent-result="true"
      >
        {state.kind === "loading" ? (
          <p
            className="flex items-center gap-2 text-sm text-zinc-600"
            data-sku-commerce-agent-loading="true"
          >
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            Gathering verified evidence…
          </p>
        ) : null}

        {state.kind === "error" ? (
          <div
            className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm leading-6 text-amber-950"
            data-sku-commerce-agent-error="true"
            role="alert"
          >
            {state.message}
          </div>
        ) : null}

        {state.kind === "ready" ? (
          <InvestigationResultCard result={state.result} />
        ) : null}

        {state.kind === "idle" ? (
          <p
            className="text-xs leading-5 text-zinc-500"
            data-sku-commerce-agent-empty="true"
          >
            Choose a check above. Answers stay grounded in this SKU&apos;s
            evidence.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function InvestigationResultCard({
  result,
}: {
  result: MerchantInvestigationAnswerDto | MerchantInvestigationAbstentionDto;
}) {
  if (result.kind === "abstained") {
    return (
      <div
        className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3"
        data-sku-commerce-agent-answer="true"
        data-sku-commerce-agent-status="abstained"
        data-sku-commerce-agent-code={result.code}
      >
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-amber-800">
          Cannot answer safely
        </p>
        <p
          className="mt-1 text-sm font-medium leading-6 text-amber-950"
          data-sku-commerce-agent-merchant-answer="true"
        >
          {result.merchantMessage}
        </p>
        {result.missingEvidenceLabels.length > 0 ? (
          <p
            className="mt-2 text-xs leading-5 text-amber-900"
            data-sku-commerce-agent-missing="true"
          >
            Missing: {result.missingEvidenceLabels.join("; ")}
          </p>
        ) : null}
        {result.nextSteps.length > 0 ? (
          <NextSteps steps={result.nextSteps} />
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border border-zinc-200 bg-white px-3 py-3"
      data-sku-commerce-agent-answer="true"
      data-sku-commerce-agent-status="answered"
      data-sku-commerce-agent-generator={result.generator}
      data-sku-commerce-agent-freshness={result.freshnessClass}
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-zinc-500">
          {generatorLabel(result.generator)}
        </p>
        {result.asOf ? (
          <p
            className="text-[0.65rem] text-zinc-400"
            data-sku-commerce-agent-as-of="true"
          >
            As of {result.asOf}
          </p>
        ) : null}
        <p
          className="text-[0.65rem] text-zinc-400"
          data-sku-commerce-agent-coverage="true"
        >
          Coverage: {result.freshnessClass}
        </p>
      </div>

      <p
        className="mt-1 text-sm font-medium leading-6 text-zinc-950"
        data-sku-commerce-agent-merchant-answer="true"
      >
        {result.merchantAnswer}
      </p>

      {result.findings.length > 0 ? (
        <div className="mt-3" data-sku-commerce-agent-findings="true">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-zinc-500">
            Findings
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {result.findings.map((finding, index) => (
              <li
                key={`finding-${index}`}
                className="text-xs leading-5 text-zinc-700"
                data-sku-commerce-agent-finding-class={finding.claimClass}
              >
                <span className="font-semibold text-zinc-500">
                  {claimClassLabel(finding.claimClass)}:
                </span>{" "}
                {finding.text}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.calculations.length > 0 ? (
        <div className="mt-3" data-sku-commerce-agent-calculations="true">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-zinc-500">
            Calculations
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {result.calculations.map((item, index) => (
              <li
                key={`calc-${index}`}
                className="text-xs leading-5 text-zinc-700"
              >
                <span className="font-medium text-zinc-800">{item.label}:</span>{" "}
                {item.value}
                {item.unit ? ` ${item.unit}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.hypotheses.length > 0 ? (
        <div
          className="mt-3 rounded-lg border border-amber-100 bg-amber-50/60 px-2.5 py-2"
          data-sku-commerce-agent-hypotheses="true"
        >
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-amber-800">
            Hypotheses / estimates — not proven
          </p>
          <ul className="mt-1 space-y-1">
            {result.hypotheses.map((item, index) => (
              <li
                key={`hyp-${index}`}
                className="text-xs leading-5 text-amber-950"
              >
                {item.text}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.uncertainty.length > 0 ||
      result.missingEvidenceLabels.length > 0 ? (
        <div className="mt-3" data-sku-commerce-agent-uncertainty="true">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-zinc-500">
            Uncertainty & gaps
          </p>
          <p className="mt-1 text-xs leading-5 text-zinc-600">
            {[...result.uncertainty, ...result.missingEvidenceLabels].join(
              " · ",
            )}
          </p>
        </div>
      ) : null}

      <div
        className="mt-3 rounded-lg bg-zinc-50 px-2.5 py-2"
        data-sku-commerce-agent-recommendation="true"
        data-sku-commerce-agent-approval={result.recommendedAction.approvalBoundary}
      >
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-zinc-500">
          Suggested review
        </p>
        <p className="mt-1 text-xs leading-5 text-zinc-700">
          {result.recommendedAction.summary}
        </p>
        <p className="mt-1 text-[0.7rem] leading-4 text-zinc-500">
          Approval: {result.recommendedAction.approvalBoundary.replaceAll("_", " ")}
          {" · "}
          Human approval required — no buy or create.
        </p>
      </div>

      {result.evidence.length > 0 ? (
        <details className="mt-3" data-sku-commerce-agent-evidence="true">
          <summary className="cursor-pointer text-xs font-semibold text-zinc-700 outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2">
            Supporting evidence & provenance
          </summary>
          <ul className="mt-2 space-y-2 border-t border-zinc-100 pt-2">
            {result.evidence.map((item, index) => (
              <li
                key={`ev-${index}`}
                className="text-xs leading-5 text-zinc-600"
                data-sku-commerce-agent-evidence-class={item.claimClass}
              >
                <span className="font-medium text-zinc-800">{item.label}:</span>{" "}
                {item.value}
                <span className="mt-0.5 block text-[0.7rem] text-zinc-400">
                  {claimClassLabel(item.claimClass)} · {item.sourceSystem}
                  {item.asOf || item.observedAt
                    ? ` · as of ${item.asOf ?? item.observedAt}`
                    : ""}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {result.nextSteps.length > 0 ? (
        <NextSteps steps={result.nextSteps} />
      ) : null}
    </div>
  );
}

function NextSteps({
  steps,
}: {
  steps: readonly { code: string; label: string }[];
}) {
  return (
    <div className="mt-3" data-sku-commerce-agent-next-steps="true">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-zinc-500">
        Verify next
      </p>
      <ol className="mt-1 list-decimal space-y-1 pl-4">
        {steps.map((step) => (
          <li
            key={step.code}
            className="text-xs leading-5 text-zinc-700"
            data-sku-commerce-agent-next-step={step.code}
          >
            {step.label}
          </li>
        ))}
      </ol>
    </div>
  );
}
