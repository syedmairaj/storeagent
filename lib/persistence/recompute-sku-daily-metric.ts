import "server-only";

import { aggregateInventoryMetrics } from "@/lib/metrics/inventory-aggregates";
import type {
  InventoryDemandDay,
  InventorySnapshotFact,
} from "@/lib/metrics/inventory-aggregates";
import { aggregateSales } from "@/lib/metrics/sales-aggregates";
import type {
  SalesAggregateInput,
  SalesAggregateInventorySnapshot,
  SalesAggregateOrder,
  SalesAggregateOrderItem,
  SalesAggregateReturnRefund,
} from "@/lib/metrics/sales-aggregates";
import { toPersistedSkuDailyMetric } from "@/lib/metrics/sku-daily-metric-record";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const SKU_DAILY_METRIC_SOURCE_MISMATCH = "SA008";

const SOURCE_READ_ATTEMPTS = 3;

export class SkuDailyMetricSourceChangedError extends Error {
  readonly sqlState = SKU_DAILY_METRIC_SOURCE_MISMATCH;

  constructor() {
    super("sku daily metric source token mismatch");
    this.name = "SkuDailyMetricSourceChangedError";
  }
}

export interface RecomputeSkuDailyMetricInput {
  organizationId: string;
  storeId: string;
  locationId: string;
  variantId: string;
  metricDate: string;
}

interface SourceSnapshot {
  timeZone: string;
  sourceToken: string;
  orders: SalesAggregateOrder[];
  orderItems: SalesAggregateOrderItem[];
  returnRefunds: SalesAggregateReturnRefund[];
  inventorySnapshots: SalesAggregateInventorySnapshot[];
}

type RpcResult = PromiseLike<{
  data: unknown;
  error: { code?: string; message: string } | null;
}>;

type RpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => RpcResult;
};

/**
 * Recompute one location grain and metric date.
 * Calculation stays in the closed aggregators. The commit RPC
 * revalidates the source token under source-table SHARE locks.
 */
export async function recomputeSkuDailyMetric(
  input: RecomputeSkuDailyMetricInput,
  client: RpcClient = createSupabaseAdminClient(),
): Promise<string> {
  assertScope(input);

  let lastMismatch = false;

  for (let attempt = 0; attempt < SOURCE_READ_ATTEMPTS; attempt += 1) {
    const snapshot = await readSourceSnapshot(client, input);
    assertIanaTimeZone(snapshot.timeZone);

    const salesInput: SalesAggregateInput = {
      organizationId: input.organizationId,
      storeId: input.storeId,
      locationId: input.locationId,
      variantId: input.variantId,
      metricDate: input.metricDate,
      timeZone: snapshot.timeZone,
      orders: snapshot.orders,
      orderItems: snapshot.orderItems,
      returnRefunds: snapshot.returnRefunds,
      inventorySnapshots: snapshot.inventorySnapshots,
    };
    const sales = aggregateSales(salesInput);
    const metricDay = sales.days.find(
      (day) => day.metricDate === input.metricDate,
    );

    if (metricDay === undefined) {
      throw new Error(
        "sales aggregate is missing the metric date.",
      );
    }

    const inventory = aggregateInventoryMetrics({
      organizationId: input.organizationId,
      storeId: input.storeId,
      locationId: input.locationId,
      variantId: input.variantId,
      metricDate: input.metricDate,
      timeZone: snapshot.timeZone,
      snapshots: snapshot.inventorySnapshots satisfies
        readonly InventorySnapshotFact[],
      demand: {
        netUnitsSold: metricDay.netUnitsSold,
        salesVelocity30d: sales.windows[30].velocity,
        days: sales.days satisfies readonly InventoryDemandDay[],
      },
    });
    const metric = toPersistedSkuDailyMetric(
      input.metricDate,
      snapshot.timeZone,
      sales,
      inventory,
    );
    const committed = await client.rpc(
      "commit_sku_daily_metric",
      {
        p_organization_id: input.organizationId,
        p_store_id: input.storeId,
        p_location_id: input.locationId,
        p_variant_id: input.variantId,
        p_metric_date: input.metricDate,
        p_source_token: snapshot.sourceToken,
        p_metric: metric,
      },
    );

    if (committed.error === null) {
      if (typeof committed.data !== "string") {
        throw new Error(
          "sku daily metric commit did not return an id.",
        );
      }

      return committed.data;
    }

    if (isSourceMismatch(committed.error)) {
      lastMismatch = true;
      continue;
    }

    throw new Error(committed.error.message);
  }

  if (lastMismatch) {
    throw new SkuDailyMetricSourceChangedError();
  }

  throw new Error("sku daily metric recompute failed.");
}

async function readSourceSnapshot(
  client: RpcClient,
  input: RecomputeSkuDailyMetricInput,
): Promise<SourceSnapshot> {
  const result = await client.rpc(
    "sku_daily_metric_source_snapshot",
    {
      p_organization_id: input.organizationId,
      p_store_id: input.storeId,
      p_location_id: input.locationId,
      p_variant_id: input.variantId,
    },
  );

  if (result.error !== null) {
    throw new Error(result.error.message);
  }

  return result.data as SourceSnapshot;
}

function isSourceMismatch(error: {
  code?: string;
  message: string;
}): boolean {
  return (
    error.code === SKU_DAILY_METRIC_SOURCE_MISMATCH ||
    error.message.includes("source token mismatch")
  );
}

function assertScope(input: RecomputeSkuDailyMetricInput): void {
  for (const [field, value] of [
    ["organizationId", input.organizationId],
    ["storeId", input.storeId],
    ["locationId", input.locationId],
    ["variantId", input.variantId],
    ["metricDate", input.metricDate],
  ] as const) {
    if (value.trim().length === 0) {
      throw new Error(`${field} is required.`);
    }
  }
}

function assertIanaTimeZone(timeZone: string): void {
  if (
    timeZone !== "UTC" &&
    timeZone !== "Etc/UTC" &&
    !Intl.supportedValuesOf("timeZone").includes(timeZone)
  ) {
    throw new Error(
      "stores.timezone must be a recognized IANA timezone.",
    );
  }
}
