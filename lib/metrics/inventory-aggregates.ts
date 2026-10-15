import type { UnitQuantity } from "@/lib/commerce-domain/types";

import {
  calculateDaysOfStock,
  calculateDemandTrend,
  calculateInventoryAge,
  calculateSafetyStock,
  calculateReorderPoint,
  calculateSalesVelocity,
  calculateSellThrough,
  calculateTargetStock,
} from "./inventory-math";
import type { DemandTrend, MetricReasonCode } from "./types";

export interface InventorySnapshotFact {
  id: string;
  organizationId: string;
  storeId: string;
  locationId: string;
  variantId: string;
  observedAt: string;
  availableQuantity: UnitQuantity | null;
}

export interface InventoryDemandDay {
  metricDate: string;
  unitsSold: number;
  returnedUnits: number;
  eligible: boolean;
}

/**
 * Already computed M5.3 demand. This module does not recompute it.
 */
export interface InventoryDemandFacts {
  netUnitsSold: number;
  salesVelocity30d: number | null;
  days: readonly InventoryDemandDay[];
}

export interface InventoryPlanningSettings {
  safetyStockDays: number | null;
  leadTimeDays: number | null;
  reviewPeriodDays: number | null;
}

export interface InventoryAggregateInput {
  organizationId: string;
  storeId: string;
  locationId: string;
  variantId: string;
  metricDate: string;
  timeZone: string;
  snapshots: readonly InventorySnapshotFact[];
  demand: InventoryDemandFacts;
  planning?: InventoryPlanningSettings;
}

export interface InventoryAggregateResult {
  availableQuantity: number | null;
  eligibleIncomingQuantity: null;
  eligibleIncomingReasonCode: "INCOMING_STATE_UNKNOWN";
  inventoryPosition: null;
  sellThroughRate: number | null;
  sellThroughReasonCode: "SELL_THROUGH_DENOMINATOR_ZERO" | null;
  daysOfStock: number | null;
  daysOfStockReasonCode: MetricReasonCode | null;
  safetyStock: number | null;
  safetyStockReasonCode: MetricReasonCode | null;
  reorderPoint: number | null;
  reorderPointReasonCode: MetricReasonCode | null;
  targetStock: number | null;
  targetStockReasonCode: MetricReasonCode | null;
  demandTrend: DemandTrend | "unknown";
  demandTrendReasonCode: MetricReasonCode | null;
  inventoryAgeDays: null;
  inventoryAgeQuality: "unavailable";
  inventoryAgeReasonCode: "INVENTORY_AGE_UNKNOWN";
}

/**
 * M5.4 inventory metrics for one location grain.
 * Reads trusted inputs. Does not persist them.
 */
export function aggregateInventoryMetrics(
  input: InventoryAggregateInput,
): InventoryAggregateResult {
  assertIanaTimeZone(input.timeZone);
  assertMetricDate(input.metricDate);
  assertIdentity(input.organizationId, "organizationId");
  assertIdentity(input.storeId, "storeId");
  assertIdentity(input.locationId, "locationId");
  assertIdentity(input.variantId, "variantId");
  assertNonNegativeInteger(input.demand.netUnitsSold, "netUnitsSold");

  const endingAvailable = endingAvailableQuantity(input);
  const unitsAvailableForSale =
    endingAvailable === null
      ? null
      : input.demand.netUnitsSold + endingAvailable;
  const sellThrough = sellThroughFromUnits(
    input.demand.netUnitsSold,
    unitsAvailableForSale,
  );
  const daysOfStock = daysOfStockFromVelocity(
    endingAvailable,
    input.demand.salesVelocity30d,
  );
  const planning = input.planning ?? {
    safetyStockDays: null,
    leadTimeDays: null,
    reviewPeriodDays: null,
  };
  const safetyStock = calculateSafetyStock({
    dailyDemand: input.demand.salesVelocity30d,
    safetyStockDays: planning.safetyStockDays,
  });
  const reorderPoint = calculateReorderPoint({
    dailyDemand: input.demand.salesVelocity30d,
    leadTimeDays: planning.leadTimeDays,
    safetyStockUnits: safetyStock.value,
  });
  const targetStock = calculateTargetStock({
    dailyDemand: input.demand.salesVelocity30d,
    leadTimeDays: planning.leadTimeDays,
    reviewPeriodDays: planning.reviewPeriodDays,
    safetyStockUnits: safetyStock.value,
  });
  const trend = demandTrend(input);
  const age = calculateInventoryAge({
    exactAgeDays: null,
    estimatedAgeDays: null,
  });

  if (
    age.value !== null ||
    age.quality !== "unavailable" ||
    age.reasonCode !== "INVENTORY_AGE_UNKNOWN"
  ) {
    throw new Error(
      "inventory age without receipt history must be unavailable.",
    );
  }

  return {
    availableQuantity: endingAvailable,
    eligibleIncomingQuantity: null,
    eligibleIncomingReasonCode: "INCOMING_STATE_UNKNOWN",
    inventoryPosition: null,
    sellThroughRate: sellThrough.rate,
    sellThroughReasonCode: sellThrough.reasonCode,
    daysOfStock: daysOfStock.value,
    daysOfStockReasonCode: daysOfStock.reasonCode,
    safetyStock: safetyStock.value,
    safetyStockReasonCode: safetyStock.reasonCode,
    reorderPoint: reorderPoint.value,
    reorderPointReasonCode: reorderPoint.reasonCode,
    targetStock: targetStock.value,
    targetStockReasonCode: targetStock.reasonCode,
    demandTrend: trend.value ?? "unknown",
    demandTrendReasonCode: trend.reasonCode,
    inventoryAgeDays: null,
    inventoryAgeQuality: age.quality,
    inventoryAgeReasonCode: "INVENTORY_AGE_UNKNOWN",
  };
}

