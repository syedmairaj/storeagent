/**
 * AI-MKT-1b — gated offline adapter invocation.
 *
 * Order (fail closed; denied → zero adapters executed):
 * 1) live / egress / forged adapter rejection
 * 2) adapter registry resolve
 * 3) 1a admission (enablement, tenant scope, geo/category, source rights)
 * 4) provider approval (separate from source rights)
 * 5) request.allowAdapters membership
 * 6) adapter.research under deadline
 *
 * No evidence normalization into canonical findings (AI-MKT-1c).
 * No automatic Gemini fallback.
 */

import {
  evaluateProviderApproval,
  getDefaultProviderApproval,
  type MarketResearchProviderApproval,
} from "@/lib/market-research/adapters/approval";
import { assertSyntheticOnly } from "@/lib/market-research/adapters/fixtures";
import {
  geminiAutomaticFallbackAllowed,
} from "@/lib/market-research/adapters/gemini-offline";
import {
  isOfflineAllowlistedAdapterId,
  resolveOfflineResearchAdapter,
} from "@/lib/market-research/adapters/registry";
import {
  MARKET_RESEARCH_ADAPTER_RESPONSE_VERSION,
  type MarketResearchAdapter,
  type MarketResearchAdapterFailure,
  type MarketResearchAdapterMode,
  type MarketResearchAdapterResult,
  type OpenAiOfflineFixtureId,
  type GeminiOfflineFixtureId,
} from "@/lib/market-research/adapters/types";
import {
  createGeminiOfflineStubAdapter,
  createGeminiRecordedReplayAdapter,
} from "@/lib/market-research/adapters/gemini-offline";
import {
  createOpenAiOfflineStubAdapter,
  createOpenAiRecordedReplayAdapter,
} from "@/lib/market-research/adapters/openai-offline";
import type { MerchantContext } from "@/lib/commerce-agent/types";
import {
  admitMarketResearchRequest,
  type ResearchAdmissionInput,
} from "@/lib/market-research/gate";
import type {
  ResearchOperation,
} from "@/lib/market-research/types";
import { MARKET_SOURCE_IDS } from "@/lib/market-research/types";

export const DEFAULT_ADAPTER_TIMEOUT_MS = 50;

export type InvokeMarketResearchAdapterInput = {
  merchantContext: MerchantContext;
  rawRequest: unknown;
  sourceId: string;
  operation: ResearchOperation;
  registryKey?: string;
  preferredMode?: MarketResearchAdapterMode;
  /**
   * Optional fixture override for the resolved offline adapter factory.
   * Does not bypass policy gates.
   */
  fixtureId?: OpenAiOfflineFixtureId | GeminiOfflineFixtureId;
  satisfiedConditions?: readonly string[];
  syntheticFixtureMode?: boolean;
  allowSyntheticFixtures?: boolean;
  requestLiveNetwork?: unknown;
  requestDataEgress?: unknown;
  /** Attempt automatic Gemini fallback after OpenAI failure — denied by default. */
  requestAutomaticFallback?: unknown;
  untrustedAdapter?: unknown;
  untrustedHints?: ResearchAdmissionInput["untrustedHints"];
  geoConfig?: ResearchAdmissionInput["geoConfig"];
  approval?: MarketResearchProviderApproval;
  signal?: AbortSignal;
  timeoutMs?: number;
  nowIso?: string;
};

export type InvokeMarketResearchAdapterResult = {
  result: MarketResearchAdapterResult;
  /** Always 0 when any pre-adapter gate denies. */
  adaptersInvoked: number;
  admissionDenied: boolean;
  registryKey?: string;
};

function failure(
  reason: MarketResearchAdapterFailure["reason"],
  detail: string,
  extras?: Partial<MarketResearchAdapterFailure>,
): MarketResearchAdapterFailure {
  return {
    ok: false,
    schemaVersion: MARKET_RESEARCH_ADAPTER_RESPONSE_VERSION,
    originClass: "synthetic_fixture",
    reason,
    detail,
    ...extras,
  };
}

