import {
  describe,
  expect,
  it,
} from "vitest";

import {
  normalizeOptionalProviderUnitQuantity,
  normalizeProviderInventoryQuantities,
  normalizeProviderUnitQuantity,
} from "@/lib/providers/quantities";

describe("provider quantity normalization", () => {
  it("accepts known zero numeric quantity", () => {
    expect(
      normalizeProviderUnitQuantity(0),
    ).toBe(0);
  });

  it("accepts non-negative integer numbers", () => {
    expect(
      normalizeProviderUnitQuantity(42),
    ).toBe(42);
  });

  it("accepts digit strings and removes redundant leading zeroes", () => {
    expect(
      normalizeProviderUnitQuantity(
        " 0042 ",
      ),
    ).toBe(42);
  });

  it("rejects negative quantities", () => {
    expect(() =>
      normalizeProviderUnitQuantity(-1),
    ).toThrow(
      "Provider quantity must be a non-negative safe integer.",
    );
  });

  it("rejects fractional numeric quantities", () => {
    expect(() =>
      normalizeProviderUnitQuantity(
        1.5,
      ),
    ).toThrow(
      "Provider quantity must be a non-negative safe integer.",
    );
  });

  it("rejects fractional quantity strings", () => {
    expect(() =>
      normalizeProviderUnitQuantity(
        "1.5",
      ),
    ).toThrow(
      "Provider quantity must be a non-negative whole-unit value.",
    );
  });

  it("rejects scientific notation strings", () => {
    expect(() =>
      normalizeProviderUnitQuantity(
        "1e3",
      ),
    ).toThrow(
      "Provider quantity must be a non-negative whole-unit value.",
    );
  });

  it("rejects unsafe integer quantities", () => {
    expect(() =>
      normalizeProviderUnitQuantity(
        Number.MAX_SAFE_INTEGER + 1,
      ),
    ).toThrow(
      "Provider quantity must be a non-negative safe integer.",
    );
  });

  it("preserves null undefined and blank optional quantities as unknown", () => {
    expect(
      normalizeOptionalProviderUnitQuantity(
        null,
      ),
    ).toBeNull();

    expect(
      normalizeOptionalProviderUnitQuantity(
        undefined,
      ),
    ).toBeNull();

    expect(
      normalizeOptionalProviderUnitQuantity(
        "   ",
      ),
    ).toBeNull();
  });

  it("preserves known zero optional quantity", () => {
    expect(
      normalizeOptionalProviderUnitQuantity(
        "0",
      ),
    ).toBe(0);
  });

  it("maps each explicit inventory semantic independently", () => {
    expect(
      normalizeProviderInventoryQuantities({
        onHand: 100,
        available: 80,
        committed: 20,
        incoming: 40,
      }),
    ).toEqual({
      onHandQuantity: 100,
      availableQuantity: 80,
      committedQuantity: 20,
      incomingQuantity: 40,
    });
  });

  it("does not infer missing inventory semantics from other quantities", () => {
    expect(
      normalizeProviderInventoryQuantities({
        onHand: 100,
        committed: 20,
      }),
    ).toEqual({
      onHandQuantity: 100,
      availableQuantity: null,
      committedQuantity: 20,
      incomingQuantity: null,
    });
  });

  it("does not turn absent inventory fields into zero", () => {
    expect(
      normalizeProviderInventoryQuantities(
        {},
      ),
    ).toEqual({
      onHandQuantity: null,
      availableQuantity: null,
      committedQuantity: null,
      incomingQuantity: null,
    });
  });
});
