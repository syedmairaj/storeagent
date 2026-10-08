import type {
  NormalizedProviderTimestamp,
} from "./types";

const EXPLICIT_ZONE_DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/i;

function daysInMonth(
  year: number,
  month: number,
): number {
  return new Date(
    Date.UTC(year, month, 0),
  ).getUTCDate();
}

function validateCalendarParts(
  match: RegExpMatchArray,
): void {
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month) ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    throw new Error(
      "Provider timestamp is invalid.",
    );
  }
}

function validateTimezoneOffset(
  zone: string,
): void {
  if (zone.toUpperCase() === "Z") {
    return;
  }

  const hours = Number(
    zone.slice(1, 3),
  );

  const minutes = Number(
    zone.slice(4, 6),
  );

  if (
    hours > 23 ||
    minutes > 59
  ) {
    throw new Error(
      "Provider timestamp timezone offset is invalid.",
    );
  }
}

export function normalizeProviderTimestamp(
  value: string,
): NormalizedProviderTimestamp {
  const sourceValue = value.trim();

  if (!sourceValue) {
    throw new Error(
      "Provider timestamp must not be empty.",
    );
  }

  const match =
    sourceValue.match(
      EXPLICIT_ZONE_DATE_TIME,
    );

  if (!match) {
    throw new Error(
      "Provider timestamp must include an explicit timezone.",
    );
  }

  validateCalendarParts(match);
  validateTimezoneOffset(match[8]);

  const parsed = new Date(
    sourceValue,
  );

  if (
    Number.isNaN(parsed.getTime())
  ) {
    throw new Error(
      "Provider timestamp is invalid.",
    );
  }

  return {
    value: parsed.toISOString(),
    sourceValue,
  };
}

export function normalizeOptionalProviderTimestamp(
  value: string | null,
): NormalizedProviderTimestamp | null {
  if (value === null) {
    return null;
  }

  if (!value.trim()) {
    return null;
  }

  return normalizeProviderTimestamp(
    value,
  );
}
