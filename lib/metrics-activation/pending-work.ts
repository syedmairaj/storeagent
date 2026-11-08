import "server-only";

/**
 * Org-scoped pending M5 work visible only through the trusted write boundary.
 * Callers must already authorize organization membership / admin scope.
 */

export type PendingMetricWork = {
  unconsumedSourceEvents: number;
  openRecomputeRequests: number;
};

const OPEN_REQUEST_STATUSES = [
  "queued",
  "claimed",
  "running",
  "retry_wait",
  "failed",
] as const;

type PendingWorkQueryResult = {
  count: number | null;
  error: { message: string } | null;
};

/**
 * Narrow structural client. Kept intentionally loose so Supabase's deep
 * generated types do not explode callers (TS2589).
 */
export type PendingMetricWorkClient = {
  from: (table: string) => {
    select: (
      columns: string,
      options: { count: "exact"; head: true },
    ) => {
      eq: (
        column: string,
        value: string,
      ) => {
        is: (column: string, value: null) => PromiseLike<PendingWorkQueryResult>;
        in: (
          column: string,
          values: readonly string[],
        ) => PromiseLike<PendingWorkQueryResult>;
      };
    };
  };
};

export async function countPendingMetricWorkForOrganization(
  client: PendingMetricWorkClient,
  organizationId: string,
): Promise<PendingMetricWork> {
  const eventsQuery = client
    .from("sku_daily_metric_source_events")
    .select("event_id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .is("consumed_at", null);

  const requestsQuery = client
    .from("sku_daily_metric_recompute_requests")
    .select("organization_id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .in("status", OPEN_REQUEST_STATUSES);

  const [events, requests] = await Promise.all([eventsQuery, requestsQuery]);

  if (events.error) {
    throw new Error(
      `Unable to inspect pending metric source events: ${events.error.message}`,
    );
  }
  if (requests.error) {
    throw new Error(
      `Unable to inspect pending metric recompute requests: ${requests.error.message}`,
    );
  }

  return {
    unconsumedSourceEvents: events.count ?? 0,
    openRecomputeRequests: requests.count ?? 0,
  };
}

export function hasPendingMetricWork(pending: PendingMetricWork): boolean {
  return (
    pending.unconsumedSourceEvents > 0 || pending.openRecomputeRequests > 0
  );
}
