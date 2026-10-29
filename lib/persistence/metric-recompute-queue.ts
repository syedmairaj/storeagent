import "server-only";

import {
  createHash,
  timingSafeEqual,
} from "node:crypto";

import {
  z,
} from "zod";

import {
  recomputeSkuDailyMetric,
} from "@/lib/persistence/recompute-sku-daily-metric";

import {
  classifyMetricRecomputeFailure,
  type CapturedRpcError,
  type MetricRecomputeFailure,
} from "@/workers/metric-recompute-failure";

/**
 * M5.6C service-role orchestration for sku_daily_metric_recompute_requests.
 *
 * RLS_IS_BYPASSED = true. Every call here runs as service_role. Tenant
 * scope is never taken from a caller: request rows carry it, and each
 * transition matches the full stored primary key.
 *
 * Request state changes only through the M5.6C security definer RPCs.
 * service_role has SELECT only on the request table.
 */
export const RLS_IS_BYPASSED = true;

export interface MetricRecomputeGrain {
  organizationId: string;
  storeId: string;
  locationId: string;
  variantId: string;
  metricDate: string;
  algorithmVersion: string;
}

export interface ClaimedMetricRecompute
  extends MetricRecomputeGrain {
  ownerId: string;
  claimToken: string;
  claimedGeneration: number;
  attemptCount: number;
  leaseExpiresAt: string;
}

export interface StartedMetricRecompute {
  attemptCount: number;
  claimedGeneration: number;
  leaseExpiresAt: string;
}

export type MetricRecomputeCompletion =
  | "succeeded"
  | "superseded"
  | "deferred"
  | "fenced";

export type MetricRecomputeFailureOutcome =
  | "retry_scheduled"
  | "failed"
  | "superseded"
  | "fenced";

export interface MetricRecomputeRecovery {
  requeued: number;
  retryScheduled: number;
  failed: number;
}

export interface MetricRecomputeRetrySettings {
  maxAttempts: number;
  baseDelaySeconds: number;
  maxDelaySeconds: number;
}

export type MetricRecomputeQueueStats =
  Record<string, number>;

export interface MetricRecomputeQueue {
  consume(limit: number): Promise<number>;
  recover(
    retry: MetricRecomputeRetrySettings,
    organizationId?: string | null,
  ): Promise<MetricRecomputeRecovery>;
  claim(input: {
    ownerId: string;
    limit: number;
    leaseSeconds: number;
    maxActive: number;
    /**
     * Optional organization scope (M5.6E.3). Null/omitted keeps the
     * historical global claim path used by production workers.
     */
    organizationId?: string | null;
  }): Promise<ClaimedMetricRecompute[]>;
  start(
    claim: ClaimedMetricRecompute,
    leaseSeconds: number,
  ): Promise<StartedMetricRecompute | null>;
  complete(
    claim: ClaimedMetricRecompute,
  ): Promise<MetricRecomputeCompletion>;
  fail(
    claim: ClaimedMetricRecompute,
    failure: MetricRecomputeFailure,
    retryDelaySeconds: number,
    maxAttempts: number,
  ): Promise<MetricRecomputeFailureOutcome>;
  stats(): Promise<MetricRecomputeQueueStats>;
}

export type MetricRecomputeItemResult =
  | { ok: true }
  | { ok: false; failure: MetricRecomputeFailure };

export type MetricRecomputeExecutor = (
  grain: MetricRecomputeGrain,
  deadlineMs: number,
) => Promise<MetricRecomputeItemResult>;

interface RpcResponse {
  data: unknown;
  error: {
    code?: string;
    message: string;
  } | null;
  status?: number;
}

interface AbortableRpcCall
  extends PromiseLike<RpcResponse> {
  abortSignal?: (signal: AbortSignal) => PromiseLike<RpcResponse>;
}

/**
 * The narrow client shape this module needs. A supabase-js admin client
 * satisfies it; tests may supply their own.
 */
export interface MetricRecomputeRpcClient {
  rpc(
    fn: string,
    args?: Record<string, unknown>,
  ): AbortableRpcCall;
}

const uuid =
  z.string().regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  );

const isoDate =
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const generation =
  z.coerce.number().int().nonnegative().refine(
    Number.isSafeInteger,
  );

