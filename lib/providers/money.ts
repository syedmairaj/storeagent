import type {
  CurrencyCode,
  DecimalString,
} from "@/lib/commerce-domain/types";

import type {
  NormalizedProviderMoney,
} from "./types";

const PLAIN_DECIMAL_PATTERN =
  /^-?\d+(?:\.\d+)?$/;

const CURRENCY_CODE_PATTERN =
  /^[A-Za-z]{3}$/;

function canonicalizeIntegerPart(
  value: string,
): string {
  const stripped =
    value.replace(/^0+(?=\d)/, "");

  return stripped || "0";
}

export function normalizeProviderDecimal(
  value: string,
): DecimalString {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(
      "Provider money amount must not be empty.",
    );
  }

  if (
    !PLAIN_DECIMAL_PATTERN.test(trimmed)
  ) {
    throw new Error(
      "Provider money amount must be a plain decimal string.",
    );
  }

  const negative =
    trimmed.startsWith("-");

  const unsigned =
    negative
      ? trimmed.slice(1)
      : trimmed;

  const [
    rawInteger,
    rawFraction,
  ] = unsigned.split(".");

  const integer =
    canonicalizeIntegerPart(
      rawInteger,
    );

  const fraction =
    rawFraction
      ?.replace(/0+$/, "");

  const magnitude =
    fraction
      ? `${integer}.${fraction}`
      : integer;

  const isZero =
    /^0(?:\.0+)?$/.test(
      magnitude,
    );

  return (
    negative && !isZero
      ? `-${magnitude}`
      : magnitude
  ) as DecimalString;
}

/**
 * Generic provider normalization deliberately rejects
 * JavaScript numbers.
 *
 * Provider-specific adapters must convert exact source
 * representations to strings before reaching this function.
 */
export function normalizeProviderMoneyInput(
  value: unknown,
): DecimalString {
  if (typeof value !== "string") {
    throw new Error(
      "Provider money amount must be supplied as an exact string.",
    );
  }

  return normalizeProviderDecimal(value);
}

export function normalizeProviderCurrencyCode(
  value: string,
): CurrencyCode {
  const trimmed = value.trim();

  if (
    !CURRENCY_CODE_PATTERN.test(
      trimmed,
    )
  ) {
    throw new Error(
      "Provider currency must be a three-letter code.",
    );
  }

  return trimmed.toUpperCase() as CurrencyCode;
}

export function normalizeProviderMoney(
  amount: unknown,
  currency: string,
): NormalizedProviderMoney {
  return {
    amount:
      normalizeProviderMoneyInput(
        amount,
      ),
    currency:
      normalizeProviderCurrencyCode(
        currency,
      ),
  };
}
