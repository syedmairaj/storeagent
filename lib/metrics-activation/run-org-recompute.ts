import "server-only";

import { randomUUID } from "node:crypto";

import {
  countPendingMetricWorkForOrganization,
  hasPendingMetricWork,
} from "@/lib/metrics-activation/pending-work";
import {
  createMetricRecomputeQueue,
  createSkuDailyMetricRecomputeExecutor,
} from "@/lib/persistence/metric-recompute-queue";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  METRIC_RECOMPUTE_WORKER_SETTINGS,
  runMetricRecomputeTick,
  type MetricRecomputeTickResult,
} from "@/workers/aggregate-metrics";

/**
 * Merchant-authorized local M5 activation.
 *
 * Reuses the canonical org-scoped tick (consume → recover → claim →
 * frozen recomputeSkuDailyMetric → complete/fail). Does not require the
 * internal worker HTTP enable flag and does not touch cron.
 *
 * Tenant scope must already be authorized by the caller as organization-
 * wide activation for that organizationId. This module never reads
 * organizationId from HTTP body/query env gates.
 */

export type MerchantMetricActivationSummary = {
  organizationId: string;
  ticks: number;
  consumedEvents: number;
  succeeded: number;
  failed: number;
  retryScheduled: number;
  deferred: number;
  queueErrors: number;
  stoppedReason: "drained" | "budget" | "max_ticks" | "queue_error";
  /** True when unconsumed events or open requests remain after this pass. */
  pendingRemaining: boolean;
  unconsumedSourceEvents: number;
  openRecomputeRequests: number;
};

export type RunOrgMetricRecomputeInput = {
  organizationId: string;
  /**
   * Soft cap on tick rounds. One tick may process a single grain under
   * F2 containment defaults (maxActive=1 / claimLimit=1).
   */
  maxTicks?: number;
  ownerId?: string;
};

const DEFAULT_MAX_TICKS = 40;

export async function runAuthorizedOrgMetricRecompute(
  input: RunOrgMetricRecomputeInput,
): Promise<MerchantMetricActivationSummary> {
  const organizationId = input.organizationId.trim();
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      organizationId,
    )
  ) {
    throw new Error("organizationId must be a UUID.");
  }

  const maxTicks = Math.min(
    Math.max(1, input.maxTicks ?? DEFAULT_MAX_TICKS),
    100,
  );
  const ownerId =
    input.ownerId?.trim() ||
    `merchant-metrics-activation:${randomUUID()}`;

  const admin = createSupabaseAdminClient();
  const queue = createMetricRecomputeQueue(admin);
  const execute = createSkuDailyMetricRecomputeExecutor(admin);

  const summary: MerchantMetricActivationSummary = {
    organizationId,
    ticks: 0,
    consumedEvents: 0,
    succeeded: 0,
    failed: 0,
    retryScheduled: 0,
    deferred: 0,
    queueErrors: 0,
    stoppedReason: "drained",
    pendingRemaining: false,
    unconsumedSourceEvents: 0,
    openRecomputeRequests: 0,
  };

  for (let round = 0; round < maxTicks; round += 1) {
    const tick: MetricRecomputeTickResult = await runMetricRecomputeTick({
      queue,
      execute,
      ownerId,
      organizationId,
      now: () => Date.now(),
      emit: () => {
        // Merchant activation keeps infrastructure telemetry off the hot path.
      },
      settings: METRIC_RECOMPUTE_WORKER_SETTINGS,
    });

    summary.ticks += 1;
    summary.consumedEvents += tick.consumedEvents;
    summary.succeeded += tick.succeeded;
    summary.failed += tick.failed;
    summary.retryScheduled += tick.retryScheduled;
    summary.deferred += tick.deferred;
    summary.queueErrors += tick.queueErrors;

    if (tick.stoppedReason === "queue_error" || tick.queueErrors > 0) {
      summary.stoppedReason = "queue_error";
      break;
    }

    if (tick.stoppedReason === "budget") {
      summary.stoppedReason = "budget";
      break;
    }

    // Drained this tick with no claims and no remaining consume work.
    if (
      tick.stoppedReason === "drained" &&
      tick.claimed === 0 &&
      tick.consumedEvents === 0
    ) {
      summary.stoppedReason = "drained";
      break;
    }

    // Still claiming/succeeding — continue until empty or cap.
    if (round === maxTicks - 1) {
      summary.stoppedReason = "max_ticks";
    }
  }

  const pending = await countPendingMetricWorkForOrganization(
    admin as unknown as Parameters<
      typeof countPendingMetricWorkForOrganization
    >[0],
    organizationId,
  );
  summary.unconsumedSourceEvents = pending.unconsumedSourceEvents;
  summary.openRecomputeRequests = pending.openRecomputeRequests;
  summary.pendingRemaining = hasPendingMetricWork(pending);

  return summary;
}