const claimRowSchema =
  z.object({
    organization_id: uuid,
    store_id: uuid,
    location_id: uuid,
    variant_id: uuid,
    metric_date: isoDate,
    algorithm_version: z.literal("m5-derived-metrics-v1"),
    claimed_generation: generation,
    attempt_count: z.number().int().nonnegative(),
    lease_claim_token: z.string().min(1),
    lease_expires_at: z.string().min(1),
  });

const startRowSchema =
  z.object({
    attempt_count: z.number().int().positive(),
    claimed_generation: generation,
    lease_expires_at: z.string().min(1),
  });

const recoveryRowSchema =
  z.object({
    requeued: z.number().int().nonnegative(),
    retry_scheduled: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  });

const completionSchema =
  z.enum([
    "succeeded",
    "superseded",
    "deferred",
    "fenced",
  ]);

const failureOutcomeSchema =
  z.enum([
    "retry_scheduled",
    "failed",
    "superseded",
    "fenced",
  ]);

const statsSchema =
  z.record(
    z.string(),
    z.coerce.number().nonnegative(),
  );

/**
 * Queue RPC failures surface as a fixed message. The SQLSTATE is kept
 * for diagnostics; the raw database message is not.
 */
export class MetricRecomputeQueueError extends Error {
  readonly operation: string;
  readonly sqlState: string | null;

  constructor(
    operation: string,
    sqlState: string | null,
  ) {
    super(`metric recompute queue ${operation} failed`);
    this.name = "MetricRecomputeQueueError";
    this.operation = operation;
    this.sqlState = sqlState;
  }
}

async function callRpc(
  client: MetricRecomputeRpcClient,
  operation: string,
  fn: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const result =
    await client.rpc(
      fn,
      args,
    );

  if (result.error !== null) {
    throw new MetricRecomputeQueueError(
      operation,
      result.error.code ?? null,
    );
  }

  return result.data;
}

function grainArgs(
  claim: ClaimedMetricRecompute,
): Record<string, unknown> {
  return {
    p_organization_id: claim.organizationId,
    p_store_id: claim.storeId,
    p_location_id: claim.locationId,
    p_variant_id: claim.variantId,
    p_metric_date: claim.metricDate,
    p_algorithm_version: claim.algorithmVersion,
    p_owner_id: claim.ownerId,
    p_claim_token: claim.claimToken,
  };
}

function rows(
  data: unknown,
): unknown[] {
  if (data === null) {
    return [];
  }

  return Array.isArray(data)
    ? data
    : [data];
}

