import "server-only";

import {
  createHash,
  timingSafeEqual,
} from "node:crypto";

import {
  type MetricRecomputeWorkerConfig,
} from "@/lib/persistence/metric-recompute-queue";

import {
  type MetricRolloverWorkerConfig,
} from "@/lib/persistence/metric-rollover";

/**
 * M5-HR3.1 — shared Vercel Cron GET authentication.
 *
 * Authenticates only CRON_SECRET (never METRIC_*_WORKER_SECRET).
 * StoreAgent requires ≥32 characters (stricter than Vercel’s ≥16 guidance).
 * Missing/empty/short secrets fail closed — never compare to
 * `Bearer undefined`. Timing-safe via SHA-256 digests.
 *
 * Decision table: docs/M5_HR3_VERCEL_PRODUCTION_RUNTIME_CONTRACT.md §2.4.
 * Cron auth runs before ENABLE/org checks. Zero queue RPCs unless ok.
 */

export const CRON_SECRET_MIN_LENGTH = 32;

export type MetricCronGateFailure = {
  ok: false;
  status: 401 | 404 | 503;
  error: string;
};

export type MetricRecomputeCronGateResult =
  | {
      ok: true;
      organizationId: string;
      maxActive: number;
      claimLimit: number;
    }
  | MetricCronGateFailure;

export type MetricRolloverCronGateResult =
  | {
      ok: true;
      organizationId: string;
    }
  | MetricCronGateFailure;

/**
 * Parse CRON_SECRET from env. Absent, empty, or shorter than 32 → null.
 * Does not throw; callers map null to 401 before any work.
 */
export function readCronSecret(
  env: Readonly<Record<string, string | undefined>>,
): string | null {
  const raw =
    env.CRON_SECRET ?? "";

  if (raw.length < CRON_SECRET_MIN_LENGTH) {
    return null;
  }

  return raw;
}

function sha256(
  value: string,
): Buffer {
  return createHash("sha256")
    .update(value, "utf8")
    .digest();
}

/**
 * Upper bound on Authorization header size before hashing. Oversized
 * values fail closed (false) without throwing or logging the value.
 * Digests remain fixed-width for timingSafeEqual.
 */
export const CRON_AUTHORIZATION_MAX_LENGTH = 4096;

/**
 * Constant-time bearer check against a validated CRON_SECRET (≥32).
 * Hashes both sides first so length differences do not short-circuit.
 * Malformed (non-Bearer) and oversized headers return false — never throw.
 */
export function isAuthorizedCronRequest(
  authorization: string | null,
  cronSecret: string,
): boolean {
  if (
    authorization === null ||
    cronSecret.length < CRON_SECRET_MIN_LENGTH
  ) {
    return false;
  }

  if (authorization.length > CRON_AUTHORIZATION_MAX_LENGTH) {
    return false;
  }

  const prefix = "Bearer ";
  const presented =
    authorization.startsWith(prefix)
      ? authorization.slice(prefix.length)
      : "";

  return timingSafeEqual(
    sha256(presented),
    sha256(cronSecret),
  );
}

/**
 * Ordered cron GET gate for metric recompute
 * (docs/M5_HR3_VERCEL_PRODUCTION_RUNTIME_CONTRACT.md §2.4).
 *
 * Does not use METRIC_RECOMPUTE_WORKER_SECRET. Ignores config.secret.
 * Callers must not perform queue RPCs unless ok === true.
 */
export function evaluateMetricRecomputeCronGate(
  cronSecret: string | null,
  config: MetricRecomputeWorkerConfig,
  authorization: string | null,
): MetricRecomputeCronGateResult {
  if (cronSecret === null) {
    return {
      ok: false,
      status: 401,
      error: "cron_not_configured",
    };
  }

  if (
    !isAuthorizedCronRequest(
      authorization,
      cronSecret,
    )
  ) {
    return {
      ok: false,
      status: 401,
      error: "unauthorized",
    };
  }

  if (!config.enabled) {
    return {
      ok: false,
      status: 404,
      error: "not_found",
    };
  }

  if (config.organizationId === null) {
    return {
      ok: false,
      status: 503,
      error: "organization_scope_required",
    };
  }

  return {
    ok: true,
    organizationId: config.organizationId,
    maxActive: config.maxActive,
    claimLimit: config.claimLimit,
  };
}

/**
 * Ordered cron GET gate for metric rollover
 * (docs/M5_HR3_VERCEL_PRODUCTION_RUNTIME_CONTRACT.md §2.4).
 *
 * Does not use METRIC_ROLLOVER_WORKER_SECRET. Ignores config.secret.
 * Does not read METRIC_RECOMPUTE_ORGANIZATION_ID.
 * Callers must not perform enqueue RPCs unless ok === true.
 */
export function evaluateMetricRolloverCronGate(
  cronSecret: string | null,
  config: MetricRolloverWorkerConfig,
  authorization: string | null,
): MetricRolloverCronGateResult {
  if (cronSecret === null) {
    return {
      ok: false,
      status: 401,
      error: "cron_not_configured",
    };
  }

  if (
    !isAuthorizedCronRequest(
      authorization,
      cronSecret,
    )
  ) {
    return {
      ok: false,
      status: 401,
      error: "unauthorized",
    };
  }

  if (!config.enabled) {
    return {
      ok: false,
      status: 404,
      error: "not_found",
    };
  }

  if (config.organizationId === null) {
    return {
      ok: false,
      status: 503,
      error: "organization_scope_required",
    };
  }

  return {
    ok: true,
    organizationId: config.organizationId,
  };
}
