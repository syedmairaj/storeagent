import "server-only";

import {
  NextResponse,
  type NextRequest,
} from "next/server";

import {
  resolveRequestId,
} from "@/lib/observability/request-id";

import {
  createMetricRolloverQueue,
  evaluateMetricRolloverHttpGate,
  readMetricRolloverWorkerConfig,
} from "@/lib/persistence/metric-rollover";

import {
  createSupabaseAdminClient,
} from "@/lib/supabase/admin";

/**
 * M5.6D / M5-HR1.b internal trigger for one bounded daily metric rollover tick.
 *
 * Disabled unless METRIC_ROLLOVER_WORKER_ENABLED is exactly "1".
 * Requires a dedicated bearer secret of at least 32 characters, compared
 * in constant time. When enabled, requires server-only
 * METRIC_ROLLOVER_ORGANIZATION_ID (one UUID). Tenant scope is never taken
 * from the request body, query, or headers, and never from the
 * recompute-worker organization env. Bearer authenticates the route only.
 * Missing/invalid org → 503 with zero enqueue RPCs (no global fallback).
 * The response carries counts only. No scheduler is configured.
 *
 * Gate errors (via evaluateMetricRolloverHttpGate): not_found,
 * unauthorized, worker_not_configured, organization_scope_required.
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

export async function POST(
  request: NextRequest,
) {
  const requestId =
    resolveRequestId(
      request.headers.get("x-request-id"),
    );

  const config =
    readMetricRolloverWorkerConfig(process.env);

  const gate =
    evaluateMetricRolloverHttpGate(
      config,
      request.headers.get("authorization"),
    );

  if (!gate.ok) {
    return respond(gate.status, requestId, {
      error: gate.error,
    });
  }

  try {
    const admin =
      createSupabaseAdminClient();
    const queue =
      createMetricRolloverQueue(admin);
    const result =
      await queue.enqueue({
        organizationId: gate.organizationId,
      });

    return respond(200, requestId, {
      result,
    });
  } catch {
    return respond(500, requestId, {
      error: "rollover_tick_failed",
    });
  }
}
