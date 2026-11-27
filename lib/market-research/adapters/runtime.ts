/**
 * AI-MKT-1b — shared offline adapter runtime helpers (abort / deadline / late discard).
 */

import {
  MARKET_RESEARCH_ADAPTER_RESPONSE_VERSION,
  type MarketResearchAdapterFailure,
  type MarketResearchAdapterResult,
} from "@/lib/market-research/adapters/types";

export function sleepOrAbort(
  ms: number,
  signal: AbortSignal,
): Promise<"slept" | "aborted"> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve("aborted");
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve("slept");
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve("aborted");
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export function cancelledFailure(detail: string): MarketResearchAdapterFailure {
  return {
    ok: false,
    schemaVersion: MARKET_RESEARCH_ADAPTER_RESPONSE_VERSION,
    originClass: "synthetic_fixture",
    reason: "CANCELLED",
    detail,
    researchCode: "TIMEOUT",
    latencyMs: 0,
  };
}

export function timeoutFailure(detail: string): MarketResearchAdapterFailure {
  return {
    ok: false,
    schemaVersion: MARKET_RESEARCH_ADAPTER_RESPONSE_VERSION,
    originClass: "synthetic_fixture",
    reason: "TIMEOUT",
    detail,
    researchCode: "TIMEOUT",
    latencyMs: 0,
  };
}

export function lateDiscardFailure(
  detail: string,
): MarketResearchAdapterFailure {
  return {
    ok: false,
    schemaVersion: MARKET_RESEARCH_ADAPTER_RESPONSE_VERSION,
    originClass: "synthetic_fixture",
    reason: "LATE_RESPONSE_DISCARDED",
    detail,
    researchCode: "TIMEOUT",
    latencyMs: 0,
  };
}

/**
 * Race a producer against timeout + abort. Late producers are discarded.
 */
export async function runWithDeadline<T extends MarketResearchAdapterResult>(
  options: {
    signal: AbortSignal;
    timeoutMs: number;
    /** Artificial delay before producing (fixture control). */
    delayMs?: number;
    produce: () => T | Promise<T>;
    /**
     * When true, produce after timeoutMs + buffer to simulate late response
     * that must be discarded even if it eventually resolves.
     */
    simulateLateResponse?: boolean;
  },
): Promise<MarketResearchAdapterResult> {
  if (options.signal.aborted) {
    return cancelledFailure("Adapter aborted before start");
  }

  const timeoutMs = Math.max(0, options.timeoutMs);
  const started = Date.now();

  if (options.simulateLateResponse) {
    // Wait past deadline, then discard even if a result is available.
    const wait = await sleepOrAbort(timeoutMs + 5, options.signal);
    if (wait === "aborted") {
      return cancelledFailure("Adapter aborted during late-response simulation");
    }
    // Produce is intentionally not awaited into the accepted result path.
    void Promise.resolve().then(() => options.produce());
    return lateDiscardFailure(
      "Synthetic late provider response discarded after deadline",
    );
  }

  const delayMs = options.delayMs ?? 0;
  if (delayMs > 0) {
    const wait = await sleepOrAbort(delayMs, options.signal);
    if (wait === "aborted") {
      return cancelledFailure("Adapter aborted during fixture delay");
    }
    if (Date.now() - started >= timeoutMs) {
      return timeoutFailure("Adapter exceeded timeout during fixture delay");
    }
  }

  if (options.signal.aborted) {
    return cancelledFailure("Adapter aborted before produce");
  }

  // Remaining budget for produce.
  const remaining = timeoutMs - (Date.now() - started);
  if (remaining <= 0) {
    return timeoutFailure("Adapter deadline exhausted before produce");
  }

  let settled = false;
  const result = await new Promise<MarketResearchAdapterResult>((resolve) => {
    const onAbort = () => {
      if (!settled) {
        settled = true;
        resolve(cancelledFailure("Adapter aborted while producing"));
      }
    };
    options.signal.addEventListener("abort", onAbort, { once: true });

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        options.signal.removeEventListener("abort", onAbort);
        resolve(timeoutFailure("Adapter exceeded timeout while producing"));
      }
    }, remaining);

    void Promise.resolve()
      .then(() => options.produce())
      .then((value) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          options.signal.removeEventListener("abort", onAbort);
          resolve(value);
        }
        // else: late — discarded
      })
      .catch(() => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          options.signal.removeEventListener("abort", onAbort);
          resolve(
            timeoutFailure("Adapter produce rejected under deadline control"),
          );
        }
      });
  });

  return result;
}
