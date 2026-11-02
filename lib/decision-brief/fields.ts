/**
 * Explicit Field presence helpers for decision-brief-v1.
 * Known zero stays known; null / non-finite → unknown (never invent).
 */

import type {
  Field,
  Known,
  NotApplicable,
  Unknown,
} from "@/lib/decision-brief/types";

export function known<T>(
  value: T,
): Known<T> {
  return {
    state: "known",
    value,
  };
}

export function unknown(
  reasonCode?: string,
): Unknown {
  if (
    reasonCode === undefined
  ) {
    return {
      state: "unknown",
    };
  }

  return {
    state: "unknown",
    reasonCode,
  };
}

export function notApplicable(
  reasonCode?: string,
): NotApplicable {
  if (
    reasonCode === undefined
  ) {
    return {
      state: "not_applicable",
    };
  }

  return {
    state: "not_applicable",
    reasonCode,
  };
}

export function isKnown<T>(
  field: Field<T>,
): field is Known<T> {
  return field.state === "known";
}

export function isUnknown(
  field: Field<unknown>,
): field is Unknown {
  return field.state === "unknown";
}

export function isNotApplicable(
  field: Field<unknown>,
): field is NotApplicable {
  return field.state === "not_applicable";
}

/**
 * Map nullable fixture/engine numbers to Field.
 * Finite values (including 0) become known; null/undefined/non-finite → unknown.
 */
export function numberFieldFromNullable(
  value: number | null | undefined,
  reasonCode = "value_unknown",
): Field<number> {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(value)
  ) {
    return unknown(reasonCode);
  }

  return known(value);
}

export function stringFieldFromNullable(
  value: string | null | undefined,
  reasonCode = "value_unknown",
): Field<string> {
  if (
    value === null ||
    value === undefined ||
    value.trim().length === 0
  ) {
    return unknown(reasonCode);
  }

  return known(value);
}

export function fieldDisplay(
  field: Field<number | string>,
  formatKnown?: (
    value: number | string,
  ) => string,
): string {
  if (
    field.state !== "known"
  ) {
    return "Unknown";
  }

  if (
    formatKnown
  ) {
    return formatKnown(field.value);
  }

  return String(field.value);
}

export function knownNumberOrNull(
  field: Field<number>,
): number | null {
  if (
    field.state !== "known"
  ) {
    return null;
  }

  return field.value;
}
