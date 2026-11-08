import "server-only";

import { runAuthorizedOrgMetricRecompute } from "@/lib/metrics-activation/run-org-recompute";
import type { MerchantMetricActivationSummary } from "@/lib/metrics-activation/run-org-recompute";

/**
 * Drain org-scoped M5 recompute after planning defaults change.
 *
 * The upsert RPC already dirties store-local current metric grains via
 * enqueue_sku_daily_metric_planning_invalidation. This helper only runs the
 * existing merchant-authorized local tick (no cron / HTTP worker enable).
 *
 * commercialActionsEligible remains hard-false elsewhere.
 */
export async function refreshMetricsAfterPlanningChange(input: {
  organizationId: string;
  ownerId: string;
}): Promise<MerchantMetricActivationSummary> {
  return runAuthorizedOrgMetricRecompute({
    organizationId: input.organizationId,
    ownerId: input.ownerId,
  });
}
