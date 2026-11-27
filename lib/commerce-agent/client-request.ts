/**
 * AI-ARCH-1e — client request correlation helpers (stale-response isolation).
 * Pure helpers safe for browser + unit tests.
 */

import type { CommerceAgentStructuredIntent } from "@/lib/commerce-agent/intents";

export type CommerceAgentRequestKey = {
  clientRequestId: string;
  grainKey: string;
  intentClass: CommerceAgentStructuredIntent;
};

/**
 * Whether a response matches the latest in-flight investigation request.
 * Prevents older answers from painting after SKU / intent changes.
 */
export function isCurrentCommerceAgentResponse(input: {
  latest: CommerceAgentRequestKey | null;
  responseClientRequestId: string | undefined;
  responseIntentClass: string | undefined;
  grainKey: string;
}): boolean {
  if (!input.latest) {
    return false;
  }
  if (!input.responseClientRequestId || !input.responseIntentClass) {
    return false;
  }
  return (
    input.latest.clientRequestId === input.responseClientRequestId &&
    input.latest.intentClass === input.responseIntentClass &&
    input.latest.grainKey === input.grainKey
  );
}

export function createCommerceAgentClientRequestId(
  nowMs: number = Date.now(),
  randomPart: string = Math.random().toString(36).slice(2, 10),
): string {
  return `ca:${nowMs.toString(36)}:${randomPart}`;
}
