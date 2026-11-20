/**
 * AI-INV-1 — process-local cost budget + evidence-hash answer cache.
 * Not a durable ledger; safe for offline acceptance and soft rate limits.
 */

import type {
  InventoryExplainerAnswer,
  InventoryExplainerQuestionId,
} from "@/lib/inventory-explainer/types";

type BudgetBucket = {
  dayKey: string;
  tokensUsed: number;
  requestCount: number;
};

type CacheEntry = {
  answer: InventoryExplainerAnswer;
  storedAtMs: number;
};

const budgetByOrg = new Map<string, BudgetBucket>();
const answerCache = new Map<string, CacheEntry>();

const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX_ENTRIES = 256;
const MAX_REQUESTS_PER_ORG_PER_DAY = 200;

function utcDayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function cacheKey(
  organizationId: string,
  grainKey: string,
  questionId: InventoryExplainerQuestionId,
  evidenceHash: string,
): string {
  return `${organizationId}|${grainKey}|${questionId}|${evidenceHash}`;
}

function pruneCache(nowMs: number): void {
  for (const [key, entry] of answerCache) {
    if (nowMs - entry.storedAtMs > CACHE_TTL_MS) {
      answerCache.delete(key);
    }
  }
  while (answerCache.size > CACHE_MAX_ENTRIES) {
    const first = answerCache.keys().next().value;
    if (first === undefined) {
      break;
    }
    answerCache.delete(first);
  }
}

export function resetInventoryExplainerBudgetForTests(): void {
  budgetByOrg.clear();
  answerCache.clear();
}

export function getCachedInventoryExplainerAnswer(input: {
  organizationId: string;
  grainKey: string;
  questionId: InventoryExplainerQuestionId;
  evidenceHash: string;
  nowMs?: number;
}): InventoryExplainerAnswer | null {
  const nowMs = input.nowMs ?? Date.now();
  pruneCache(nowMs);
  const key = cacheKey(
    input.organizationId,
    input.grainKey,
    input.questionId,
    input.evidenceHash,
  );
  const hit = answerCache.get(key);
  if (!hit) {
    return null;
  }
  if (nowMs - hit.storedAtMs > CACHE_TTL_MS) {
    answerCache.delete(key);
    return null;
  }
  return {
    ...hit.answer,
    diagnostics: {
      ...hit.answer.diagnostics,
      cacheHit: true,
    },
  };
}

export function putCachedInventoryExplainerAnswer(input: {
  organizationId: string;
  grainKey: string;
  questionId: InventoryExplainerQuestionId;
  evidenceHash: string;
  answer: InventoryExplainerAnswer;
  nowMs?: number;
}): void {
  const nowMs = input.nowMs ?? Date.now();
  pruneCache(nowMs);
  const key = cacheKey(
    input.organizationId,
    input.grainKey,
    input.questionId,
    input.evidenceHash,
  );
  answerCache.set(key, {
    answer: input.answer,
    storedAtMs: nowMs,
  });
}

export type BudgetCheckResult =
  | { ok: true; tokensUsed: number; requestCount: number }
  | {
      ok: false;
      reason: "COST_CAP_EXCEEDED" | "RATE_LIMITED";
      tokensUsed: number;
      requestCount: number;
    };

export function checkAndConsumeInventoryExplainerBudget(input: {
  organizationId: string;
  tokenEstimate: number;
  dailyTokenBudget: number;
  now?: Date;
}): BudgetCheckResult {
  const dayKey = utcDayKey(input.now);
  const orgId = input.organizationId.trim();
  let bucket = budgetByOrg.get(orgId);

  if (!bucket || bucket.dayKey !== dayKey) {
    bucket = { dayKey, tokensUsed: 0, requestCount: 0 };
    budgetByOrg.set(orgId, bucket);
  }

  if (bucket.requestCount >= MAX_REQUESTS_PER_ORG_PER_DAY) {
    return {
      ok: false,
      reason: "RATE_LIMITED",
      tokensUsed: bucket.tokensUsed,
      requestCount: bucket.requestCount,
    };
  }

  const nextTokens = bucket.tokensUsed + Math.max(0, input.tokenEstimate);
  if (nextTokens > input.dailyTokenBudget) {
    return {
      ok: false,
      reason: "COST_CAP_EXCEEDED",
      tokensUsed: bucket.tokensUsed,
      requestCount: bucket.requestCount,
    };
  }

  bucket.tokensUsed = nextTokens;
  bucket.requestCount += 1;
  return {
    ok: true,
    tokensUsed: bucket.tokensUsed,
    requestCount: bucket.requestCount,
  };
}

export function estimateTokensFromText(text: string): number {
  return Math.ceil(text.length / 4);
}