export function createMetricRecomputeQueue(
  client: MetricRecomputeRpcClient,
): MetricRecomputeQueue {
  return {
    async consume(limit) {
      const data =
        await callRpc(
          client,
          "consume",
          "consume_sku_daily_metric_source_events",
          {
            p_limit: limit,
            p_organization_id: null,
          },
        );

      return z.number().int().nonnegative().parse(data);
    },

    async recover(retry, organizationId = null) {
      const scopedOrganizationId =
        organizationId === undefined || organizationId === null
          ? null
          : uuid.parse(organizationId);

      const data =
        await callRpc(
          client,
          "recover",
          "recover_expired_sku_daily_metric_recompute_leases",
          {
            p_max_attempts: retry.maxAttempts,
            p_base_delay_seconds: retry.baseDelaySeconds,
            p_max_delay_seconds: retry.maxDelaySeconds,
            p_organization_id: scopedOrganizationId,
          },
        );
      const [row] =
        rows(data);
      const parsed =
        recoveryRowSchema.parse(row);

      return {
        requeued: parsed.requeued,
        retryScheduled: parsed.retry_scheduled,
        failed: parsed.failed,
      };
    },

    async claim(input) {
      const scopedOrganizationId =
        input.organizationId === undefined || input.organizationId === null
          ? null
          : uuid.parse(input.organizationId);

      const data =
        await callRpc(
          client,
          "claim",
          "claim_sku_daily_metric_recompute_requests",
          {
            p_owner_id: input.ownerId,
            p_limit: input.limit,
            p_lease_seconds: input.leaseSeconds,
            p_max_active: input.maxActive,
            p_organization_id: scopedOrganizationId,
          },
        );

      return rows(data).map((row) => {
        const parsed =
          claimRowSchema.parse(row);

        return {
          organizationId: parsed.organization_id,
          storeId: parsed.store_id,
          locationId: parsed.location_id,
          variantId: parsed.variant_id,
          metricDate: parsed.metric_date,
          algorithmVersion: parsed.algorithm_version,
          ownerId: input.ownerId,
          claimToken: parsed.lease_claim_token,
          claimedGeneration: parsed.claimed_generation,
          attemptCount: parsed.attempt_count,
          leaseExpiresAt: parsed.lease_expires_at,
        };
      });
    },

    async start(claim, leaseSeconds) {
      const data =
        await callRpc(
          client,
          "start",
          "start_sku_daily_metric_recompute",
          {
            ...grainArgs(claim),
            p_lease_seconds: leaseSeconds,
          },
        );
      const [row] =
        rows(data);

      if (row === undefined) {
        return null;
      }

      const parsed =
        startRowSchema.parse(row);

      return {
        attemptCount: parsed.attempt_count,
        claimedGeneration: parsed.claimed_generation,
        leaseExpiresAt: parsed.lease_expires_at,
      };
    },

    async complete(claim) {
      const data =
        await callRpc(
          client,
          "complete",
          "complete_sku_daily_metric_recompute",
          grainArgs(claim),
        );

      return completionSchema.parse(data);
    },

    async fail(claim, failure, retryDelaySeconds, maxAttempts) {
      const data =
        await callRpc(
          client,
          "fail",
          "fail_sku_daily_metric_recompute",
          {
            ...grainArgs(claim),
            p_error_class: failure.failureClass,
            p_error_code: failure.code,
            p_error_message: failure.message,
            p_retry_delay_seconds: retryDelaySeconds,
            p_max_attempts: maxAttempts,
          },
        );

      return failureOutcomeSchema.parse(data);
    },

    async stats() {
      const data =
        await callRpc(
          client,
          "stats",
          "sku_daily_metric_recompute_queue_stats",
          {},
        );

      return statsSchema.parse(data);
    },
  };
}

/**
 * Wraps the client handed to the frozen M5.5 recompute.
 *
 * Every RPC call gets the deadline AbortSignal through the supabase-js
 * builder's own abortSignal(). The last RPC error is captured with its
 * SQLSTATE and HTTP status; a successful call clears it, so a stale
 * error from an earlier SA008 retry is not misread later.
 *
 * Aborting stops waiting for the HTTP response. It does not promise the
 * PostgreSQL statement was cancelled; a commit may still land. That is
 * safe because the frozen M5.5 commit revalidates the source token, and
 * the queue lease, not this timer, decides request state.
 */
export function createCapturingRecomputeClient(
  client: MetricRecomputeRpcClient,
  signal: AbortSignal,
): {
  client: {
    rpc: (
      fn: string,
      args: Record<string, unknown>,
    ) => PromiseLike<RpcResponse>;
  };
  lastError: () => CapturedRpcError | null;
} {
  let lastError: CapturedRpcError | null = null;

  return {
    client: {
      rpc(fn, args) {
        const call =
          client.rpc(
            fn,
            args,
          );
        const pending =
          typeof call.abortSignal === "function"
            ? call.abortSignal(signal)
            : call;

        return Promise.resolve(pending).then(
          (result) => {
            lastError =
              result.error === null
                ? null
                : {
                    code:
                      result.error.code === undefined ||
                      result.error.code === ""
                        ? null
                        : result.error.code,
                    message: result.error.message,
                    status:
                      typeof result.status === "number"
                        ? result.status
                        : null,
                  };

            return result;
          },
          (error: unknown) => {
            lastError = {
              code: null,
              message:
                error instanceof Error
                  ? error.message
                  : "rpc rejected",
              status: 0,
            };

            throw error;
          },
        );
      },
    },
    lastError: () => lastError,
  };
}

/**
 * Runs the frozen M5.5 recompute for exactly one claimed grain and
 * metric date. SA008 retries stay inside recomputeSkuDailyMetric and do
 * not touch the queue attempt count.
 */
