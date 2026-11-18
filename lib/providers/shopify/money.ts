import type {
  CurrencyCode,
  DecimalString,
} from "@/lib/commerce-domain/types";

import {
  normalizeProviderCurrencyCode,
  normalizeProviderMoneyInput,
} from "@/lib/providers/money";

import type {
  ProviderNormalizationIssue,
} from "@/lib/providers/types";

import {
  shopifyIssue,
} from "./issues";

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

/**
 * Shopify MoneyV2 / shopMoney shape.
 *
 * Amounts must already be exact decimal strings. Binary floats fail closed.
 */
export function readShopifyMoneyV2(
  value: unknown,
  field: string,
  issues: ProviderNormalizationIssue[],
): {
  amount: DecimalString;
  currency: CurrencyCode;
} | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (!isRecord(value)) {
    issues.push(
      shopifyIssue(
        "INVALID_MONEY",
        `Shopify ${field} must be a MoneyV2 object.`,
        field,
      ),
    );

    return null;
  }

  const amountRaw = value.amount;
  const currencyRaw = value.currencyCode;

  if (typeof amountRaw !== "string") {
    issues.push(
      shopifyIssue(
        "INVALID_MONEY",
        `Shopify ${field}.amount must be an exact decimal string.`,
        field,
      ),
    );

    return null;
  }

  if (typeof currencyRaw !== "string") {
    issues.push(
      shopifyIssue(
        "INVALID_CURRENCY",
        `Shopify ${field}.currencyCode must be a three-letter code.`,
        field,
      ),
    );

    return null;
  }

  let amount: DecimalString;

  try {
    amount = normalizeProviderMoneyInput(amountRaw);
  } catch {
    issues.push(
      shopifyIssue(
        "INVALID_MONEY",
        `Shopify ${field}.amount must be a plain decimal string.`,
        field,
      ),
    );

    return null;
  }

  let currency: CurrencyCode;

  try {
    currency = normalizeProviderCurrencyCode(currencyRaw);
  } catch {
    issues.push(
      shopifyIssue(
        "INVALID_CURRENCY",
        `Shopify ${field}.currencyCode must be a three-letter code.`,
        field,
      ),
    );

    return null;
  }

  return {
    amount,
    currency,
  };
}

/**
 * Shopify MoneyBag.shopMoney (preferred shop-currency representation).
 */
export function readShopifyShopMoney(
  value: unknown,
  field: string,
  issues: ProviderNormalizationIssue[],
): {
  amount: DecimalString;
  currency: CurrencyCode;
} | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (!isRecord(value)) {
    issues.push(
      shopifyIssue(
        "INVALID_MONEY",
        `Shopify ${field} must be a MoneyBag object.`,
        field,
      ),
    );

    return null;
  }

  return readShopifyMoneyV2(
    value.shopMoney,
    `${field}.shopMoney`,
    issues,
  );
}

export function readOptionalNonNegativeShopifyMoney(
  value: unknown,
  field: string,
  issues: ProviderNormalizationIssue[],
): {
  amount: DecimalString;
  currency: CurrencyCode;
} | null {
  const money = readShopifyShopMoney(value, field, issues);

  if (money === null) {
    return null;
  }

  if (money.amount.startsWith("-")) {
    issues.push(
      shopifyIssue(
        "INVALID_MONEY",
        `Shopify ${field} must not be negative.`,
        field,
      ),
    );

    return null;
  }

  return money;
}
