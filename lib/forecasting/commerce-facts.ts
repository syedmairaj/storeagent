import type {
  OrderStatus,
  UnitQuantity,
} from "@/lib/commerce-domain/types";

import {
  DEFAULT_FORECAST_LOOKBACK_DAYS_V1,
  type ForecastSkuDemandInput,
} from "./orchestrate";

import {
  assertForecastDate,
  shiftForecastDate,
  type ForecastDailyFact,
  type ForecastGrain,
} from "./series";

/**
 * Pure M6 P2a commerce → forecast facts adapter.
 *
 * Reuses M5.3 sold/return/timezone/grain semantics in-memory.
 * Does not call M5 velocity math, invent lost sales, or touch the DB.
 */

const SOLD_ORDER_STATUSES = new Set<OrderStatus>([
  "completed",
  "refunded",
  "partially_refunded",
]);

export interface CommerceForecastOrder {
  id: string;
  organizationId: string;
  storeId: string;
  status: OrderStatus;
  orderedAt: string;
}

export interface CommerceForecastOrderItem {
  id: string;
  organizationId: string;
  storeId: string;
  orderId: string;
  variantId: string;
  locationId: string | null;
  quantity: UnitQuantity;
}

export interface CommerceForecastReturnRefund {
  id: string;
  organizationId: string;
  storeId: string;
  variantId: string;
  locationId: string | null;
  returnedQuantity: UnitQuantity | null;
  occurredAt: string;
}

export interface CommerceForecastInventorySnapshot {
  id: string;
  organizationId: string;
  storeId: string;
  locationId: string;
  variantId: string;
  observedAt: string;
  availableQuantity: UnitQuantity | null;
}

export interface BuildForecastSkuDemandInputArgs {
  grain: ForecastGrain;
  forecastAsOf: string;
  timeZone: string;
  lookbackDays?: number;
  orders: readonly CommerceForecastOrder[];
  orderItems: readonly CommerceForecastOrderItem[];
  returnRefunds: readonly CommerceForecastReturnRefund[];
  inventorySnapshots: readonly CommerceForecastInventorySnapshot[];
  /**
   * Store-local dates the caller explicitly marks as fully ingested.
   * All other days remain dataComplete=false.
   */
  trustedCompleteDates?: readonly string[];
  leadTimeDays?: number | null;
  reviewPeriodDays?: number | null;
}

interface DayBucket {
  soldUnits: number;
  returnedUnits: number;
  availableQuantity: number | null;
  snapshotObservedAt: string | null;
  snapshotId: string | null;
}

function assertIdentity(value: string, field: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} is required.`);
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

function assertNonNegativeInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer.`);
  }
}

function identityKey(
  organizationId: string,
  storeId: string,
  id: string,
): string {
  return `${organizationId}\u0000${storeId}\u0000${id}`;
}

function canonicalRecords<T extends { id: string }>(
  rows: readonly T[],
  sameEvidence: (left: T, right: T) => boolean,
  conflictMessage: string,
): T[] {
  const byId = new Map<string, T>();

  for (const row of rows) {
    const existing = byId.get(row.id);

    if (existing === undefined) {
      byId.set(row.id, row);
      continue;
    }

    if (!sameEvidence(existing, row)) {
      throw new Error(conflictMessage);
    }
  }

  return [...byId.values()];
}