export function createSkuDailyMetricRecomputeExecutor(
  client: MetricRecomputeRpcClient,
): MetricRecomputeExecutor {
  return async (grain, deadlineMs) => {
    const controller =
      new AbortController();
    const timer =
      setTimeout(() => {
        controller.abort();
      }, deadlineMs);
    const capturing =
      createCapturingRecomputeClient(
        client,
        controller.signal,
      );

    try {
      await recomputeSkuDailyMetric(
        {
          organizationId: grain.organizationId,
          storeId: grain.storeId,
          locationId: grain.locationId,
          variantId: grain.variantId,
          metricDate: grain.metricDate,
        },
        capturing.client,
      );

      // A returned metric id means the commit landed, even if the
      // deadline fired while the response was being read.
      return { ok: true };
    } catch (thrown) {
      return {
        ok: false,
        failure: classifyMetricRecomputeFailure({
          thrown,
          rpcError: capturing.lastError(),
          aborted: controller.signal.aborted,
        }),
      };
    } finally {
      clearTimeout(timer);
    }
  };
}

/**
 * Worker trigger configuration. Disabled unless explicitly enabled with
 * "1". A secret shorter than 32 characters counts as absent, so the
 * trigger fails closed.
 *
 * M5.7 Phase 5B F2 containment: maxActive and claimLimit default to 1.
 * Optional METRIC_RECOMPUTE_MAX_ACTIVE / METRIC_RECOMPUTE_CLAIM_LIMIT
 * must be exact integers in 1..4 when set. Malformed values throw;
 * they never silently fall back to higher concurrency.
 */
export const METRIC_RECOMPUTE_WORKER_MIN_SECRET_LENGTH = 32;

export const METRIC_RECOMPUTE_DEFAULT_MAX_ACTIVE = 1;
export const METRIC_RECOMPUTE_DEFAULT_CLAIM_LIMIT = 1;

export class MetricRecomputeWorkerConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MetricRecomputeWorkerConfigError";
  }
}

export interface MetricRecomputeWorkerConfig {
  enabled: boolean;
  secret: string | null;
  maxActive: number;
  claimLimit: number;
}

/**
 * Parse an optional concurrency bound. Absent / empty → default.
 * Present values must match /^[1-4]$/ exactly (no whitespace, signs,
 * decimals, or leading zeros).
 */
export function parseMetricRecomputeConcurrencyBound(
  raw: string | undefined,
  field: string,
  fallback: number,
): number {
  if (raw === undefined || raw === "") {
    return fallback;
  }

  if (!/^[1-4]$/.test(raw)) {
    throw new MetricRecomputeWorkerConfigError(
      `Metric recompute ${field} must be an integer from 1 to 4.`,
    );
  }

  return Number(raw);
}

export function readMetricRecomputeWorkerConfig(
  env: Readonly<Record<string, string | undefined>>,
): MetricRecomputeWorkerConfig {
  const secret =
    env.METRIC_RECOMPUTE_WORKER_SECRET ?? "";

  return {
    enabled:
      env.METRIC_RECOMPUTE_WORKER_ENABLED === "1",
    secret:
      secret.length >= METRIC_RECOMPUTE_WORKER_MIN_SECRET_LENGTH
        ? secret
        : null,
    maxActive:
      parseMetricRecomputeConcurrencyBound(
        env.METRIC_RECOMPUTE_MAX_ACTIVE,
        "maxActive",
        METRIC_RECOMPUTE_DEFAULT_MAX_ACTIVE,
      ),
    claimLimit:
      parseMetricRecomputeConcurrencyBound(
        env.METRIC_RECOMPUTE_CLAIM_LIMIT,
        "claimLimit",
        METRIC_RECOMPUTE_DEFAULT_CLAIM_LIMIT,
      ),
  };
}

function sha256(
  value: string,
): Buffer {
  return createHash("sha256")
    .update(value, "utf8")
    .digest();
}

/**
 * Constant-time bearer check. Both sides are hashed first, so length
 * differences do not short-circuit the comparison.
 */
export function isAuthorizedMetricRecomputeRequest(
  authorization: string | null,
  secret: string,
): boolean {
  if (
    authorization === null ||
    secret.length < METRIC_RECOMPUTE_WORKER_MIN_SECRET_LENGTH
  ) {
    return false;
  }

  const prefix = "Bearer ";
  const presented =
    authorization.startsWith(prefix)
      ? authorization.slice(prefix.length)
      : "";

  return timingSafeEqual(
    sha256(presented),
    sha256(secret),
  );
}
