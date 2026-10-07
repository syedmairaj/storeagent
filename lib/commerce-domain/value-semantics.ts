import type {
  DecimalString,
  UnitQuantity,
} from "./types";

const DECIMAL_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

export function isDecimalString(value: string): value is DecimalString {
  return DECIMAL_PATTERN.test(value);
}

export function isNonNegativeDecimalString(
  value: DecimalString | null,
): boolean {
  if (value === null || !isDecimalString(value)) {
    return false;
  }

  return !value.startsWith("-") || Number(value) === 0;
}

export function isWholeUnitQuantity(
  value: number,
): value is UnitQuantity {
  return Number.isInteger(value);
}

export function isNonNegativeWholeUnitQuantity(
  value: number,
): value is UnitQuantity {
  return Number.isInteger(value) && value >= 0;
}

export function hasKnownValue<T>(
  value: T | null | undefined,
): value is T {
  return value !== null && value !== undefined;
}

export function ratioToPercentageLabel(
  ratio: number,
  fractionDigits = 0,
): string {
  if (!Number.isFinite(ratio)) {
    throw new Error("Ratio must be finite.");
  }

  return `${(ratio * 100).toFixed(fractionDigits)}%`;
}