function storeLocalDate(timestamp: string, timeZone: string): string {
  const instant = new Date(timestamp);

  if (Number.isNaN(instant.getTime())) {
    throw new Error(
      "commercial timestamp must be a valid UTC instant.",
    );
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (year === undefined || month === undefined || day === undefined) {
    throw new Error(
      "commercial timestamp must be a valid UTC instant.",
    );
  }

  return `${year}-${month}-${day}`;
}

function sameGrain(
  grain: ForecastGrain,
  row: {
    organizationId: string;
    storeId: string;
    variantId?: string;
  },
): boolean {
  if (
    row.organizationId !== grain.organizationId ||
    row.storeId !== grain.storeId
  ) {
    return false;
  }

  if (row.variantId !== undefined && row.variantId !== grain.variantId) {
    return false;
  }

  return true;
}

function resolveLookbackDays(lookbackDays: number | undefined): number {
  const value = lookbackDays ?? DEFAULT_FORECAST_LOOKBACK_DAYS_V1;

  if (!Number.isInteger(value) || value < 1 || value > 365) {
    throw new Error(
      "lookbackDays must be an integer from 1 to 365.",
    );
  }

  return value;
}

function emptyBuckets(
  forecastAsOf: string,
  lookbackDays: number,
): Map<string, DayBucket> {
  const start = shiftForecastDate(forecastAsOf, -(lookbackDays - 1));
  const buckets = new Map<string, DayBucket>();

  for (let offset = 0; offset < lookbackDays; offset += 1) {
    buckets.set(shiftForecastDate(start, offset), {
      soldUnits: 0,
      returnedUnits: 0,
      availableQuantity: null,
      snapshotObservedAt: null,
      snapshotId: null,
    });
  }

  return buckets;
}

function availabilityFromQuantity(
  availableQuantity: number | null,
): ForecastDailyFact["availability"] {
  if (availableQuantity === null) {
    return "unknown";
  }

  if (availableQuantity > 0) {
    return "available";
  }

  return "unavailable";
}

/**
 * Maps canonical commerce rows into ForecastSkuDemandInput for
 * forecastSkuDemand(). Promotion remains unknown. Completeness is
 * false unless the date is listed in trustedCompleteDates.
 */
export function buildForecastSkuDemandInput(
  input: BuildForecastSkuDemandInputArgs,
): ForecastSkuDemandInput {
  const { grain } = input;

  assertIdentity(grain.organizationId, "organizationId");
  assertIdentity(grain.storeId, "storeId");
  assertIdentity(grain.locationId, "locationId");
  assertIdentity(grain.variantId, "variantId");
  assertForecastDate(input.forecastAsOf, "forecastAsOf");
  assertIanaTimeZone(input.timeZone);

  const lookbackDays = resolveLookbackDays(input.lookbackDays);
  const inputStartDate = shiftForecastDate(
    input.forecastAsOf,
    -(lookbackDays - 1),
  );
  const trustedComplete = new Set(input.trustedCompleteDates ?? []);

  for (const date of trustedComplete) {
    assertForecastDate(date, "trustedCompleteDates");
  }

  const buckets = emptyBuckets(input.forecastAsOf, lookbackDays);

  const orders = new Map(
    canonicalRecords(
      input.orders,
      (left, right) =>
        left.status === right.status &&
        left.orderedAt === right.orderedAt &&
        left.organizationId === right.organizationId &&
        left.storeId === right.storeId,
      "duplicate order identity has conflicting evidence.",
    ).map((order) => [
      identityKey(order.organizationId, order.storeId, order.id),
      order,
    ]),
  );

  const orderItems = canonicalRecords(
    input.orderItems,
    (left, right) =>
      left.orderId === right.orderId &&
      left.variantId === right.variantId &&
      left.locationId === right.locationId &&
      left.quantity === right.quantity &&
      left.organizationId === right.organizationId &&
      left.storeId === right.storeId,
    "duplicate order item identity has conflicting evidence.",
  );

  const returnRefunds = canonicalRecords(
    input.returnRefunds,
    (left, right) =>
      left.variantId === right.variantId &&
      left.locationId === right.locationId &&
      left.returnedQuantity === right.returnedQuantity &&
      left.occurredAt === right.occurredAt &&
      left.organizationId === right.organizationId &&
      left.storeId === right.storeId,
    "duplicate return identity has conflicting evidence.",
  );

  const inventorySnapshots = canonicalRecords(
    input.inventorySnapshots,
    (left, right) =>
      left.locationId === right.locationId &&
      left.variantId === right.variantId &&
      left.observedAt === right.observedAt &&
      left.availableQuantity === right.availableQuantity &&
      left.organizationId === right.organizationId &&
      left.storeId === right.storeId,
    "duplicate inventory snapshot identity has conflicting evidence.",
  );

  for (const item of orderItems) {
    if (
      !sameGrain(grain, item) ||
      item.locationId !== grain.locationId
    ) {
      continue;
    }

    assertNonNegativeInteger(item.quantity, "quantity");

    const order = orders.get(
      identityKey(item.organizationId, item.storeId, item.orderId),
    );

    if (order === undefined || !SOLD_ORDER_STATUSES.has(order.status)) {
      continue;
    }

    const metricDate = storeLocalDate(order.orderedAt, input.timeZone);

    if (metricDate > input.forecastAsOf || metricDate < inputStartDate) {
      continue;
    }

    const bucket = buckets.get(metricDate);

    if (bucket === undefined) {
      continue;
    }

    bucket.soldUnits += item.quantity;
  }

  for (const refund of returnRefunds) {
    if (
      !sameGrain(grain, refund) ||
      refund.locationId !== grain.locationId ||
      refund.returnedQuantity === null
    ) {
      continue;
    }

    assertNonNegativeInteger(
      refund.returnedQuantity,
      "returnedQuantity",
    );

    const metricDate = storeLocalDate(refund.occurredAt, input.timeZone);

    if (metricDate > input.forecastAsOf || metricDate < inputStartDate) {
      continue;
    }

    const bucket = buckets.get(metricDate);

    if (bucket === undefined) {
      continue;
    }

    bucket.returnedUnits += refund.returnedQuantity;
  }

  for (const snapshot of inventorySnapshots) {
    if (
      !sameGrain(grain, snapshot) ||
      snapshot.locationId !== grain.locationId
    ) {
      continue;
    }

    if (
      snapshot.availableQuantity === null ||
      snapshot.availableQuantity < 0
    ) {
      continue;
    }

    assertNonNegativeInteger(
      snapshot.availableQuantity,
      "availableQuantity",
    );

    const metricDate = storeLocalDate(snapshot.observedAt, input.timeZone);

    if (metricDate > input.forecastAsOf || metricDate < inputStartDate) {
      continue;
    }

    const bucket = buckets.get(metricDate);

    if (bucket === undefined) {
      continue;
    }

    const replaces =
      bucket.snapshotObservedAt === null ||
      snapshot.observedAt > bucket.snapshotObservedAt ||
      (snapshot.observedAt === bucket.snapshotObservedAt &&
        snapshot.id > (bucket.snapshotId ?? ""));

    if (!replaces) {
      continue;
    }

    bucket.availableQuantity = snapshot.availableQuantity;
    bucket.snapshotObservedAt = snapshot.observedAt;
    bucket.snapshotId = snapshot.id;
  }

  const facts: ForecastDailyFact[] = [];

  for (const [date, bucket] of [...buckets.entries()].sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    facts.push({
      organizationId: grain.organizationId,
      storeId: grain.storeId,
      locationId: grain.locationId,
      variantId: grain.variantId,
      date,
      unitsSold: Math.max(0, bucket.soldUnits - bucket.returnedUnits),
      availability: availabilityFromQuantity(bucket.availableQuantity),
      promotionState: "unknown",
      dataComplete: trustedComplete.has(date),
    });
  }

  return {
    grain,
    forecastAsOf: input.forecastAsOf,
    lookbackDays,
    facts,
    leadTimeDays:
      input.leadTimeDays === undefined ? null : input.leadTimeDays,
    reviewPeriodDays:
      input.reviewPeriodDays === undefined
        ? null
        : input.reviewPeriodDays,
  };
}
