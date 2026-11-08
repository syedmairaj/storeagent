"use server";

import { requireAppIdentity } from "@/lib/auth/app-route";
import { authorizeMerchantInventoryImport } from "@/lib/inventory-import/authorize";
import {
  merchantMetricsActivationNote,
  resolveMerchantMetricsActivationStatus,
  type MerchantMetricsActivationStatus,
} from "@/lib/metrics-activation/merchant-copy";
import { runAuthorizedOrgMetricRecompute } from "@/lib/metrics-activation/run-org-recompute";

export type ActivateMerchantSalesMetricsResult =
  | {
      ok: true;
      organizationId: string;
      storeId: string;
      locationId: string;
      ticks: number;
      consumedEvents: number;
      succeeded: number;
      failed: number;
      retryScheduled: number;
      deferred: number;
      queueErrors: number;
      stoppedReason: string;
      pendingRemaining: boolean;
      metricsStatus: MerchantMetricsActivationStatus;
      note: string;
    }
  | { ok: false; error: string };

/**
 * Merchant-facing vertical slice.
 *
 * Authorization: owner/admin membership for the selected organization,
 * proven via store/location ownership in that organization. Recompute then
 * runs as organization-wide activation for that authorized organizationId
 * only — store/location selection cannot retarget a foreign organization.
 *
 * Cron and the internal worker HTTP enable flag stay off.
 */
export async function activateMerchantSalesMetricsAction(input: {
  organizationId: string;
  storeId: string;
  locationId: string;
}): Promise<ActivateMerchantSalesMetricsResult> {
  try {
    const identity = await requireAppIdentity();
    const authorized = await authorizeMerchantInventoryImport({
      identity,
      organizationId: input.organizationId,
      storeId: input.storeId,
      locationId: input.locationId,
    });

    if (!authorized.ok) {
      return { ok: false, error: authorized.error };
    }

    // Organization-wide activation is intentional and limited to the
    // organization proven by the authorized store/location membership.
    const summary = await runAuthorizedOrgMetricRecompute({
      organizationId: authorized.scope.organizationId,
      ownerId: `merchant-metrics-activation:${identity.userId}`,
    });

    const metricsStatus = resolveMerchantMetricsActivationStatus(summary);

    return {
      ok: true,
      organizationId: authorized.scope.organizationId,
      storeId: authorized.scope.storeId,
      locationId: authorized.scope.locationId,
      ticks: summary.ticks,
      consumedEvents: summary.consumedEvents,
      succeeded: summary.succeeded,
      failed: summary.failed,
      retryScheduled: summary.retryScheduled,
      deferred: summary.deferred,
      queueErrors: summary.queueErrors,
      stoppedReason: summary.stoppedReason,
      pendingRemaining: summary.pendingRemaining,
      metricsStatus,
      note: merchantMetricsActivationNote(metricsStatus, summary),
    };
  } catch (cause) {
    const message =
      cause instanceof Error && cause.message.trim()
        ? cause.message
        : "Unable to activate demand metrics right now.";

    return {
      ok: false,
      error: message.includes("owner or admin")
        ? "Only owners and admins can activate demand metrics."
        : "Unable to activate demand metrics right now.",
    };
  }
}
