import "server-only";

import {
  createHash,
  timingSafeEqual,
} from "node:crypto";

import {
  z,
} from "zod";

import {
  isMetricWorkerEnvEnabled,
} from "@/lib/persistence/metric-worker-runtime-env";

/**
 * M5.6D service-role orchestration for store-local daily metric rollover.
 *
 * RLS_IS_BYPASSED = true. Every call runs as service_role. The enqueue RPC
 * derives tenant scope from durable store rows and writes only into the
 * existing recompute request table. Direct request-table writes are not used.
 */
export const RLS_IS_BYPASSED = true;

export interface MetricRolloverResult {
  storesSelected: number;
  runsOpened: number;
  runsResumed: number;
  runsCompleted: number;
  runsFailed: number;
  grainsEnrolled: number;
}

export type MetricRolloverStats =
  Record<string, number>;

export interface MetricRolloverQueue {
  enqueue(input?: {
    limit?: number;
    maxStores?: number;
    organizationId?: string | null;
    asOf?: string | null;
  }): Promise<MetricRolloverResult>;
  stats(): Promise<MetricRolloverStats>;
}

interface RpcResponse {
  data: unknown;
  error: {
    code?: string;
    message: string;
  } | null;
}

export interface MetricRolloverRpcClient {
  rpc(
    fn: string,
    args?: Record<string, unknown>,
  ): PromiseLike<RpcResponse>;
}

export class MetricRolloverQueueError extends Error {
  readonly operation: string;
  readonly sqlState: string | null;

  constructor(
    operation: string,
    sqlState: string | null,
  ) {
    super(`metric rollover ${operation} failed`);
    this.name = "MetricRolloverQueueError";
    this.operation = operation;
    this.sqlState = sqlState;
  }
}

const resultSchema =
  z.object({
    storesSelected: z.coerce.number().int().nonnegative(),
    runsOpened: z.coerce.number().int().nonnegative(),
    runsResumed: z.coerce.number().int().nonnegative(),
    runsCompleted: z.coerce.number().int().nonnegative(),
    runsFailed: z.coerce.number().int().nonnegative(),
    grainsEnrolled: z.coerce.number().int().nonnegative(),
  });

const statsSchema =
  z.record(
    z.string(),
    z.coerce.number().nonnegative(),
  );

const uuid =
  z.string().regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  );

async function callRpc(
  client: MetricRolloverRpcClient,
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
    throw new MetricRolloverQueueError(
      operation,
      result.error.code ?? null,
    );
  }

  return result.data;
}

export function createMetricRolloverQueue(
  client: MetricRolloverRpcClient,
): MetricRolloverQueue {
  return {
    async enqueue(input = {}) {
      const limit =
        input.limit ?? 100;
      const maxStores =
        input.maxStores ?? 4;
      const organizationId =
        input.organizationId === undefined
          ? null
          : input.organizationId === null
            ? null
            : uuid.parse(input.organizationId);

      const data =
        await callRpc(
          client,
          "enqueue",
          "enqueue_sku_daily_metric_daily_rollover",
          {
            p_limit: limit,
            p_max_stores: maxStores,
            p_organization_id: organizationId,
            p_as_of: input.asOf ?? null,
          },
        );

      return resultSchema.parse(data);
    },

    async stats() {
      const data =
        await callRpc(
          client,
          "stats",
          "sku_daily_metric_rollover_stats",
          {},
        );

      return statsSchema.parse(data);
    },
  };
}

/**
 * Worker trigger configuration. Disabled unless explicitly enabled with
 * "1". A secret shorter than 32 characters counts as absent, so the
 * trigger fails closed.
 *
 * M5-HR1.b: when enabled, METRIC_ROLLOVER_ORGANIZATION_ID must be exactly
 * one UUID (server env only). Missing/invalid scope is null here; the HTTP
 * route returns 503 and performs zero enqueue RPCs. There is no global
 * fallback on the enabled HTTP path. Does not read the recompute-worker
 * organization env as a substitute scope.
 *
 * M5-HR3.2a: when `VERCEL_ENV` is exactly `preview`, `enabled` is forced
 * false regardless of METRIC_ROLLOVER_WORKER_ENABLED (see
 * `isMetricWorkerEnvEnabled`).
 */
export const METRIC_ROLLOVER_MIN_SECRET_LENGTH = 32;

export interface MetricRolloverWorkerConfig {
  enabled: boolean;
  secret: string | null;
  /**
   * Trusted tenant for the enabled HTTP tick. Null when absent/invalid.
   * Normalized to lowercase hex. Never taken from the HTTP caller.
   */
  organizationId: string | null;
}

/**
 * Server-only organization scope for the enabled rollover HTTP tick.
 * Rejects absent, empty, whitespace-padded, multi-value, or non-UUID
 * input. Does not throw: invalid → null (route maps to 503 when enabled).
 */
export function parseMetricRolloverOrganizationId(
  raw: string | undefined,
): string | null {
  if (raw === undefined || raw === "") {
    return null;
  }

  if (raw !== raw.trim() || /[\s,;]/.test(raw)) {
    return null;
  }

  const parsed =
    uuid.safeParse(raw);

  if (!parsed.success) {
    return null;
  }

  return parsed.data.toLowerCase();
}

export function readMetricRolloverWorkerConfig(
  env: Readonly<Record<string, string | undefined>>,
): MetricRolloverWorkerConfig {
  const secret =
    env.METRIC_ROLLOVER_WORKER_SECRET ?? "";

  return {
    enabled:
      isMetricWorkerEnvEnabled(
        env,
        env.METRIC_ROLLOVER_WORKER_ENABLED,
      ),
    secret:
      secret.length >= METRIC_ROLLOVER_MIN_SECRET_LENGTH
        ? secret
        : null,
    organizationId:
      parseMetricRolloverOrganizationId(
        env.METRIC_ROLLOVER_ORGANIZATION_ID,
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
export function isAuthorizedMetricRolloverRequest(
  authorization: string | null,
  secret: string,
): boolean {
  if (
    authorization === null ||
    secret.length < METRIC_ROLLOVER_MIN_SECRET_LENGTH
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

export type MetricRolloverHttpGateResult =
  | {
      ok: true;
      organizationId: string;
      secret: string;
    }
  | {
      ok: false;
      status: 404 | 401 | 503;
      error: string;
    };

/**
 * Ordered HTTP gate from docs/M5_HR1_B_ORG_SCOPED_ROLLOVER_CONTRACT.md §4.2.
 * Callers must not perform enqueue/stats RPCs unless ok === true.
 */
export function evaluateMetricRolloverHttpGate(
  config: MetricRolloverWorkerConfig,
  authorization: string | null,
): MetricRolloverHttpGateResult {
  if (!config.enabled) {
    return {
      ok: false,
      status: 404,
      error: "not_found",
    };
  }

  if (config.secret === null) {
    return {
      ok: false,
      status: 503,
      error: "worker_not_configured",
    };
  }

  if (
    !isAuthorizedMetricRolloverRequest(
      authorization,
      config.secret,
    )
  ) {
    return {
      ok: false,
      status: 401,
      error: "unauthorized",
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
    secret: config.secret,
  };
}
