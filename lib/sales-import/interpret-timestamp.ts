import { normalizeProviderTimestamp } from "@/lib/providers/timestamps";

const EXPLICIT_ZONE =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/i;

const NAIVE_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/;

function assertIanaTimeZone(timeZone: string): void {
  if (
    timeZone !== "UTC" &&
    timeZone !== "Etc/UTC" &&
    !Intl.supportedValuesOf("timeZone").includes(timeZone)
  ) {
    throw new Error("Store timezone must be a recognized IANA timezone.");
  }
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

/**
 * Format a UTC instant as an ISO string with the store's offset at that instant.
 */
function formatWithOffset(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);

  const read = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";

  const zoneRaw = read("timeZoneName"); // GMT, GMT+5:30, UTC, etc.
  let offset = "Z";
  if (zoneRaw === "UTC" || zoneRaw === "GMT") {
    offset = "Z";
  } else {
    const match = zoneRaw.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/i);
    if (!match) {
      throw new Error("Unable to resolve store timezone offset.");
    }
    const sign = match[1]!;
    const hours = pad(Number(match[2]));
    const minutes = pad(Number(match[3] ?? "0"));
    offset = `${sign}${hours}:${minutes}`;
  }

  return `${read("year")}-${read("month")}-${read("day")}T${read("hour")}:${read("minute")}:${read("second")}${offset}`;
}

/**
 * Find the UTC instant whose wall-clock in `timeZone` matches the local parts.
 */
function localPartsToUtcInstant(input: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  timeZone: string;
}): Date {
  // Initial guess: treat local as UTC, then correct by observed offset.
  let guess = Date.UTC(
    input.year,
    input.month - 1,
    input.day,
    input.hour,
    input.minute,
    input.second,
  );

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const asDate = new Date(guess);
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: input.timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(asDate);

    const read = (type: Intl.DateTimeFormatPartTypes): number =>
      Number(parts.find((part) => part.type === type)?.value ?? "NaN");

    const got = {
      year: read("year"),
      month: read("month"),
      day: read("day"),
      hour: read("hour"),
      minute: read("minute"),
      second: read("second"),
    };

    const desiredAsUtc = Date.UTC(
      input.year,
      input.month - 1,
      input.day,
      input.hour,
      input.minute,
      input.second,
    );
    const gotAsUtc = Date.UTC(
      got.year,
      got.month - 1,
      got.day,
      got.hour,
      got.minute,
      got.second,
    );
    const delta = desiredAsUtc - gotAsUtc;
    if (delta === 0) {
      return asDate;
    }
    guess += delta;
  }

  throw new Error("Unable to interpret store-local timestamp.");
}

/** Reject ordered_at more than one day ahead of confirmation time. */
export const MERCHANT_SALES_MAX_FUTURE_MS = 24 * 60 * 60 * 1000;

/** Reject ordered_at earlier than this UTC year (fail closed on nonsense history). */
export const MERCHANT_SALES_MIN_ORDER_YEAR = 2000;

function assertSalesTimestampBounds(isoValue: string, nowMs = Date.now()): void {
  const instant = new Date(isoValue);
  if (Number.isNaN(instant.getTime())) {
    throw new Error("ordered_at is invalid.");
  }

  if (instant.getUTCFullYear() < MERCHANT_SALES_MIN_ORDER_YEAR) {
    throw new Error(
      `ordered_at must be on or after ${MERCHANT_SALES_MIN_ORDER_YEAR}-01-01.`,
    );
  }

  if (instant.getTime() - nowMs > MERCHANT_SALES_MAX_FUTURE_MS) {
    throw new Error(
      "ordered_at cannot be more than 24 hours in the future.",
    );
  }
}

/**
 * Interpret merchant ordered_at as an ISO timestamp with explicit offset.
 *
 * Policy:
 * - Explicit-offset / Z timestamps are accepted as absolute instants.
 * - Naive values use the authorized store IANA timezone (fail closed otherwise).
 * - Ambiguous DST fall-back windows require an explicit offset.
 * - Timestamps >24h in the future, or before year 2000, are rejected.
 */
export function interpretMerchantSalesTimestamp(
  raw: string,
  timeZone: string,
  nowMs = Date.now(),
): string {
  const value = raw.trim();
  if (!value) {
    throw new Error("ordered_at is required.");
  }

  assertIanaTimeZone(timeZone);

  let isoValue: string;

  if (EXPLICIT_ZONE.test(value)) {
    isoValue = normalizeProviderTimestamp(value).value;
  } else {
    // Allow space-separated explicit offset forms by normalizing to T.
    const spacedZone = value.match(
      /^(\d{4}-\d{2}-\d{2})[ ](\d{2}:\d{2}:\d{2}(?:\.\d+)?)(Z|[+-]\d{2}:\d{2})$/i,
    );
    if (spacedZone) {
      isoValue = normalizeProviderTimestamp(
        `${spacedZone[1]}T${spacedZone[2]}${spacedZone[3]}`,
      ).value;
    } else {
      const naive = value.match(NAIVE_DATE_TIME);
      if (!naive) {
        throw new Error(
          "ordered_at must be YYYY-MM-DD[ HH:mm[:ss]] in the store timezone, or an ISO timestamp with an explicit timezone.",
        );
      }

      const year = Number(naive[1]);
      const month = Number(naive[2]);
      const day = Number(naive[3]);
      const hour = Number(naive[4] ?? "0");
      const minute = Number(naive[5] ?? "0");
      const second = Number(naive[6] ?? "0");

      const targetLocal = `${pad(year, 4)}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:${pad(second)}`;
      const instant = localPartsToUtcInstant({
        year,
        month,
        day,
        hour,
        minute,
        second,
        timeZone,
      });

      const isoCandidate = formatWithOffset(instant, timeZone);
      if (isoCandidate.slice(0, 19) !== targetLocal) {
        throw new Error(
          "ordered_at does not exist in this store timezone (DST gap). Use an ISO timestamp with an explicit timezone offset.",
        );
      }

      // Detect ambiguous civil times (DST fall-back) by probing ±1 hour.
      const earlier = new Date(instant.getTime() - 60 * 60 * 1000);
      const later = new Date(instant.getTime() + 60 * 60 * 1000);
      const earlierLocal = formatWithOffset(earlier, timeZone).slice(0, 19);
      const laterLocal = formatWithOffset(later, timeZone).slice(0, 19);
      if (earlierLocal === targetLocal || laterLocal === targetLocal) {
        throw new Error(
          "ordered_at is ambiguous in this store timezone (DST overlap). Use an ISO timestamp with an explicit timezone offset.",
        );
      }

      isoValue = isoCandidate;
    }
  }

  assertSalesTimestampBounds(isoValue, nowMs);
  return isoValue;
}
