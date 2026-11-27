/**
 * AI-MKT-1b — immutable offline adapter registry.
 * Only offline_stub / recorded_replay. Reject unknown, forged, or live adapters.
 */

import {
  createGeminiOfflineStubAdapter,
  createGeminiRecordedReplayAdapter,
} from "@/lib/market-research/adapters/gemini-offline";
import {
  createOpenAiOfflineStubAdapter,
  createOpenAiRecordedReplayAdapter,
} from "@/lib/market-research/adapters/openai-offline";
import type {
  MarketResearchAdapter,
  MarketResearchAdapterFailureReason,
  MarketResearchAdapterMode,
} from "@/lib/market-research/adapters/types";
import {
  MARKET_ADAPTER_IDS,
  MARKET_SOURCE_IDS,
} from "@/lib/market-research/types";

export type MarketResearchAdapterRegistryKey =
  | "openai_offline_stub"
  | "openai_recorded_replay"
  | "gemini_offline_stub"
  | "gemini_recorded_replay";

const REGISTRY: ReadonlyMap<string, () => MarketResearchAdapter> = new Map([
  [
    "openai_offline_stub",
    () => createOpenAiOfflineStubAdapter({ mode: "offline_stub" }),
  ],
  [
    "openai_recorded_replay",
    () => createOpenAiRecordedReplayAdapter(),
  ],
  [
    "gemini_offline_stub",
    () => createGeminiOfflineStubAdapter({ mode: "offline_stub" }),
  ],
  [
    "gemini_recorded_replay",
    () => createGeminiRecordedReplayAdapter(),
  ],
]);

const ALLOWED_MODES: ReadonlySet<MarketResearchAdapterMode> = new Set([
  "offline_stub",
  "recorded_replay",
]);

export function listOfflineAdapterRegistryKeys(): readonly MarketResearchAdapterRegistryKey[] {
  return [
    "openai_offline_stub",
    "openai_recorded_replay",
    "gemini_offline_stub",
    "gemini_recorded_replay",
  ];
}

export function getOfflineAdapterFromRegistry(
  key: string,
): MarketResearchAdapter | null {
  const factory = REGISTRY.get(key.trim());
  if (!factory) {
    return null;
  }
  const adapter = factory();
  if (adapter.supportsLiveNetwork !== false) {
    return null;
  }
  if (!ALLOWED_MODES.has(adapter.mode)) {
    return null;
  }
  return adapter;
}

export type ResolveAdapterResult =
  | { ok: true; adapter: MarketResearchAdapter; registryKey: string }
  | {
      ok: false;
      reason: MarketResearchAdapterFailureReason;
      detail: string;
    };

/**
 * Resolve an adapter for invocation. Rejects:
 * - unknown registry keys
 * - live / forged adapter objects supplied by callers
 * - mode/id mismatches
 */
export function resolveOfflineResearchAdapter(input: {
  registryKey?: string;
  /**
   * Untrusted caller-supplied adapter — never trusted as authority.
   * Presence of supportsLiveNetwork=true or live mode → forged/live reject.
   */
  untrustedAdapter?: unknown;
  sourceId?: string;
  preferredMode?: MarketResearchAdapterMode;
}): ResolveAdapterResult {
  if (input.untrustedAdapter !== undefined && input.untrustedAdapter !== null) {
    return rejectUntrustedAdapter(input.untrustedAdapter);
  }

  let key = input.registryKey?.trim() ?? "";

  if (!key && input.sourceId && input.preferredMode) {
    key = defaultKeyForSource(input.sourceId, input.preferredMode) ?? "";
  }

  if (!key) {
    return {
      ok: false,
      reason: "ADAPTER_UNKNOWN",
      detail: "No offline adapter registry key provided",
    };
  }

  const adapter = getOfflineAdapterFromRegistry(key);
  if (!adapter) {
    return {
      ok: false,
      reason: "ADAPTER_UNKNOWN",
      detail: `Unknown or non-offline adapter registry key '${key}'`,
    };
  }

  if (adapter.supportsLiveNetwork !== false) {
    return {
      ok: false,
      reason: "LIVE_PROVIDER_FORBIDDEN",
      detail: "Adapter supportsLiveNetwork must be false",
    };
  }

  if (adapter.originClass !== "synthetic_fixture") {
    return {
      ok: false,
      reason: "ADAPTER_FORGED",
      detail: "Adapter originClass must be synthetic_fixture",
    };
  }

  if (
    input.sourceId &&
    input.sourceId.trim() !== adapter.sourceId
  ) {
    return {
      ok: false,
      reason: "ADAPTER_FORGED",
      detail: "Requested sourceId does not match resolved adapter sourceId",
    };
  }

  if (input.preferredMode && input.preferredMode !== adapter.mode) {
    return {
      ok: false,
      reason: "ADAPTER_FORGED",
      detail: "Requested mode does not match resolved adapter mode",
    };
  }

  return { ok: true, adapter, registryKey: key };
}

function defaultKeyForSource(
  sourceId: string,
  mode: MarketResearchAdapterMode,
): MarketResearchAdapterRegistryKey | null {
  if (sourceId === MARKET_SOURCE_IDS.OPENAI_WEB_SEARCH) {
    return mode === "recorded_replay"
      ? "openai_recorded_replay"
      : "openai_offline_stub";
  }
  if (sourceId === MARKET_SOURCE_IDS.GEMINI_SEARCH_GROUNDING) {
    return mode === "recorded_replay"
      ? "gemini_recorded_replay"
      : "gemini_offline_stub";
  }
  return null;
}

function rejectUntrustedAdapter(value: unknown): ResolveAdapterResult {
  if (typeof value !== "object" || value === null) {
    return {
      ok: false,
      reason: "ADAPTER_FORGED",
      detail: "Untrusted adapter must not be supplied by callers",
    };
  }

  const record = value as Record<string, unknown>;
  if (
    record.supportsLiveNetwork === true ||
    record.adapterId === "live_provider" ||
    record.mode === "live_provider" ||
    record.originClass === "live_provider"
  ) {
    return {
      ok: false,
      reason: "LIVE_PROVIDER_FORBIDDEN",
      detail: "Live or forged adapter rejected at runtime",
    };
  }

  return {
    ok: false,
    reason: "ADAPTER_FORGED",
    detail:
      "Caller-supplied adapter objects are never trusted; use registry keys only",
  };
}

/** Known offline adapter IDs that may appear in ResearchRequest.allowAdapters. */
export function isOfflineAllowlistedAdapterId(adapterId: string): boolean {
  const id = adapterId.trim();
  return (
    id === MARKET_ADAPTER_IDS.OPENAI_WEB_SEARCH ||
    id === MARKET_ADAPTER_IDS.GEMINI_SEARCH_GROUNDING ||
    id === MARKET_ADAPTER_IDS.MERCHANT_INTERNAL
  );
}
