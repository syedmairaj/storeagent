import "server-only";

import {
  randomUUID,
} from "node:crypto";

import {
  NextResponse,
  type NextRequest,
} from "next/server";

import {
  resolveRequestId,
} from "@/lib/observability/request-id";

import {
  createMetricRecomputeQueue,
  createSkuDailyMetricRecomputeExecutor,
  isAuthorizedMetricRecomputeRequest,
  readMetricRecomputeWorkerConfig,
} from "@/lib/persistence/metric-recompute-queue";

import {
  createSupabaseAdminClient,
} from "@/lib/supabase/admin";

import {
  runMetricRecomputeTick,
} from "@/workers/aggregate-metrics";

import type {
  WorkerTelemetryEvent,
} from "@/workers/types";

/**
 * M5.6C internal trigger for one bounded metric recompute tick.
 *
 * Disabled unless METRIC_RECOMPUTE_WORKER_ENABLED is exactly "1".
 * Requires a dedicated bearer secret of at least 32 characters, compared
 * in constant time. Accepts no organization, store, or grain input: work
 * comes only from durable request rows. The response carries counts only.
 *
 * No scheduler is configured by this milestone.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function respond(
  status: number,
  requestId: string,
  body: Record<string, unknown>,
): NextResponse {
  return NextResponse.json(
    {
      requestId,
      ...body,
    },
    {
      status,
      headers: {
        "cache-control": "no-store",
        "x-request-id": requestId,
      },
    },
  );
}

function emitTelemetry(
  event: WorkerTelemetryEvent,
): void {
  // Infrastructure telemetry only: no claim token, payload, or raw error.
  console.info(
    JSON.stringify({
      source: "metric_recompute_worker",
      ...event,
    }),
  );
}

export async function POST(
  request: NextRequest,
) {
  const requestId =
    resolveRequestId(
      request.headers.get("x-request-id"),
    );

  const config =
    readMetricRecomputeWorkerConfig(process.env);

  if (!config.enabled) {
    return respond(404, requestId, {
      error: "not_found",
    });
  }

  if (config.secret === null) {
    return respond(503, requestId, {
      error: "worker_not_configured",
    });
  }

  if (
    !isAuthorizedMetricRecomputeRequest(
      request.headers.get("authorization"),
      config.secret,
    )
  ) {
    return respond(401, requestId, {
      error: "unauthorized",
    });
  }

  try {
    const admin =
      createSupabaseAdminClient();
    const result =
      await runMetricRecomputeTick({
        queue: createMetricRecomputeQueue(admin),
        execute: createSkuDailyMetricRecomputeExecutor(admin),
        ownerId: `metric-recompute:${randomUUID()}`,
        now: () => Date.now(),
        emit: emitTelemetry,
      });

    return respond(200, requestId, {
      result,
    });
  } catch {
    return respond(500, requestId, {
      error: "worker_tick_failed",
    });
  }
}
