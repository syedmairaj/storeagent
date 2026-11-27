"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { Globe2, LoaderCircle, X } from "lucide-react";

import { runMarketResearchAction } from "@/lib/market-research/actions";
import {
  createMarketResearchClientRequestId,
  isCurrentMarketResearchResponse,
  type MarketResearchRequestKey,
} from "@/lib/market-research/client-request";
import {
  MERCHANT_RESEARCH_STRUCTURED_DEPTHS,
  MERCHANT_RESEARCH_STRUCTURED_INTENTS,
  listMerchantResearchCountriesForUx,
  type MerchantResearchCountryCode,
  type MerchantResearchStructuredDepth,
  type MerchantResearchStructuredIntent,
} from "@/lib/market-research/merchant-intents";
import type {
  MerchantResearchAbstentionDto,
  MerchantResearchAnswerDto,
  MerchantResearchDto,
} from "@/lib/market-research/merchant-response";
import { SYNTHETIC_PREVIEW_WARNING } from "@/lib/market-research/merchant-response";
import type { MerchantInventoryIntelligenceRow } from "@/lib/inventory-intelligence/types";
import { cn } from "@/lib/utils";

type PanelState =
  | { kind: "idle" }
  | {
      kind: "loading";
      intentClass: MerchantResearchStructuredIntent;
      countryCode: MerchantResearchCountryCode;
      depth: MerchantResearchStructuredDepth;
    }
  | {
      kind: "ready";
      intentClass: MerchantResearchStructuredIntent;
      countryCode: MerchantResearchCountryCode;
      depth: MerchantResearchStructuredDepth;
      result: MerchantResearchAnswerDto | MerchantResearchAbstentionDto;
    }
  | {
      kind: "error";
      intentClass: MerchantResearchStructuredIntent;
      countryCode: MerchantResearchCountryCode;
      depth: MerchantResearchStructuredDepth;
      message: string;
    };

function signalClassLabel(signalClass: string): string {
  switch (signalClass) {
    case "search_interest":
      return "Search interest (≠ sales)";
    case "public_listing":
      return "Public listing";
    case "public_review":
      return "Public review (≠ sales)";
    case "public_price":
      return "Public price";
    case "editorial":
      return "Editorial";
    case "rank_proxy":
      return "Rank proxy (≠ sales)";
    case "other_sourced":
      return "Sourced signal";
    case "merchant_internal":
      return "Merchant internal";
    default:
      return signalClass;
  }
}

function matchQualityLabel(quality: string): string {
  switch (quality) {
    case "exact":
      return "Exact SKU match";
    case "partial":
      return "Partial match — not exact SKU";
    case "mismatch":
      return "Mismatch";
    default:
      return "Unknown match";
  }
}

/**
 * Compact Market Intelligence entry inside the SKU Intelligence inspector.
 * Visible only when server-resolved research panel enablement allows it.
 * No automatic execution on mount. Production action never runs synthetic research.
 */
