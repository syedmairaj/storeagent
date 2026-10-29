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
  MetricRecomputeWorkerConfigError,
  readMetricRecomputeWorkerConfig,
} from "@/lib/persistence/metric-recompute-queue";

import {
  createSupabaseAdminClient,
} from "@/lib/supabase/admin";

import {
  METRIC_RECOMPUTE_WORKER_SETTINGS,
  runMetricRecomputeTick,
  validateMetricRecomputeWorkerSettings,
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
 * M5.7 Phase 5B: concurrency defaults to maxActive=1 / claimLimit=1 via
 * readMetricRecomputeWorkerConfig. No scheduler is configured.
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

function emitTickSummary(
  result: Awaited<ReturnType<typeof runMetricRecomputeTick>>,
  concurrency: { maxActive: number; claimLimit: number },
): void {
  const stats =
    result.stats;

  console.info(
    JSON.stringify({
      source: "metric_recompute_worker",
      eventType: "tick_summary",
      maxActive: concurrency.maxActive,
      claimLimit: concurrency.claimLimit,
      durationMs: result.durationMs,
      stoppedReason: result.stoppedReason,
      claimed: result.claimed,
      started: result.started,
      succeeded: result.succeeded,
      deferred: result.deferred,
      retryScheduled: result.retryScheduled,
      failed: result.failed,
      fenced: result.fenced,
      queueErrors: result.queueErrors,
      activeLeases: stats?.activeLeases ?? null,
      queued: stats?.queued ?? null,
      failedRequests: stats?.failed ?? null,
      oldestClaimableAgeSeconds:
        stats?.oldestClaimableAgeSeconds ?? null,
      unconsumedEvents: stats?.unconsumedEvents ?? null,
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

  let config;

  try {
    config =
      readMetricRecomputeWorkerConfig(process.env);
  } catch (error) {
    if (error instanceof MetricRecomputeWorkerConfigError) {
      return respond(503, requestId, {
        error: "worker_misconfigured",
      });
    }

    throw error;
  }

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
    const settings =
      validateMetricRecomputeWorkerSettings({
        ...METRIC_RECOMPUTE_WORKER_SETTINGS,
        maxActive: config.maxActive,
        claimLimit: config.claimLimit,
      });
    const admin =
      createSupabaseAdminClient();
    const result =
      await runMetricRecomputeTick({
        queue: createMetricRecomputeQueue(admin),
        execute: createSkuDailyMetricRecomputeExecutor(admin),
        ownerId: `metric-recompute:${randomUUID()}`,
        now: () => Date.now(),
        emit: emitTelemetry,
        settings,
      });

    emitTickSummary(result, {
      maxActive: settings.maxActive,
      claimLimit: settings.claimLimit,
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
