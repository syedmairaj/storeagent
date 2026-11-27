/**
 * AI-MKT-1c — deterministic freshness with injected clock.
 * Retrieval cannot refresh old evidence. Historical ≠ current. Unknown ≠ zero.
 */

export type FreshnessPolicy = {
  /** Age beyond which observation is stale (default 7d). */
  staleAfterMs: number;
};

export const DEFAULT_FRESHNESS_POLICY: FreshnessPolicy = {
  staleAfterMs: 7 * 24 * 60 * 60 * 1000,
};

export type FreshnessEvaluation =
  | {
      ok: true;
      freshnessClass: "current" | "stale" | "unknown";
      observationKnown: boolean;
      retrievedAt: string;
      observationPeriodStart: string | null;
      observationPeriodEnd: string | null;
      /** True when evidence must not be treated as describing current conditions. */
      historicalOnly: boolean;
    }
  | {
      ok: false;
      code: "FUTURE_TIMESTAMP" | "OBSERVATION_PERIOD_INVALID" | "RETRIEVAL_REFRESH_FORBIDDEN";
      detail: string;
      freshnessClass: "unknown";
      observationKnown: boolean;
    };

function parseIso(value: string | undefined | null): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const ms = Date.parse(value.trim());
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Evaluate freshness against an injected clock (`nowIso`).
 * Retrieval wall-clock never upgrades observation freshness.
 */
export function evaluateEvidenceFreshness(input: {
  retrievedAt: string;
  observationPeriodStart?: string | null;
  observationPeriodEnd?: string | null;
  /** Injected clock — required for determinism. */
  nowIso: string;
  policy?: FreshnessPolicy;
  /**
   * When true, treat an attempt to mark stale/unknown observation as "current"
   * via retrieval time as forbidden.
   */
  claimedFreshnessFromRetrieval?: boolean;
}): FreshnessEvaluation {
  const policy = input.policy ?? DEFAULT_FRESHNESS_POLICY;
  const nowMs = parseIso(input.nowIso);
  const retrievedMs = parseIso(input.retrievedAt);

  if (nowMs === null) {
    return {
      ok: false,
      code: "OBSERVATION_PERIOD_INVALID",
      detail: "Injected nowIso is not a valid ISO timestamp",
      freshnessClass: "unknown",
      observationKnown: false,
    };
  }

  if (retrievedMs === null) {
    return {
      ok: false,
      code: "OBSERVATION_PERIOD_INVALID",
      detail: "retrievedAt is not a valid ISO timestamp",
      freshnessClass: "unknown",
      observationKnown: false,
    };
  }

  // Future retrieval relative to injected clock → reject.
  if (retrievedMs > nowMs + 1000) {
    return {
      ok: false,
      code: "FUTURE_TIMESTAMP",
      detail: "retrievedAt is in the future relative to injected clock",
      freshnessClass: "unknown",
      observationKnown: false,
    };
  }

  const startMs = parseIso(input.observationPeriodStart ?? null);
  const endMs = parseIso(input.observationPeriodEnd ?? null);

  if (
    (input.observationPeriodStart && startMs === null) ||
    (input.observationPeriodEnd && endMs === null)
  ) {
    return {
      ok: false,
      code: "OBSERVATION_PERIOD_INVALID",
      detail: "Observation period contains invalid ISO timestamps",
      freshnessClass: "unknown",
      observationKnown: false,
    };
  }

  if (startMs !== null && endMs !== null && startMs > endMs) {
    return {
      ok: false,
      code: "OBSERVATION_PERIOD_INVALID",
      detail: "observationPeriodStart is after observationPeriodEnd",
      freshnessClass: "unknown",
      observationKnown: false,
    };
  }

  // Future observation relative to clock → reject.
  const observationAnchorMs = endMs ?? startMs;
  if (observationAnchorMs !== null && observationAnchorMs > nowMs + 1000) {
    return {
      ok: false,
      code: "FUTURE_TIMESTAMP",
      detail: "Observation period is in the future relative to injected clock",
      freshnessClass: "unknown",
      observationKnown: false,
    };
  }

  if (input.claimedFreshnessFromRetrieval === true) {
    return {
      ok: false,
      code: "RETRIEVAL_REFRESH_FORBIDDEN",
      detail: "Retrieval time cannot refresh or upgrade observation freshness",
      freshnessClass: "unknown",
      observationKnown: observationAnchorMs !== null,
    };
  }

  const retrievedAt = input.retrievedAt.trim();
  const observationPeriodStart =
    typeof input.observationPeriodStart === "string" &&
    input.observationPeriodStart.trim()
      ? input.observationPeriodStart.trim()
      : null;
  const observationPeriodEnd =
    typeof input.observationPeriodEnd === "string" &&
    input.observationPeriodEnd.trim()
      ? input.observationPeriodEnd.trim()
      : null;

  if (observationAnchorMs === null) {
    // Retrieval ≠ observation. Unknown stays unknown.
    return {
      ok: true,
      freshnessClass: "unknown",
      observationKnown: false,
      retrievedAt,
      observationPeriodStart,
      observationPeriodEnd,
      historicalOnly: true,
    };
  }

  const ageMs = nowMs - observationAnchorMs;
  if (ageMs > policy.staleAfterMs) {
    return {
      ok: true,
      freshnessClass: "stale",
      observationKnown: true,
      retrievedAt,
      observationPeriodStart,
      observationPeriodEnd,
      historicalOnly: true,
    };
  }

  return {
    ok: true,
    freshnessClass: "current",
    observationKnown: true,
    retrievedAt,
    observationPeriodStart,
    observationPeriodEnd,
    historicalOnly: false,
  };
}