/**
 * Null rate and null reason when net units exceed units available for sale.
 * calculateSellThrough is not called for that case.
 */
export function sellThroughFromUnits(
  netUnitsSold: number,
  unitsAvailableForSale: number | null,
): {
  rate: number | null;
  reasonCode: "SELL_THROUGH_DENOMINATOR_ZERO" | null;
} {
  if (unitsAvailableForSale === null) {
    return {
      rate: null,
      reasonCode: null,
    };
  }

  assertNonNegativeInteger(netUnitsSold, "netUnitsSold");
  assertNonNegativeInteger(
    unitsAvailableForSale,
    "unitsAvailableForSale",
  );

  if (netUnitsSold > unitsAvailableForSale) {
    return {
      rate: null,
      reasonCode: null,
    };
  }

  const result = calculateSellThrough({
    unitsSold: netUnitsSold,
    unitsAvailableForSale,
  });

  if (
    result.reasonCode !== null &&
    result.reasonCode !== "SELL_THROUGH_DENOMINATOR_ZERO"
  ) {
    throw new Error("sell-through returned an unexpected reason.");
  }

  return {
    rate: result.value,
    reasonCode: result.reasonCode,
  };
}

function daysOfStockFromVelocity(
  availableQuantity: number | null,
  salesVelocity30d: number | null,
) {
  if (salesVelocity30d === null) {
    return {
      value: null,
      reasonCode: "DEMAND_UNKNOWN" as const,
    };
  }

  if (salesVelocity30d === 0) {
    return {
      value: null,
      reasonCode: "ZERO_DEMAND" as const,
    };
  }

  return calculateDaysOfStock({
    availableQuantity,
    dailyDemand: salesVelocity30d,
  });
}

function endingAvailableQuantity(
  input: InventoryAggregateInput,
): number | null {
  let selected: {
    observedAt: number;
    id: string;
    quantity: number;
  } | null = null;

  for (const snapshot of input.snapshots) {
    if (!sameGrain(input, snapshot)) {
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

    if (
      storeLocalDate(snapshot.observedAt, input.timeZone) !==
      input.metricDate
    ) {
      continue;
    }

    const observedAt = new Date(snapshot.observedAt).getTime();

    if (Number.isNaN(observedAt)) {
      throw new Error(
        "commercial timestamp must be a valid UTC instant.",
      );
    }

    if (
      selected === null ||
      observedAt > selected.observedAt ||
      (observedAt === selected.observedAt && snapshot.id > selected.id)
    ) {
      selected = {
        observedAt,
        id: snapshot.id,
        quantity: snapshot.availableQuantity,
      };
    }
  }

  return selected === null ? null : selected.quantity;
}

function demandTrend(input: InventoryAggregateInput) {
  const recent = windowDemand(input, 0, 7);
  const prior = windowDemand(input, 7, 7);

  return calculateDemandTrend({
    recentDailyDemand: recent,
    priorDailyDemand: prior,
  });
}

function windowDemand(
  input: InventoryAggregateInput,
  daysBeforeEnd: number,
  windowDays: number,
): number | null {
  const endOffset = daysBeforeEnd;
  const startOffset = daysBeforeEnd + windowDays - 1;
  const end = shiftMetricDate(input.metricDate, -endOffset);
  const start = shiftMetricDate(input.metricDate, -startOffset);
  let soldUnits = 0;
  let returnedUnits = 0;
  let eligibleDays = 0;

  for (const day of input.demand.days) {
    if (day.metricDate < start || day.metricDate > end) {
      continue;
    }

    assertNonNegativeInteger(day.unitsSold, "unitsSold");
    assertNonNegativeInteger(day.returnedUnits, "returnedUnits");
    soldUnits += day.unitsSold;
    returnedUnits += day.returnedUnits;

    if (day.eligible) {
      eligibleDays += 1;
    }
  }

  return calculateSalesVelocity({
    soldUnits,
    cancelledUnits: 0,
    returnedUnits,
    eligibleDays,
  }).value;
}

function sameGrain(
  input: InventoryAggregateInput,
  row: {
    organizationId: string;
    storeId: string;
    locationId: string;
    variantId: string;
  },
): boolean {
  return (
    row.organizationId === input.organizationId &&
    row.storeId === input.storeId &&
    row.locationId === input.locationId &&
    row.variantId === input.variantId
  );
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

function shiftMetricDate(metricDate: string, dayOffset: number): string {
  const [year, month, day] = metricDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + dayOffset));
  const monthText = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dayText = String(date.getUTCDate()).padStart(2, "0");

  return `${date.getUTCFullYear()}-${monthText}-${dayText}`;
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