function buildFixtureAdapter(
  sourceId: string,
  mode: MarketResearchAdapterMode,
  fixtureId?: OpenAiOfflineFixtureId | GeminiOfflineFixtureId,
): MarketResearchAdapter | null {
  if (sourceId === MARKET_SOURCE_IDS.OPENAI_WEB_SEARCH) {
    if (mode === "recorded_replay") {
      return createOpenAiRecordedReplayAdapter({
        fixtureId: fixtureId as OpenAiOfflineFixtureId | undefined,
      });
    }
    return createOpenAiOfflineStubAdapter({
      fixtureId: fixtureId as OpenAiOfflineFixtureId | undefined,
    });
  }
  if (sourceId === MARKET_SOURCE_IDS.GEMINI_SEARCH_GROUNDING) {
    if (mode === "recorded_replay") {
      return createGeminiRecordedReplayAdapter({
        fixtureId: fixtureId as GeminiOfflineFixtureId | undefined,
      });
    }
    return createGeminiOfflineStubAdapter({
      fixtureId: fixtureId as GeminiOfflineFixtureId | undefined,
    });
  }
  return null;
}

/**
 * Invoke a single offline research adapter after all gates.
 * Denied requests never call adapter.research (adaptersInvoked=0).
 */
export async function invokeMarketResearchAdapter(
  input: InvokeMarketResearchAdapterInput,
): Promise<InvokeMarketResearchAdapterResult> {
  // 1) Structural live / egress / forged adapter checks (before registry).
  if (input.requestLiveNetwork === true) {
    return {
      adaptersInvoked: 0,
      admissionDenied: true,
      result: failure(
        "LIVE_PROVIDER_FORBIDDEN",
        "Live provider execution forbidden before adapter resolve",
        { researchCode: "LIVE_EXECUTION_FORBIDDEN" },
      ),
    };
  }

  if (input.requestDataEgress === true) {
    return {
      adaptersInvoked: 0,
      admissionDenied: true,
      result: failure(
        "DATA_EGRESS_FORBIDDEN",
        "Data egress forbidden before adapter resolve",
        { researchCode: "PROVIDER_FORBIDDEN" },
      ),
    };
  }

  if (input.requestAutomaticFallback === true) {
    if (!geminiAutomaticFallbackAllowed()) {
      return {
        adaptersInvoked: 0,
        admissionDenied: true,
        result: failure(
          "AUTOMATIC_FALLBACK_FORBIDDEN",
          "Automatic Gemini fallback denied; zero adapters invoked",
          { researchCode: "PROVIDER_FORBIDDEN" },
        ),
      };
    }
  }

  // 2) Registry resolve (rejects unknown / forged / live).
  const resolved = resolveOfflineResearchAdapter({
    registryKey: input.registryKey,
    untrustedAdapter: input.untrustedAdapter,
    sourceId: input.sourceId,
    preferredMode: input.preferredMode,
  });
  if (!resolved.ok) {
    return {
      adaptersInvoked: 0,
      admissionDenied: true,
      result: failure(resolved.reason, resolved.detail, {
        researchCode:
          resolved.reason === "LIVE_PROVIDER_FORBIDDEN"
            ? "LIVE_EXECUTION_FORBIDDEN"
            : "PROVIDER_FORBIDDEN",
      }),
    };
  }

  // Optional fixture-specific adapter instance (still offline).
  const mode = input.preferredMode ?? resolved.adapter.mode;
  const adapter =
    input.fixtureId !== undefined
      ? buildFixtureAdapter(input.sourceId, mode, input.fixtureId) ??
        resolved.adapter
      : resolved.adapter;

  if (adapter.supportsLiveNetwork !== false) {
    return {
      adaptersInvoked: 0,
      admissionDenied: true,
      result: failure(
        "LIVE_PROVIDER_FORBIDDEN",
        "Resolved adapter must not support live network",
        { researchCode: "LIVE_EXECUTION_FORBIDDEN" },
      ),
    };
  }

  // 3) 1a admission gates — tenant / geo / category / source rights / enablement.
  const admission = admitMarketResearchRequest({
    merchantContext: input.merchantContext,
    rawRequest: input.rawRequest,
    sourceId: input.sourceId,
    operation: input.operation,
    satisfiedConditions: input.satisfiedConditions,
    syntheticFixtureMode: input.syntheticFixtureMode,
    allowSyntheticFixtures: input.allowSyntheticFixtures,
    requestLiveNetwork: input.requestLiveNetwork,
    untrustedHints: input.untrustedHints,
    geoConfig: input.geoConfig,
  });

  if (!admission.ok) {
    return {
      adaptersInvoked: 0,
      admissionDenied: true,
      registryKey: resolved.registryKey,
      result: failure(
        mapAdmissionReason(admission.code),
        admission.detail,
        {
          researchCode: admission.code,
          sourceId: input.sourceId,
          adapterId: adapter.adapterId,
        },
      ),
    };
  }

  // 4) Provider approval — separate from source rights.
  const approval = evaluateProviderApproval({
    sourceId: input.sourceId,
    adapterId: adapter.adapterId,
    requestLiveNetwork: input.requestLiveNetwork,
    requestDataEgress: input.requestDataEgress,
    requestAutomaticFallback: input.requestAutomaticFallback,
    approval: input.approval ?? getDefaultProviderApproval(),
  });
  if (!approval.ok) {
    return {
      adaptersInvoked: 0,
      admissionDenied: true,
      registryKey: resolved.registryKey,
      result: failure(approval.reason, approval.detail, {
        researchCode: "PROVIDER_FORBIDDEN",
        sourceId: input.sourceId,
        adapterId: adapter.adapterId,
      }),
    };
  }

  // 5) Request allowAdapters membership.
  if (!admission.request.allowAdapters.includes(adapter.adapterId)) {
    return {
      adaptersInvoked: 0,
      admissionDenied: true,
      registryKey: resolved.registryKey,
      result: failure(
        "ADAPTER_NOT_ALLOWLISTED",
        `Adapter '${adapter.adapterId}' not in request.allowAdapters`,
        {
          researchCode: "PROVIDER_FORBIDDEN",
          sourceId: input.sourceId,
          adapterId: adapter.adapterId,
        },
      ),
    };
  }

  if (!isOfflineAllowlistedAdapterId(adapter.adapterId)) {
    return {
      adaptersInvoked: 0,
      admissionDenied: true,
      registryKey: resolved.registryKey,
      result: failure(
        "ADAPTER_UNKNOWN",
        `Adapter '${adapter.adapterId}' is not an offline allowlisted adapter`,
        { researchCode: "PROVIDER_FORBIDDEN" },
      ),
    };
  }

  // 6) Invoke exactly one offline adapter under deadline.
  const signal = input.signal ?? new AbortController().signal;
  const timeoutMs = input.timeoutMs ?? DEFAULT_ADAPTER_TIMEOUT_MS;

  const result = await adapter.research(
    {
      clientRequestId: admission.request.clientRequestId,
      organizationId: admission.scope.organizationId,
      countryCode: admission.request.countryCode,
      question: admission.request.question,
      sourcePolicyVersion: admission.request.sourcePolicyVersion,
      sku: admission.request.sku,
      categoryHint: admission.request.categoryHint,
      depth: admission.request.depth,
    },
    {
      signal,
      timeoutMs,
      nowIso: input.nowIso ?? admission.scope.asOf,
    },
  );

  if (result.ok && !assertSyntheticOnly(result)) {
    return {
      adaptersInvoked: 1,
      admissionDenied: false,
      registryKey: resolved.registryKey,
      result: failure(
        "MALFORMED_PROVIDER_RESPONSE",
        "Adapter result claimed non-synthetic merchant/market facts",
        {
          researchCode: "MALFORMED_REQUEST",
          sourceId: input.sourceId,
          adapterId: adapter.adapterId,
        },
      ),
    };
  }

  return {
    adaptersInvoked: 1,
    admissionDenied: false,
    registryKey: resolved.registryKey,
    result,
  };
}

