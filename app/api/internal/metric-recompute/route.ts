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
  evaluateMetricRecomputeHttpGate,
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
 * M5.6C / M5-HR1.a internal trigger for one bounded metric recompute tick.
 *
 * Disabled unless METRIC_RECOMPUTE_WORKER_ENABLED is exactly "1".
 * Requires a dedicated bearer secret of at least 32 characters, compared
 * in constant time. When enabled, requires server-only
 * METRIC_RECOMPUTE_ORGANIZATION_ID (one UUID). Tenant scope is never taken
 * from the request body, query, or headers. Bearer authenticates the route
 * only. Missing/invalid org → 503 with zero queue RPCs (no global fallback).
 * The response carries counts only. No scheduler is configured.
 *
 * Gate errors (via evaluateMetricRecomputeHttpGate): not_found,
 * unauthorized, worker_not_configured, organization_scope_required.
 *
 * M5.7 Phase 5B: concurrency defaults to maxActive=1 / claimLimit=1 via
 * readMetricRecomputeWorkerConfig.
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

  const gate =
    evaluateMetricRecomputeHttpGate(
      config,
      request.headers.get("authorization"),
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
