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
  isAuthorizedMetricRolloverRequest,
  readMetricRolloverWorkerConfig,
} from "@/lib/persistence/metric-rollover";

import {
  createSupabaseAdminClient,
} from "@/lib/supabase/admin";

/**
 * M5.6D internal trigger for one bounded daily metric rollover tick.
 *
 * Disabled unless METRIC_ROLLOVER_WORKER_ENABLED is exactly "1".
 * Requires a dedicated bearer secret of at least 32 characters, compared
 * in constant time. Accepts no organization, store, or grain input from
 * the caller: eligible work is selected inside the security-definer RPC
 * from durable store rows. The response carries counts only.
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

export async function POST(
  request: NextRequest,
) {
  const requestId =
    resolveRequestId(
      request.headers.get("x-request-id"),
    );

  const config =
    readMetricRolloverWorkerConfig(process.env);

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
    !isAuthorizedMetricRolloverRequest(
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
    const queue =
      createMetricRolloverQueue(admin);
    const result =
      await queue.enqueue();

    return respond(200, requestId, {
      result,
    });
  } catch {
    return respond(500, requestId, {
      error: "rollover_tick_failed",
    });
  }
}