function mapAdmissionReason(
  code: string,
): MarketResearchAdapterFailure["reason"] {
  switch (code) {
    case "LIVE_EXECUTION_FORBIDDEN":
      return "LIVE_PROVIDER_FORBIDDEN";
    case "RESEARCH_DISABLED":
      return "RESEARCH_DISABLED";
    case "TENANT_SCOPE_MISMATCH":
      return "TENANT_SCOPE_MISMATCH";
    case "UNSUPPORTED_GEO":
      return "UNSUPPORTED_GEO";
    case "UNSUPPORTED_CATEGORY":
      return "UNSUPPORTED_CATEGORY";
    case "LICENSE_DENIED":
      return "LICENSE_DENIED";
    case "RIGHTS_CONDITIONS_UNSATISFIED":
      return "RIGHTS_CONDITIONS_UNSATISFIED";
    case "CACHE_FORBIDDEN":
      return "CACHE_FORBIDDEN";
    case "ATTRIBUTION_REQUIRED":
      return "ATTRIBUTION_REQUIRED";
    case "FORGED_POLICY_INPUT":
      return "FORGED_POLICY_INPUT";
    case "MALFORMED_REQUEST":
      return "MALFORMED_REQUEST";
    case "PROVIDER_FORBIDDEN":
      return "PROVIDER_FORBIDDEN";
    default:
      return "POLICY_DENIED";
  }
}
