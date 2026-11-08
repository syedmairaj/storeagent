import { describe, expect, it } from "vitest";

import {
  formatPlanningDayForInput,
  parseMerchantPlanningInputs,
  parsePlanningDayInput,
} from "@/lib/planning-inputs/parse";

describe("merchant planning inputs parse", () => {
  it("treats blank as unknown null and zero as known zero", () => {
    expect(parsePlanningDayInput("", "Lead time")).toEqual({
      ok: true,
      value: null,
    });
    expect(parsePlanningDayInput("   ", "Lead time")).toEqual({
      ok: true,
      value: null,
    });
    expect(parsePlanningDayInput(null, "Lead time")).toEqual({
      ok: true,
      value: null,
    });
    expect(parsePlanningDayInput("0", "Lead time")).toEqual({
      ok: true,
      value: 0,
    });
    expect(parsePlanningDayInput(0, "Lead time")).toEqual({
      ok: true,
      value: 0,
    });
    expect(formatPlanningDayForInput(null)).toBe("");
    expect(formatPlanningDayForInput(0)).toBe("0");
  });

  it("accepts non-negative integers and rejects invalid values", () => {
    expect(parsePlanningDayInput("14", "Review period")).toEqual({
      ok: true,
      value: 14,
    });
    expect(parsePlanningDayInput("-1", "Lead time").ok).toBe(false);
    expect(parsePlanningDayInput("1.5", "Lead time").ok).toBe(false);
    expect(parsePlanningDayInput("abc", "Lead time").ok).toBe(false);
    expect(parsePlanningDayInput(1.5, "Lead time").ok).toBe(false);
    expect(parsePlanningDayInput(-3, "Safety stock days").ok).toBe(false);
  });

  it("supports partial planning configurations", () => {
    const parsed = parseMerchantPlanningInputs({
      leadTimeDays: "7",
      safetyStockDays: "",
      reviewPeriodDays: "0",
    });
    expect(parsed).toEqual({
      ok: true,
      value: {
        leadTimeDays: 7,
        safetyStockDays: null,
        reviewPeriodDays: 0,
      },
    });
  });
});
