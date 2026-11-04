import "server-only";

import {
  NextResponse,
  type NextRequest,
} from "next/server";

import {
  resolveRequestId,
} from "@/lib/observability/request-id";

import {
  evaluateMetricRolloverCronGate,
  isAuthorizedCronRequest,
  readCronSecret,
} from "@/lib/persistence/metric-cron-auth";

import {
  createMetricRolloverQueue,
  readMetricRolloverWorkerConfig,
} from "@/lib/persistence/metric-rollover";

import {
  createSupabaseAdminClient,
} from "@/lib/supabase/admin";

/**
 * M5-HR3.1 Vercel Cron GET adapter for one bounded metric rollover tick.
 *
 * Auth: CRON_SECRET only (≥32, timing-safe). Does not use the ops-route
 * worker bearer. Decision table:
 * docs/M5_HR3_VERCEL_PRODUCTION_RUNTIME_CONTRACT.md §2.4.
 *
 * Then HR1.b ENABLE + server-only rollover organization env UUID
 * (never the recompute organization env). Tenant / asOf never taken from
 * query, body, or headers. Invokes enqueue in-process — never HTTP POST
 * to the ops route. Counts only. Cron config is not activated here.
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

export async function GET(
  request: NextRequest,
) {
  const requestId =
    resolveRequestId(
      request.headers.get("x-request-id"),
    );

  // §2.4 rows 1–2 before worker-config parse or DB/admin work.
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

  const config =
    readMetricRolloverWorkerConfig(process.env);

  const gate =
    evaluateMetricRolloverCronGate(
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
