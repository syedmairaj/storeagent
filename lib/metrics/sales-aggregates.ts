import type { OrderStatus, UnitQuantity } from "@/lib/commerce-domain/types";

import { calculateSalesVelocity } from "./inventory-math";
import type { MetricReasonCode } from "./types";

const SOLD_ORDER_STATUSES = new Set<OrderStatus>([
  "completed",
  "refunded",
  "partially_refunded",
]);

export const SALES_VELOCITY_WINDOW_DAYS = [7, 14, 30, 90] as const;

export type SalesVelocityWindowDays =
  (typeof SALES_VELOCITY_WINDOW_DAYS)[number];

export interface SalesAggregateOrder {
  id: string;
  organizationId: string;
  storeId: string;
  status: OrderStatus;
  orderedAt: string;
}

export interface SalesAggregateOrderItem {
  id: string;
  organizationId: string;
  storeId: string;
  orderId: string;
  variantId: string;
  locationId: string | null;
  quantity: UnitQuantity;
}

export interface SalesAggregateReturnRefund {
  id: string;
  organizationId: string;
  storeId: string;
  variantId: string;
  locationId: string | null;
  returnedQuantity: UnitQuantity | null;
  occurredAt: string;
}

export interface SalesAggregateInventorySnapshot {
  id: string;
  organizationId: string;
  storeId: string;
  locationId: string;
  variantId: string;
  observedAt: string;
  availableQuantity: UnitQuantity | null;
}

export interface SalesAggregateInput {
  organizationId: string;
  storeId: string;
  locationId: string;
  variantId: string;
  metricDate: string;
  timeZone: string;
  orders: readonly SalesAggregateOrder[];
  orderItems: readonly SalesAggregateOrderItem[];
  returnRefunds: readonly SalesAggregateReturnRefund[];
  inventorySnapshots: readonly SalesAggregateInventorySnapshot[];
}

export interface SalesDayAggregate {
  metricDate: string;
  unitsSold: number;
  returnedUnits: number;
  /**
   * Daily floor. This value is not an addend of window net demand.
   */
  netUnitsSold: number;
  eligible: boolean;
}

export interface SalesWindowAggregate {
  windowDays: SalesVelocityWindowDays;
  soldUnits: number;
  returnedUnits: number;
  eligibleDays: number;
  coverageRatio: number;
  velocity: number | null;
  reasonCode: Extract<MetricReasonCode, "NO_ELIGIBLE_DAYS"> | null;
}

export interface SalesAggregateResult {
  days: readonly SalesDayAggregate[];
  windows: Readonly<Record<SalesVelocityWindowDays, SalesWindowAggregate>>;
}

interface DayBucket {
  unitsSold: number;
  returnedUnits: number;
  eligible: boolean;
}

/**
 * M5.3 sales aggregates for one location grain.
 * Reads canonical rows. Does not persist them.
 */
