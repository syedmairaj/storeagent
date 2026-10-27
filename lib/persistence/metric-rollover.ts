import "server-only";

import {
  createHash,
  timingSafeEqual,
} from "node:crypto";

import {
  z,
} from "zod";

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

export const METRIC_ROLLOVER_MIN_SECRET_LENGTH = 32;

export interface MetricRolloverWorkerConfig {
  enabled: boolean;
  secret: string | null;
}

export function readMetricRolloverWorkerConfig(
  env: Readonly<Record<string, string | undefined>>,
): MetricRolloverWorkerConfig {
  const secret =
    env.METRIC_ROLLOVER_WORKER_SECRET ?? "";

  return {
    enabled:
      env.METRIC_ROLLOVER_WORKER_ENABLED === "1",
    secret:
      secret.length >= METRIC_ROLLOVER_MIN_SECRET_LENGTH
        ? secret
        : null,
  };
}

function sha256(
  value: string,
): Buffer {
  return createHash("sha256")
    .update(value, "utf8")
    .digest();
}

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
