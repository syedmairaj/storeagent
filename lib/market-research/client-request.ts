/**
 * AI-MKT-1e — client request correlation helpers (stale-response isolation).
 * Pure helpers safe for browser + unit tests.
 */

import type { MerchantResearchStructuredIntent } from "@/lib/market-research/merchant-intents";

export type MarketResearchRequestKey = {
  clientRequestId: string;
  grainKey: string;
  intentClass: MerchantResearchStructuredIntent;
  countryCode: string;
  depth: string;
};

/**
 * Whether a response matches the latest in-flight research request.
 * Invalidates late answers after org/store/location/SKU/intent/country changes.
 */
export function isCurrentMarketResearchResponse(input: {
  latest: MarketResearchRequestKey | null;
  responseClientRequestId: string | undefined;
  responseIntentClass: string | undefined;
  responseCountryCode?: string | undefined;
  responseDepth?: string | undefined;
  grainKey: string;
}): boolean {
  if (!input.latest) {
    return false;
  }
  if (!input.responseClientRequestId || !input.responseIntentClass) {
    return false;
  }
  if (
    input.latest.clientRequestId !== input.responseClientRequestId ||
    input.latest.intentClass !== input.responseIntentClass ||
    input.latest.grainKey !== input.grainKey
  ) {
    return false;
  }
  if (
    input.responseCountryCode != null &&
    input.latest.countryCode !== input.responseCountryCode
  ) {
    return false;
  }
  if (
    input.responseDepth != null &&
    input.latest.depth !== input.responseDepth
  ) {
    return false;
  }
  return true;
}

export function createMarketResearchClientRequestId(
  nowMs: number = Date.now(),
  randomPart: string = Math.random().toString(36).slice(2, 10),
): string {
  return `mr:${nowMs.toString(36)}:${randomPart}`;
}