export function aggregateSales(
  input: SalesAggregateInput,
): SalesAggregateResult {
  assertIanaTimeZone(input.timeZone);
  assertMetricDate(input.metricDate);
  assertIdentity(input.organizationId, "organizationId");
  assertIdentity(input.storeId, "storeId");
  assertIdentity(input.locationId, "locationId");
  assertIdentity(input.variantId, "variantId");

  const horizon = calendarDatesEnding(input.metricDate, 90);
  const horizonDates = new Set(horizon);
  const buckets = new Map<string, DayBucket>();

  for (const metricDate of horizon) {
    buckets.set(metricDate, {
      unitsSold: 0,
      returnedUnits: 0,
      eligible: false,
    });
  }

  const orders = new Map(
    canonicalRecords(
      input.orders,
      (left, right) =>
        left.status === right.status && left.orderedAt === right.orderedAt,
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
      left.quantity === right.quantity,
    "duplicate order item identity has conflicting evidence.",
  );
  const returnRefunds = canonicalRecords(
    input.returnRefunds,
    (left, right) =>
      left.variantId === right.variantId &&
      left.locationId === right.locationId &&
      left.returnedQuantity === right.returnedQuantity &&
      left.occurredAt === right.occurredAt,
    "duplicate return identity has conflicting evidence.",
  );

  for (const item of orderItems) {
    if (!sameGrain(input, item) || item.locationId !== input.locationId) {
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

    if (!horizonDates.has(metricDate)) {
      continue;
    }

    const bucket = buckets.get(metricDate);

    if (bucket === undefined) {
      continue;
    }

    bucket.unitsSold += item.quantity;
    bucket.eligible = true;
  }

  for (const refund of returnRefunds) {
    if (
      !sameGrain(input, refund) ||
      refund.locationId !== input.locationId ||
      refund.returnedQuantity === null
    ) {
      continue;
    }

    assertNonNegativeInteger(
      refund.returnedQuantity,
      "returnedQuantity",
    );

    const metricDate = storeLocalDate(refund.occurredAt, input.timeZone);

    if (!horizonDates.has(metricDate)) {
      continue;
    }

    const bucket = buckets.get(metricDate);

    if (bucket === undefined) {
      continue;
    }

    bucket.returnedUnits += refund.returnedQuantity;
    bucket.eligible = true;
  }

  for (const snapshot of input.inventorySnapshots) {
    if (!sameGrain(input, snapshot) || snapshot.locationId !== input.locationId) {
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

    if (!horizonDates.has(metricDate)) {
      continue;
    }

    const bucket = buckets.get(metricDate);

    if (bucket === undefined) {
      continue;
    }

    bucket.eligible = true;
  }

  const days = horizon.map((metricDate) => {
    const bucket = buckets.get(metricDate);

    if (bucket === undefined) {
      throw new Error("sales aggregate day bucket is missing.");
    }

    return {
      metricDate,
      unitsSold: bucket.unitsSold,
      returnedUnits: bucket.returnedUnits,
      netUnitsSold: Math.max(
        0,
        bucket.unitsSold - bucket.returnedUnits,
      ),
      eligible: bucket.eligible,
    };
  });

  const windows = {} as Record<
    SalesVelocityWindowDays,
    SalesWindowAggregate
  >;

  for (const windowDays of SALES_VELOCITY_WINDOW_DAYS) {
    const windowDates = new Set(horizon.slice(90 - windowDays));
    let soldUnits = 0;
    let returnedUnits = 0;
    let eligibleDays = 0;

    for (const day of days) {
      if (!windowDates.has(day.metricDate)) {
        continue;
      }

      soldUnits += day.unitsSold;
      returnedUnits += day.returnedUnits;

      if (day.eligible) {
        eligibleDays += 1;
      }
    }

    const velocity = calculateSalesVelocity({
      soldUnits,
      cancelledUnits: 0,
      returnedUnits,
      eligibleDays,
    });

    if (
      velocity.reasonCode !== null &&
      velocity.reasonCode !== "NO_ELIGIBLE_DAYS"
    ) {
      throw new Error("sales velocity returned an unexpected reason.");
    }

    windows[windowDays] = {
      windowDays,
      soldUnits,
      returnedUnits,
      eligibleDays,
      coverageRatio: eligibleDays / windowDays,
      velocity: velocity.value,
      reasonCode: velocity.reasonCode,
    };
  }

  return {
    days,
    windows,
  };
}

function canonicalRecords<
  T extends {
    id: string;
    organizationId: string;
    storeId: string;
  },
>(
  rows: readonly T[],
  sameEvidence: (left: T, right: T) => boolean,
  conflictMessage: string,
): readonly T[] {
  const byIdentity = new Map<string, T>();
  const unique: T[] = [];

  for (const row of rows) {
    const key = identityKey(
      row.organizationId,
      row.storeId,
      row.id,
    );
    const existing = byIdentity.get(key);

    if (existing === undefined) {
      byIdentity.set(key, row);
      unique.push(row);
      continue;
    }

    if (!sameEvidence(existing, row)) {
      throw new Error(conflictMessage);
    }
  }

  return unique;
}

function sameGrain(
  input: SalesAggregateInput,
  row: {
    organizationId: string;
    storeId: string;
    variantId: string;
  },
): boolean {
  return (
    row.organizationId === input.organizationId &&
    row.storeId === input.storeId &&
    row.variantId === input.variantId
  );
}

function identityKey(
  organizationId: string,
  storeId: string,
  id: string,
): string {
  return `${organizationId}\u0000${storeId}\u0000${id}`;
}

function assertIanaTimeZone(timeZone: string): void {
  // Node 22.23.3 omits UTC and Etc/UTC from supportedValuesOf("timeZone")
  // even though both are IANA zones and Intl can convert them.
  // Legacy abbreviations such as EST and GMT stay rejected.
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

function assertMetricDate(metricDate: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(metricDate)) {
    throw new Error("metricDate must be a YYYY-MM-DD calendar date.");
  }

  const [year, month, day] = metricDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error("metricDate must be a YYYY-MM-DD calendar date.");
  }
}

function assertIdentity(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new Error(`${field} is required.`);
  }
}

function assertNonNegativeInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer.`);
  }
}

function calendarDatesEnding(
  metricDate: string,
  windowDays: number,
): string[] {
  const [year, month, day] = metricDate.split("-").map(Number);
  const dates: string[] = [];

  for (let offset = windowDays - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(year, month - 1, day - offset));
    const monthText = String(date.getUTCMonth() + 1).padStart(2, "0");
    const dayText = String(date.getUTCDate()).padStart(2, "0");
    dates.push(`${date.getUTCFullYear()}-${monthText}-${dayText}`);
  }

  return dates;
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
