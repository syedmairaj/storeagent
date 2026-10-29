import {
  classifyDemandObservation,
} from "./stockout-censoring";

import {
  classifyPromotionObservation,
} from "./promotion-treatment";

import type {
  ForecastWindowDays,
  InventoryAvailabilityState,
  PromotionState,
  WeightedDemandWindowInput,
} from "./types";

/**
 * Canonical store-local daily fact for one forecast grain.
 *
 * Dates are calendar YYYY-MM-DD already resolved to the store's
 * local business calendar by the caller. This module does not
 * interpret timezones or provider payloads.
 */
export interface ForecastDailyFact {
  organizationId: string;
  storeId: string;
  locationId: string;
  variantId: string;
  date: string;
  unitsSold: number;
  availability: InventoryAvailabilityState;
  promotionState: PromotionState;
  dataComplete: boolean;
}

export type ForecastDayDisposition =
  | "baseline_usable"
  | "stockout_censored"
  | "promotion_excluded"
  | "unusable";

export type ForecastDayReasonCode =
  | "STOCKOUT_CENSORED"
  | "AVAILABILITY_UNKNOWN"
  | "DATA_INCOMPLETE"
  | "PROMOTION_EXCLUDED"
  | "PROMOTION_STATE_UNKNOWN"
  | "PROMOTION_DATA_INCOMPLETE"
  | "MISSING_CALENDAR_DAY";

export interface ClassifiedForecastDay {
  date: string;
  unitsSold: number;
  disposition: ForecastDayDisposition;
  reasonCode: ForecastDayReasonCode | null;
}

export interface ForecastSeriesQuality {
  totalDays: number;
  baselineUsableDays: number;
  censoredDays: number;
  promotionExcludedDays: number;
  unusableDays: number;
}

