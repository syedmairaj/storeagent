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
  evaluateMetricRecomputeCronGate,
  isAuthorizedCronRequest,
  readCronSecret,
} from "@/lib/persistence/metric-cron-auth";

import {
  createMetricRecomputeQueue,
  createSkuDailyMetricRecomputeExecutor,
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
 * M5-HR3.1 Vercel Cron GET adapter for one bounded metric recompute tick.
 *
 * Auth: CRON_SECRET only (≥32, timing-safe). Does not use the ops-route
 * worker bearer. Decision table:
 * docs/M5_HR3_VERCEL_PRODUCTION_RUNTIME_CONTRACT.md §2.4.
 *
 * Then HR1.a ENABLE + server-only recompute organization env UUID.
 * Tenant scope is never taken from query, body, or headers. Invokes
 * runMetricRecomputeTick in-process — never HTTP POST to the ops route.
 * Counts only. Cron config is not activated in this milestone.
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
  console.info(
    JSON.stringify({
      source: "metric_recompute_cron",
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
      source: "metric_recompute_cron",
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

export async function GET(
  request: NextRequest,
) {
  const requestId =
    resolveRequestId(
      request.headers.get("x-request-id"),
    );

  // §2.4 rows 1–2 before any worker-config parse or DB/admin work.
  const authorization =
    request.headers.get("authorization");
  const cronSecret =
    readCronSecret(process.env);

  if (cronSecret === null) {
    return respond(401, requestId, {
      error: "cron_not_configured",
    });
  }

  if (
    !isAuthorizedCronRequest(
      authorization,
      cronSecret,
    )
  ) {
    return respond(401, requestId, {
      error: "unauthorized",
    });
  }

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

  const gate =
    evaluateMetricRecomputeCronGate(
      cronSecret,
      config,
      authorization,
    );

  if (!gate.ok) {
    return respond(gate.status, requestId, {
      error: gate.error,
    });
  }

  try {
    const settings =
      validateMetricRecomputeWorkerSettings({
        ...METRIC_RECOMPUTE_WORKER_SETTINGS,
        maxActive: gate.maxActive,
        claimLimit: gate.claimLimit,
      });
    const admin =
      createSupabaseAdminClient();
    const result =
      await runMetricRecomputeTick({
        queue: createMetricRecomputeQueue(admin),
        execute: createSkuDailyMetricRecomputeExecutor(admin),
        ownerId: `metric-recompute:${randomUUID()}`,
        organizationId: gate.organizationId,
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