export function SkuMarketResearchPanel({
  row,
  organizationId,
  visible,
  /** When true, US/GB appear in the country selector (isolated preview only). */
  allowSyntheticPreviewCountries = false,
}: {
  row: MerchantInventoryIntelligenceRow;
  organizationId: string;
  /** Server-resolved enablement ∧ allowlist — never trust client toggles. */
  visible: boolean;
  allowSyntheticPreviewCountries?: boolean;
}) {
  const headingId = useId();
  const countrySelectId = useId();
  const depthSelectId = useId();
  const [intentClass, setIntentClass] =
    useState<MerchantResearchStructuredIntent>("market_opportunity");
  const [countryCode, setCountryCode] =
    useState<MerchantResearchCountryCode>("AE");
  const [depth, setDepth] =
    useState<MerchantResearchStructuredDepth>("quick_lookup");
  const [state, setState] = useState<PanelState>({ kind: "idle" });
  const [pending, startTransition] = useTransition();
  const latestRequestRef = useRef<MarketResearchRequestKey | null>(null);
  const discardedIdsRef = useRef<Set<string>>(new Set());

  const countries = listMerchantResearchCountriesForUx({
    allowSyntheticPreviewCountries,
  });

  // Remount via key={grain} resets local state. Unmount discards late responses.
  useEffect(() => {
    const discardedIds = discardedIdsRef.current;
    return () => {
      const latest = latestRequestRef.current;
      if (latest) {
        discardedIds.add(latest.clientRequestId);
      }
      latestRequestRef.current = null;
    };
  }, []);

  if (!visible) {
    return null;
  }

  function discardInFlight() {
    const latest = latestRequestRef.current;
    if (latest) {
      discardedIdsRef.current.add(latest.clientRequestId);
    }
    latestRequestRef.current = null;
    setState({ kind: "idle" });
  }

  function runResearch() {
    if (pending) {
      return;
    }

    const clientRequestId = createMarketResearchClientRequestId();
    const requestKey: MarketResearchRequestKey = {
      clientRequestId,
      grainKey: row.grainKey,
      intentClass,
      countryCode,
      depth,
    };
    latestRequestRef.current = requestKey;
    setState({
      kind: "loading",
      intentClass,
      countryCode,
      depth,
    });

    startTransition(async () => {
      let result: MerchantResearchDto;
      try {
        result = await runMarketResearchAction({
          organizationId,
          storeId: row.storeId,
          locationId: row.locationId,
          variantId: row.variantId,
          intentClass,
          countryCode,
          depth,
          clientRequestId,
        });
      } catch {
        if (
          discardedIdsRef.current.has(clientRequestId) ||
          !isCurrentMarketResearchResponse({
            latest: latestRequestRef.current,
            responseClientRequestId: clientRequestId,
            responseIntentClass: intentClass,
            responseCountryCode: countryCode,
            responseDepth: depth,
            grainKey: row.grainKey,
          })
        ) {
          return;
        }
        setState({
          kind: "error",
          intentClass,
          countryCode,
          depth,
          message: "Unable to run market research right now.",
        });
        return;
      }

      if (
        discardedIdsRef.current.has(clientRequestId) ||
        !isCurrentMarketResearchResponse({
          latest: latestRequestRef.current,
          responseClientRequestId: clientRequestId,
          responseIntentClass: intentClass,
          responseCountryCode: countryCode,
          responseDepth: depth,
          grainKey: row.grainKey,
        })
      ) {
        return;
      }

      // Bind to returned request identity when present.
      if (
        result.ok &&
        "clientRequestId" in result &&
        result.clientRequestId !== clientRequestId
      ) {
        return;
      }

      if (!result.ok) {
        setState({
          kind: "error",
          intentClass,
          countryCode,
          depth,
          message: result.error,
        });
        return;
      }

      setState({
        kind: "ready",
        intentClass,
        countryCode,
        depth,
        result,
      });
    });
  }

  const controlsDisabled = pending;

  return (
    <section
      className="rounded-2xl border border-zinc-200 bg-gradient-to-b from-white to-zinc-50/80 p-3 sm:p-4"
      data-inspector-section="market-research"
      data-sku-market-research="true"
      aria-labelledby={headingId}
    >
      <div className="flex items-start gap-2.5">
        <span
          className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700"
          aria-hidden="true"
        >
          <Globe2 className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3
            id={headingId}
            className="text-sm font-semibold tracking-[-0.01em] text-zinc-950"
          >
            Market Intelligence
          </h3>
          <p className="mt-0.5 text-xs leading-5 text-zinc-500">
            Sourced external signals for this SKU — separate from verified
            inventory facts. Not a buy or price recommendation.
          </p>
        </div>
      </div>

      <div
        className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5"
        data-sku-market-research-synthetic-warning="true"
        role="status"
      >
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-amber-800">
          Synthetic preview
        </p>
        <p className="mt-1 text-xs leading-5 text-amber-950">
          {SYNTHETIC_PREVIEW_WARNING}
        </p>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block min-w-0" htmlFor={countrySelectId}>
          <span className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-zinc-500">
            Country
          </span>
          <select
            id={countrySelectId}
            className="mt-1.5 flex min-h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-800 outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:opacity-60"
            value={countryCode}
            disabled={controlsDisabled}
            data-sku-market-research-country="true"
            onChange={(event) => {
              const next = event.target.value;
              if (
                next === "AE" ||
                next === "US" ||
                next === "GB"
              ) {
                setCountryCode(next);
                setState({ kind: "idle" });
                latestRequestRef.current = null;
              }
            }}
          >
            {countries.map((country) => (
              <option key={country.id} value={country.id}>
                {country.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block min-w-0" htmlFor={depthSelectId}>
          <span className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-zinc-500">
            Depth
          </span>
          <select
            id={depthSelectId}
            className="mt-1.5 flex min-h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-800 outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:opacity-60"
            value={depth}
            disabled={controlsDisabled}
            data-sku-market-research-depth="true"
            onChange={(event) => {
              const next = event.target.value;
              if (next === "quick_lookup" || next === "standard") {
                setDepth(next);
                setState({ kind: "idle" });
                latestRequestRef.current = null;
              }
            }}
          >
            {MERCHANT_RESEARCH_STRUCTURED_DEPTHS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ul
        className="mt-3 grid gap-2"
        data-sku-market-research-intents="true"
      >
        {MERCHANT_RESEARCH_STRUCTURED_INTENTS.map((intent) => {
          const selected = intentClass === intent.id;
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
                disabled={controlsDisabled}
                data-sku-market-research-intent={intent.id}
                onClick={() => {
                  setIntentClass(intent.id);
                  setState({ kind: "idle" });
                  latestRequestRef.current = null;
                }}
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

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-zinc-950 px-4 text-sm font-semibold text-white outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
          disabled={controlsDisabled}
          data-sku-market-research-submit="true"
          onClick={runResearch}
        >
          {pending ? (
            <>
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              Researching…
            </>
          ) : (
            "Run research"
          )}
        </button>
        {state.kind === "loading" || state.kind === "ready" || state.kind === "error" ? (
          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 outline-none hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2"
            data-sku-market-research-discard="true"
            onClick={discardInFlight}
          >
            <X className="size-3.5" aria-hidden="true" />
            {state.kind === "loading" ? "Cancel" : "Clear"}
          </button>
        ) : null}
        {state.kind === "error" ? (
          <button
            type="button"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-zinc-200 bg-white px-3 text-sm font-medium text-zinc-700 outline-none hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2"
            data-sku-market-research-retry="true"
            disabled={controlsDisabled}
            onClick={runResearch}
          >
            Retry
          </button>
        ) : null}
      </div>

      <div
        className="mt-3 min-h-[2.75rem]"
        aria-live="polite"
        data-sku-market-research-result="true"
      >
        {state.kind === "loading" ? (
          <p
            className="flex items-center gap-2 text-sm text-zinc-600"
            data-sku-market-research-loading="true"
          >
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            Gathering sourced signals…
          </p>
        ) : null}

        {state.kind === "error" ? (
          <div
            className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm leading-6 text-amber-950"
            data-sku-market-research-error="true"
            role="alert"
          >
            {state.message}
          </div>
        ) : null}

        {state.kind === "ready" ? (
          <ResearchResultCard result={state.result} />
        ) : null}

        {state.kind === "idle" ? (
          <p
            className="text-xs leading-5 text-zinc-500"
            data-sku-market-research-empty="true"
          >
            Choose country and depth, then run research. Nothing runs until you
            submit.
          </p>
        ) : null}
      </div>
    </section>
  );
}

function ResearchResultCard({
  result,
}: {
  result: MerchantResearchAnswerDto | MerchantResearchAbstentionDto;
}) {
  if (result.kind === "abstained") {
    const insufficient = result.code === "INSUFFICIENT_EVIDENCE";
    const conflict =
      result.conflicts.length > 0 || /conflict/i.test(result.code);
    return (
      <div
        className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3"
        data-sku-market-research-answer="true"
        data-sku-market-research-status="abstained"
        data-sku-market-research-code={result.code}
        data-sku-market-research-insufficient={insufficient ? "true" : undefined}
        data-sku-market-research-conflict={conflict ? "true" : undefined}
      >
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-amber-800">
          {insufficient
            ? "Insufficient evidence"
            : conflict
              ? "Conflicting signals"
              : "Cannot answer safely"}
        </p>
        <p
          className="mt-1 text-sm font-medium leading-6 text-amber-950"
          data-sku-market-research-merchant-message="true"
        >
          {result.merchantMessage}
        </p>
        <p
          className="mt-2 text-xs leading-5 text-amber-900"
          data-sku-market-research-synthetic-warning="true"
        >
          {result.syntheticPreviewWarning}
        </p>
        {result.limitations.length > 0 ? (
          <p
            className="mt-2 text-xs leading-5 text-amber-900"
            data-sku-market-research-limitations="true"
          >
            {result.limitations.join(" · ")}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="rounded-xl border border-zinc-200 bg-white px-3 py-3"
      data-sku-market-research-answer="true"
      data-sku-market-research-status={result.status}
      data-sku-market-research-generator={result.generator}
      data-sku-market-research-origin={result.originClass}
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-zinc-500">
          {result.status === "partial" ? "Partial signals" : "Sourced signals"}
        </p>
        <p className="text-[0.65rem] text-zinc-400">
          {result.countryCode} · {result.depth.replaceAll("_", " ")}
        </p>
      </div>

      <p
        className="mt-2 rounded-lg border border-amber-100 bg-amber-50/70 px-2.5 py-2 text-xs leading-5 text-amber-950"
        data-sku-market-research-synthetic-warning="true"
      >
        {result.syntheticPreviewWarning}
      </p>

      <div
        className="mt-3 rounded-lg bg-zinc-50 px-2.5 py-2"
        data-sku-market-research-separation="true"
      >
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-zinc-500">
          External signals — not inventory facts
        </p>
        <p className="mt-1 text-xs leading-5 text-zinc-600">
          These are sourced market signals for review. They do not change
          verified stock, cover, or velocity on this SKU.
        </p>
      </div>

      {result.summaryLines.length > 0 ? (
        <ul
          className="mt-3 space-y-1.5"
          data-sku-market-research-summary="true"
        >
          {result.summaryLines.map((line, index) => (
            <li
              key={`summary-${index}`}
              className="text-sm leading-6 text-zinc-800"
            >
              {line}
            </li>
          ))}
        </ul>
      ) : null}

      {result.findings.length > 0 ? (
        <details
          className="mt-3"
          data-sku-market-research-findings="true"
        >
          <summary className="cursor-pointer text-xs font-semibold text-zinc-700 outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2">
            Evidence details
          </summary>
          <ul className="mt-2 space-y-2 border-t border-zinc-100 pt-2">
            {result.findings.map((finding) => (
              <li
                key={finding.findingId}
                className="text-xs leading-5 text-zinc-600"
                data-sku-market-research-finding={finding.findingId}
                data-sku-market-research-match={finding.matchQuality}
                data-sku-market-research-freshness={finding.freshnessClass}
                data-sku-market-research-signal={finding.signalClass}
              >
                <span className="font-medium text-zinc-800">
                  {finding.label}:
                </span>{" "}
                {finding.value}
                {finding.unit ? ` ${finding.unit}` : ""}
                <span className="mt-0.5 block text-[0.7rem] text-zinc-400">
                  {signalClassLabel(finding.signalClass)} ·{" "}
                  {matchQualityLabel(finding.matchQuality)} · freshness{" "}
                  {finding.freshnessClass}
                  {finding.currencyCode ? ` · ${finding.currencyCode}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {result.conflicts.length > 0 ? (
        <div
          className="mt-3 rounded-lg border border-amber-100 bg-amber-50/60 px-2.5 py-2"
          data-sku-market-research-conflicts="true"
        >
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-amber-800">
            Conflicts
          </p>
          <ul className="mt-1 space-y-1">
            {result.conflicts.map((conflict) => (
              <li
                key={conflict.conflictId}
                className="text-xs leading-5 text-amber-950"
              >
                {conflict.summary}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.limitations.length > 0 ? (
        <div className="mt-3" data-sku-market-research-limitations="true">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-zinc-500">
            Limitations
          </p>
          <p className="mt-1 text-xs leading-5 text-zinc-600">
            {result.limitations.join(" · ")}
          </p>
        </div>
      ) : null}

      {result.citations.length > 0 ? (
        <details className="mt-3" data-sku-market-research-citations="true">
          <summary className="cursor-pointer text-xs font-semibold text-zinc-700 outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2">
            Citations
          </summary>
          <ul className="mt-2 space-y-1 border-t border-zinc-100 pt-2">
            {result.citations.map((citation, index) => (
              <li key={`cite-${index}`} className="text-xs leading-5">
                <a
                  href={citation.url}
                  className="break-all text-zinc-700 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2"
                  target="_blank"
                  rel="noopener noreferrer"
                  data-sku-market-research-citation="true"
                >
                  {citation.url}
                </a>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
