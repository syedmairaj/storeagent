import { describe, expect, it } from "vitest";

import {
  isOrganizationProfileIncomplete,
  parseOrganizationProfileInput,
} from "@/lib/organizations/profile";

describe("organization profile validation", () => {
  it("treats bootstrap currency and missing country as incomplete", () => {
    expect(
      isOrganizationProfileIncomplete({
        country_code: null,
        default_currency: "XXX",
      }),
    ).toBe(true);

    expect(
      isOrganizationProfileIncomplete({
        country_code: "US",
        default_currency: "USD",
      }),
    ).toBe(false);
  });

  it("accepts normalized merchant profile fields", () => {
    const parsed = parseOrganizationProfileInput({
      name: "  Harbor Goods  ",
      countryCode: "us",
      defaultCurrency: "usd",
      timezone: "America/New_York",
    });

    expect(parsed).toEqual({
      ok: true,
      value: {
        name: "Harbor Goods",
        countryCode: "US",
        defaultCurrency: "USD",
        timezone: "America/New_York",
      },
    });
  });

  it("rejects bootstrap currency and invalid country", () => {
    expect(
      parseOrganizationProfileInput({
        name: "Harbor",
        countryCode: "USA",
        defaultCurrency: "USD",
        timezone: "UTC",
      }).ok,
    ).toBe(false);

    expect(
      parseOrganizationProfileInput({
        name: "Harbor",
        countryCode: "US",
        defaultCurrency: "XXX",
        timezone: "UTC",
      }).ok,
    ).toBe(false);
  });
});
