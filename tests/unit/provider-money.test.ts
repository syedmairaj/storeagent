import {
  describe,
  expect,
  it,
} from "vitest";

import {
  normalizeProviderCurrencyCode,
  normalizeProviderDecimal,
  normalizeProviderMoney,
  normalizeProviderMoneyInput,
} from "@/lib/providers/money";

describe("provider money normalization", () => {
  it("normalizes an exact decimal string", () => {
    expect(
      normalizeProviderDecimal(
        " 0012.3400 ",
      ),
    ).toBe("12.34");
  });

  it("normalizes integer money without inventing decimal places", () => {
    expect(
      normalizeProviderDecimal(
        "00012",
      ),
    ).toBe("12");
  });

  it("normalizes positive zero", () => {
    expect(
      normalizeProviderDecimal(
        "0.00",
      ),
    ).toBe("0");
  });

  it("normalizes negative zero to canonical zero", () => {
    expect(
      normalizeProviderDecimal(
        "-0.000",
      ),
    ).toBe("0");
  });

  it("preserves exact negative decimal values", () => {
    expect(
      normalizeProviderDecimal(
        "-0012.3400",
      ),
    ).toBe("-12.34");
  });

  it("rejects scientific notation", () => {
    expect(() =>
      normalizeProviderDecimal(
        "1e3",
      ),
    ).toThrow(
      "Provider money amount must be a plain decimal string.",
    );
  });

  it("rejects thousands separators", () => {
    expect(() =>
      normalizeProviderDecimal(
        "1,000.00",
      ),
    ).toThrow(
      "Provider money amount must be a plain decimal string.",
    );
  });

  it("rejects currency symbols embedded in amount", () => {
    expect(() =>
      normalizeProviderDecimal(
        "$12.00",
      ),
    ).toThrow(
      "Provider money amount must be a plain decimal string.",
    );
  });

  it("rejects JavaScript numeric money input", () => {
    expect(() =>
      normalizeProviderMoneyInput(
        12.34,
      ),
    ).toThrow(
      "Provider money amount must be supplied as an exact string.",
    );
  });

  it("uppercases and trims three-letter currency codes", () => {
    expect(
      normalizeProviderCurrencyCode(
        " usd ",
      ),
    ).toBe("USD");
  });

  it("rejects malformed currency codes", () => {
    expect(() =>
      normalizeProviderCurrencyCode(
        "US",
      ),
    ).toThrow(
      "Provider currency must be a three-letter code.",
    );

    expect(() =>
      normalizeProviderCurrencyCode(
        "USDD",
      ),
    ).toThrow(
      "Provider currency must be a three-letter code.",
    );
  });

  it("normalizes amount and currency together", () => {
    expect(
      normalizeProviderMoney(
        "0019.9900",
        " usd ",
      ),
    ).toEqual({
      amount: "19.99",
      currency: "USD",
    });
  });

  it("does not silently validate three-letter syntax as provider support", () => {
    expect(
      normalizeProviderCurrencyCode(
        "xyz",
      ),
    ).toBe("XYZ");
  });
});