export interface ForecastGrain {
  organizationId: string;
  storeId: string;
  locationId: string;
  variantId: string;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const FORECAST_WINDOWS_V1: readonly ForecastWindowDays[] = [
  7,
  14,
  30,
  90,
];

export const TREND_COMPARISON_DAYS_V1 = 7;

function assertIdentity(
  value: string,
  field: string,
): void {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${field} is required.`);
  }
}

function formatUtcCalendarDate(
  year: number,
  monthIndex: number,
  day: number,
): string {
  const utc = new Date(Date.UTC(year, monthIndex, day));

  return utc.toISOString().slice(0, 10);
}

/**
 * Accepts only real Gregorian YYYY-MM-DD values. Pattern matches are
 * round-tripped through UTC calendar arithmetic so 2026-02-30 and
 * 2026-13-40 fail closed instead of normalizing.
 */
export function assertForecastDate(
  value: string,
  field: string,
): void {
  if (!DATE_PATTERN.test(value)) {
    throw new Error(
      `${field} must be a YYYY-MM-DD store-local date.`,
    );
  }

  const [year, month, day] = value.split("-").map(Number);
  const roundTrip = formatUtcCalendarDate(year, month - 1, day);

  if (roundTrip !== value) {
    throw new Error(
      `${field} must be a real Gregorian YYYY-MM-DD date.`,
    );
  }
}

export function shiftForecastDate(
  date: string,
  dayOffset: number,
): string {
  assertForecastDate(date, "date");

  if (!Number.isInteger(dayOffset)) {
    throw new Error("dayOffset must be an integer.");
  }

  const [year, month, day] = date.split("-").map(Number);

  return formatUtcCalendarDate(year, month - 1, day + dayOffset);
}

/**
 * Combines stockout-censoring-v1 then promotion-treatment-v1.
 *
 * Only stockout-usable days are promotion-classified. Censored and
 * stockout-unusable days keep their stockout disposition.
 */
export function classifyForecastDay(
  input: {
    date: string;
    unitsSold: number;
    availability: InventoryAvailabilityState;
    promotionState: PromotionState;
    dataComplete: boolean;
  },
): ClassifiedForecastDay {
  const stockout = classifyDemandObservation({
    date: input.date,
    unitsSold: input.unitsSold,
    availability: input.availability,
    dataComplete: input.dataComplete,
  });

  if (stockout.disposition === "stockout_censored") {
    return {
      date: stockout.date,
      unitsSold: stockout.unitsSold,
      disposition: "stockout_censored",
      reasonCode: "STOCKOUT_CENSORED",
    };
  }

  if (stockout.disposition === "unusable") {
    return {
      date: stockout.date,
      unitsSold: stockout.unitsSold,
      disposition: "unusable",
      reasonCode:
        stockout.reasonCode === "AVAILABILITY_UNKNOWN"
          ? "AVAILABILITY_UNKNOWN"
          : "DATA_INCOMPLETE",
    };
  }

  const promotion = classifyPromotionObservation({
    date: input.date,
    unitsSold: input.unitsSold,
    promotionState: input.promotionState,
    dataComplete: input.dataComplete,
  });

  if (promotion.disposition === "baseline_usable") {
    return {
      date: promotion.date,
      unitsSold: promotion.unitsSold,
      disposition: "baseline_usable",
      reasonCode: null,
    };
  }

  if (promotion.disposition === "promotion_excluded") {
    return {
      date: promotion.date,
      unitsSold: promotion.unitsSold,
      disposition: "promotion_excluded",
      reasonCode: "PROMOTION_EXCLUDED",
    };
  }

  return {
    date: promotion.date,
    unitsSold: promotion.unitsSold,
    disposition: "unusable",
    reasonCode:
      promotion.reasonCode === "PROMOTION_STATE_UNKNOWN"
        ? "PROMOTION_STATE_UNKNOWN"
        : "PROMOTION_DATA_INCOMPLETE",
  };
}

/**
 * Builds a dense store-local calendar for the lookback ending on
 * forecastAsOf. Facts belonging to other grains are ignored.
 * Absent calendar days fail closed as incomplete/unknown.
 */
export function buildClassifiedForecastSeries(input: {
  grain: ForecastGrain;
  forecastAsOf: string;
  lookbackDays: number;
  facts: readonly ForecastDailyFact[];
}): {
  days: ClassifiedForecastDay[];
  quality: ForecastSeriesQuality;
  inputStartDate: string;
  inputEndDate: string;
} {
  const { grain } = input;

  assertIdentity(grain.organizationId, "organizationId");
  assertIdentity(grain.storeId, "storeId");
  assertIdentity(grain.locationId, "locationId");
  assertIdentity(grain.variantId, "variantId");
  assertForecastDate(input.forecastAsOf, "forecastAsOf");

  if (
    !Number.isInteger(input.lookbackDays) ||
    input.lookbackDays < 1 ||
    input.lookbackDays > 365
  ) {
    throw new Error(
      "lookbackDays must be an integer from 1 to 365.",
    );
  }

  const inputEndDate = input.forecastAsOf;
  const inputStartDate = shiftForecastDate(
    input.forecastAsOf,
    -(input.lookbackDays - 1),
  );

  const byDate = new Map<string, ForecastDailyFact>();

  for (const fact of input.facts) {
    assertForecastDate(fact.date, "fact.date");

    if (
      fact.organizationId !== grain.organizationId ||
      fact.storeId !== grain.storeId ||
      fact.locationId !== grain.locationId ||
      fact.variantId !== grain.variantId
    ) {
      continue;
    }

    if (
      fact.date < inputStartDate ||
      fact.date > inputEndDate
    ) {
      continue;
    }

    if (byDate.has(fact.date)) {
      throw new Error(
        `Duplicate forecast fact for ${fact.date}.`,
      );
    }

    byDate.set(fact.date, fact);
  }

  const days: ClassifiedForecastDay[] = [];

  for (let offset = 0; offset < input.lookbackDays; offset += 1) {
    const date = shiftForecastDate(inputStartDate, offset);
    const fact = byDate.get(date);

    if (fact === undefined) {
      days.push({
        date,
        unitsSold: 0,
        disposition: "unusable",
        reasonCode: "MISSING_CALENDAR_DAY",
      });
      continue;
    }

    days.push(
      classifyForecastDay({
        date: fact.date,
        unitsSold: fact.unitsSold,
        availability: fact.availability,
        promotionState: fact.promotionState,
        dataComplete: fact.dataComplete,
      }),
    );
  }

  let baselineUsableDays = 0;
  let censoredDays = 0;
  let promotionExcludedDays = 0;
  let unusableDays = 0;

  for (const day of days) {
    switch (day.disposition) {
      case "baseline_usable":
        baselineUsableDays += 1;
        break;
      case "stockout_censored":
        censoredDays += 1;
        break;
      case "promotion_excluded":
        promotionExcludedDays += 1;
        break;
      case "unusable":
        unusableDays += 1;
        break;
    }
  }

  return {
    days,
    quality: {
      totalDays: days.length,
      baselineUsableDays,
      censoredDays,
      promotionExcludedDays,
      unusableDays,
    },
    inputStartDate,
    inputEndDate,
  };
}

function windowDemand(
  days: readonly ClassifiedForecastDay[],
  forecastAsOf: string,
  windowDays: ForecastWindowDays,
): WeightedDemandWindowInput {
  const start = shiftForecastDate(
    forecastAsOf,
    -(windowDays - 1),
  );

  let usableDays = 0;
  let unitsSold = 0;

  for (const day of days) {
    if (day.date < start || day.date > forecastAsOf) {
      continue;
    }

    if (day.disposition !== "baseline_usable") {
      continue;
    }

    usableDays += 1;
    unitsSold += day.unitsSold;
  }

  if (usableDays === 0) {
    return {
      windowDays,
      dailyDemand: null,
      usableDays: 0,
    };
  }

  return {
    windowDays,
    dailyDemand: unitsSold / usableDays,
    usableDays,
  };
}

export function buildWeightedDemandWindows(
  days: readonly ClassifiedForecastDay[],
  forecastAsOf: string,
): WeightedDemandWindowInput[] {
  return FORECAST_WINDOWS_V1.map((windowDays) =>
    windowDemand(days, forecastAsOf, windowDays),
  );
}

/**
 * Recent vs prior non-overlapping 7-day windows ending on forecastAsOf.
 * Eligible only when both windows have at least one baseline-usable day.
 */
export function buildTrendComparisonDemand(
  days: readonly ClassifiedForecastDay[],
  forecastAsOf: string,
): {
  eligible: boolean;
  recentDailyDemand: number | null;
  priorDailyDemand: number | null;
} {
  const recentStart = shiftForecastDate(
    forecastAsOf,
    -(TREND_COMPARISON_DAYS_V1 - 1),
  );
  const priorEnd = shiftForecastDate(forecastAsOf, -TREND_COMPARISON_DAYS_V1);
  const priorStart = shiftForecastDate(
    priorEnd,
    -(TREND_COMPARISON_DAYS_V1 - 1),
  );

  let recentUsable = 0;
  let recentUnits = 0;
  let priorUsable = 0;
  let priorUnits = 0;

  for (const day of days) {
    if (day.disposition !== "baseline_usable") {
      continue;
    }

    if (day.date >= recentStart && day.date <= forecastAsOf) {
      recentUsable += 1;
      recentUnits += day.unitsSold;
      continue;
    }

    if (day.date >= priorStart && day.date <= priorEnd) {
      priorUsable += 1;
      priorUnits += day.unitsSold;
    }
  }

  if (recentUsable === 0 || priorUsable === 0) {
    return {
      eligible: false,
      recentDailyDemand: null,
      priorDailyDemand: null,
    };
  }

  return {
    eligible: true,
    recentDailyDemand: recentUnits / recentUsable,
    priorDailyDemand: priorUnits / priorUsable,
  };
}
