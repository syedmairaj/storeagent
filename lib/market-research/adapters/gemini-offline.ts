/**
 * AI-MKT-1b — Gemini display-only offline adapters (synthetic only).
 * No Gemini SDK. No warehouse normalize/cache/analyze/model_process.
 * No automatic fallback. Live path forbidden.
 */

import { buildGeminiOfflineFixture } from "@/lib/market-research/adapters/fixtures";
import { runWithDeadline } from "@/lib/market-research/adapters/runtime";
import type {
  GeminiOfflineFixtureId,
  MarketResearchAdapter,
  MarketResearchAdapterGenerateOptions,
  MarketResearchAdapterInput,
  MarketResearchAdapterMode,
} from "@/lib/market-research/adapters/types";
import {
  MARKET_ADAPTER_IDS,
  MARKET_SOURCE_IDS,
} from "@/lib/market-research/types";
import { mayUseGeminiAsAutomaticFallback } from "@/lib/market-research/rights";

export type GeminiOfflineAdapterOptions = {
  fixtureId?: GeminiOfflineFixtureId;
  mode?: MarketResearchAdapterMode;
};

function resolveClock(options: MarketResearchAdapterGenerateOptions): string {
  return options.nowIso ?? "2026-11-27T12:00:00.000Z";
}

export function createGeminiOfflineStubAdapter(
  options?: GeminiOfflineAdapterOptions,
): MarketResearchAdapter {
  const fixtureId = options?.fixtureId ?? "gemini_display_only_success_v1";
  const mode: MarketResearchAdapterMode = options?.mode ?? "offline_stub";

  return {
    adapterId: MARKET_ADAPTER_IDS.GEMINI_SEARCH_GROUNDING,
    sourceId: MARKET_SOURCE_IDS.GEMINI_SEARCH_GROUNDING,
    mode,
    supportsLiveNetwork: false,
    originClass: "synthetic_fixture",
    providerShape: "gemini_search_grounding_v1",
    async research(
      input: MarketResearchAdapterInput,
      genOptions: MarketResearchAdapterGenerateOptions,
    ) {
      const ctx = {
        clientRequestId: input.clientRequestId,
        organizationId: input.organizationId,
        countryCode: input.countryCode,
        retrievedAt: resolveClock(genOptions),
      };

      if (fixtureId === "gemini_hang_until_abort_v1") {
        return runWithDeadline({
          signal: genOptions.signal,
          timeoutMs: genOptions.timeoutMs,
          delayMs: Math.max(genOptions.timeoutMs * 4, 50),
          produce: () =>
            buildGeminiOfflineFixture(
              "gemini_display_only_success_v1",
              ctx,
              mode,
            ),
        });
      }

      if (fixtureId === "gemini_timeout_v1") {
        return runWithDeadline({
          signal: genOptions.signal,
          timeoutMs: genOptions.timeoutMs,
          delayMs: Math.max(genOptions.timeoutMs + 1, 1),
          produce: () =>
            buildGeminiOfflineFixture("gemini_timeout_v1", ctx, mode),
        });
      }

      return runWithDeadline({
        signal: genOptions.signal,
        timeoutMs: genOptions.timeoutMs,
        produce: () => buildGeminiOfflineFixture(fixtureId, ctx, mode),
      });
    },
  };
}

export function createGeminiRecordedReplayAdapter(
  options?: GeminiOfflineAdapterOptions,
): MarketResearchAdapter {
  return createGeminiOfflineStubAdapter({
    fixtureId: options?.fixtureId ?? "gemini_display_only_success_v1",
    mode: "recorded_replay",
  });
}

/**
 * Gemini must never be selected as an automatic fallback in 1b
 * unless a separate explicit approval condition is server-satisfied
 * (default: false).
 */
export function geminiAutomaticFallbackAllowed(input?: {
  satisfiedConditions?: readonly string[];
}): false | true {
  return mayUseGeminiAsAutomaticFallback(input) === true;
}
