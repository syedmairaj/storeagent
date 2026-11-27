/**
 * AI-MKT-1b — OpenAI candidate offline adapters (synthetic only).
 * No OpenAI SDK. No live network. Design candidate ≠ live approval.
 */

import {
  buildOpenAiOfflineFixture,
} from "@/lib/market-research/adapters/fixtures";
import { runWithDeadline } from "@/lib/market-research/adapters/runtime";
import type {
  MarketResearchAdapter,
  MarketResearchAdapterInput,
  MarketResearchAdapterGenerateOptions,
  MarketResearchAdapterMode,
  OpenAiOfflineFixtureId,
} from "@/lib/market-research/adapters/types";
import {
  MARKET_ADAPTER_IDS,
  MARKET_SOURCE_IDS,
} from "@/lib/market-research/types";

export type OpenAiOfflineAdapterOptions = {
  fixtureId?: OpenAiOfflineFixtureId;
  mode?: MarketResearchAdapterMode;
};

function resolveClock(options: MarketResearchAdapterGenerateOptions): string {
  return options.nowIso ?? "2026-11-27T12:00:00.000Z";
}

export function createOpenAiOfflineStubAdapter(
  options?: OpenAiOfflineAdapterOptions,
): MarketResearchAdapter {
  const fixtureId = options?.fixtureId ?? "openai_success_citations_v1";
  const mode: MarketResearchAdapterMode = options?.mode ?? "offline_stub";

  return {
    adapterId: MARKET_ADAPTER_IDS.OPENAI_WEB_SEARCH,
    sourceId: MARKET_SOURCE_IDS.OPENAI_WEB_SEARCH,
    mode,
    supportsLiveNetwork: false,
    originClass: "synthetic_fixture",
    providerShape: "openai_responses_web_search_v1",
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

      if (fixtureId === "openai_hang_until_abort_v1") {
        return runWithDeadline({
          signal: genOptions.signal,
          timeoutMs: genOptions.timeoutMs,
          delayMs: Math.max(genOptions.timeoutMs * 4, 50),
          produce: () =>
            buildOpenAiOfflineFixture(
              "openai_success_citations_v1",
              ctx,
              mode,
            ),
        });
      }

      if (fixtureId === "openai_late_response_v1") {
        return runWithDeadline({
          signal: genOptions.signal,
          timeoutMs: genOptions.timeoutMs,
          simulateLateResponse: true,
          produce: () =>
            buildOpenAiOfflineFixture(
              "openai_success_citations_v1",
              ctx,
              mode,
            ),
        });
      }

      if (fixtureId === "openai_timeout_v1") {
        return runWithDeadline({
          signal: genOptions.signal,
          timeoutMs: genOptions.timeoutMs,
          delayMs: Math.max(genOptions.timeoutMs + 1, 1),
          produce: () =>
            buildOpenAiOfflineFixture("openai_timeout_v1", ctx, mode),
        });
      }

      return runWithDeadline({
        signal: genOptions.signal,
        timeoutMs: genOptions.timeoutMs,
        produce: () => buildOpenAiOfflineFixture(fixtureId, ctx, mode),
      });
    },
  };
}

/**
 * Deterministic recorded_replay adapter — same fixtures, mode labeled for audit.
 * Still supportsLiveNetwork=false; never live.
 */
export function createOpenAiRecordedReplayAdapter(
  options?: OpenAiOfflineAdapterOptions,
): MarketResearchAdapter {
  return createOpenAiOfflineStubAdapter({
    fixtureId: options?.fixtureId ?? "openai_success_citations_v1",
    mode: "recorded_replay",
  });
}

/** OpenAI design-candidate registration never implies live rights. */
export function openaiCandidateApprovalImpliesLiveRights(): false {
  return false;
}
