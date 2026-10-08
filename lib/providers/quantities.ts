import type {
  UnitQuantity,
} from "@/lib/commerce-domain/types";

import type {
  NormalizedProviderInventoryQuantities,
  ProviderInventoryQuantityInput,
} from "./types";

const WHOLE_UNIT_STRING =
  /^\d+$/;

function assertSafeUnitQuantity(
  value: number,
): UnitQuantity {
  if (
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new Error(
      "Provider quantity must be a non-negative safe integer.",
    );
  }

  return value as UnitQuantity;
}

/**
 * Canonical inventory/order quantities are whole,
 * non-negative units.
 *
 * Numeric provider values are safe here only when they are
 * JavaScript safe integers. Unlike money, no fractional
 * precision is being preserved.
 */
export function normalizeProviderUnitQuantity(
  value: unknown,
): UnitQuantity {
  if (typeof value === "number") {
    return assertSafeUnitQuantity(
      value,
    );
  }

  if (typeof value !== "string") {
    throw new Error(
      "Provider quantity must be an integer number or digit string.",
    );
  }

  const trimmed = value.trim();

  if (
    !WHOLE_UNIT_STRING.test(trimmed)
  ) {
    throw new Error(
      "Provider quantity must be a non-negative whole-unit value.",
    );
  }

  const parsed = Number(trimmed);

  return assertSafeUnitQuantity(
    parsed,
  );
}

/**
 * Missing provider inventory semantics stay unknown.
 *
 * Blank CSV cells are treated as unavailable, not zero.
 */
export function normalizeOptionalProviderUnitQuantity(
  value: unknown,
): UnitQuantity | null {
  if (
    value === null ||
    value === undefined
  ) {
    return null;
  }

  if (
    typeof value === "string" &&
    !value.trim()
  ) {
    return null;
  }

  return normalizeProviderUnitQuantity(
    value,
  );
}

/**
 * Maps only explicitly supplied inventory semantics.
 *
 * This function intentionally performs no arithmetic between
 * on-hand, available, committed, and incoming quantities.
 */
export function normalizeProviderInventoryQuantities(
  input: ProviderInventoryQuantityInput,
): NormalizedProviderInventoryQuantities {
  return {
    onHandQuantity:
      normalizeOptionalProviderUnitQuantity(
        input.onHand,
      ),

    availableQuantity:
      normalizeOptionalProviderUnitQuantity(
        input.available,
      ),

    committedQuantity:
      normalizeOptionalProviderUnitQuantity(
        input.committed,
      ),

    incomingQuantity:
      normalizeOptionalProviderUnitQuantity(
        input.incoming,
      ),
  };
}
