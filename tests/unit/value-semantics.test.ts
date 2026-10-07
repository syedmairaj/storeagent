import { describe, expect, it } from "vitest";

import {
  hasKnownValue,
  isDecimalString,
  isNonNegativeDecimalString,
  isNonNegativeWholeUnitQuantity,
  isWholeUnitQuantity,
  ratioToPercentageLabel,
} from "@/lib/commerce-domain/value-semantics";

describe("StoreAgent value semantics", () => {
  it("accepts exact decimal strings", () => {
    expect(isDecimalString("10")).toBe(true);
    expect(isDecimalString("10.50")).toBe(true);
    expect(isDecimalString("0.0001")).toBe(true);
  });

  it("rejects invalid decimal representations", () => {
    expect(isDecimalString("10,50")).toBe(false);
    expect(isDecimalString("AED 10")).toBe(false);
    expect(isDecimalString("")).toBe(false);
  });

  it("distinguishes null from an explicit zero amount", () => {
    expect(hasKnownValue(null)).toBe(false);
    expect(hasKnownValue("0")).toBe(true);
  });

  it("validates non-negative monetary amounts", () => {
    expect(isNonNegativeDecimalString("0")).toBe(true);
    expect(isNonNegativeDecimalString("10.25")).toBe(true);
    expect(isNonNegativeDecimalString("-1")).toBe(false);
    expect(isNonNegativeDecimalString(null)).toBe(false);
  });

  it("requires V1 quantities to be whole units", () => {
    expect(isWholeUnitQuantity(10)).toBe(true);
    expect(isWholeUnitQuantity(10.5)).toBe(false);
  });

  it("distinguishes zero inventory from invalid negative inventory", () => {
    expect(isNonNegativeWholeUnitQuantity(0)).toBe(true);
    expect(isNonNegativeWholeUnitQuantity(25)).toBe(true);
    expect(isNonNegativeWholeUnitQuantity(-1)).toBe(false);
  });

  it("formats ratios consistently as percentages", () => {
    expect(ratioToPercentageLabel(0)).toBe("0%");
    expect(ratioToPercentageLabel(0.5)).toBe("50%");
    expect(ratioToPercentageLabel(1)).toBe("100%");
    expect(ratioToPercentageLabel(0.825, 1)).toBe("82.5%");
  });

  it("rejects non-finite ratios", () => {
    expect(() => ratioToPercentageLabel(Infinity)).toThrow(
      "Ratio must be finite.",
    );
  });
});
