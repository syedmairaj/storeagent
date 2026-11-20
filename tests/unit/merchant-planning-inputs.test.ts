import { describe, expect, it } from "vitest";

import {
  classifyMerchantPlanningConfiguration,
  formatPersistedPlanningSummary,
  REPLENISHMENT_FIELD_COPY,
} from "@/lib/planning-inputs/merchant-copy";
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

  it("supports all-blank saves without inventing zeros", () => {
    const parsed = parseMerchantPlanningInputs({
      leadTimeDays: "",
      safetyStockDays: "   ",
      reviewPeriodDays: null,
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.value).toEqual({
      leadTimeDays: null,
      safetyStockDays: null,
      reviewPeriodDays: null,
    });
    expect(classifyMerchantPlanningConfiguration(parsed.value)).toBe(
      "all_blank",
    );
  });

  it("classifies configuration and formats exact persisted summaries", () => {
    expect(
      classifyMerchantPlanningConfiguration({
        leadTimeDays: 7,
        safetyStockDays: 5,
        reviewPeriodDays: 7,
      }),
    ).toBe("complete");
    expect(
      classifyMerchantPlanningConfiguration({
        leadTimeDays: 7,
        safetyStockDays: null,
        reviewPeriodDays: 0,
      }),
    ).toBe("partial");
    expect(
      formatPersistedPlanningSummary({
        leadTimeDays: 7,
        safetyStockDays: null,
        reviewPeriodDays: 0,
      }),
    ).toBe("lead 7, safety blank, review 0");
  });

  it("uses illustrative placeholders that are not persisted defaults", () => {
    expect(REPLENISHMENT_FIELD_COPY.leadTimeDays.placeholder).toBe("e.g. 7");
    expect(REPLENISHMENT_FIELD_COPY.safetyStockDays.placeholder).toBe("e.g. 5");
    expect(REPLENISHMENT_FIELD_COPY.reviewPeriodDays.placeholder).toBe("e.g. 7");
    expect(REPLENISHMENT_FIELD_COPY.leadTimeDays.label).toMatch(
      /Supplier lead time/i,
    );
    expect(REPLENISHMENT_FIELD_COPY.leadTimeDays.hint).toMatch(
      /Blank stays blank/i,
    );
    expect(REPLENISHMENT_FIELD_COPY.safetyStockDays.label).toMatch(
      /Safety stock buffer/i,
    );
    expect(REPLENISHMENT_FIELD_COPY.safetyStockDays.hint).toMatch(
      /not a buy quantity/i,
    );
    expect(REPLENISHMENT_FIELD_COPY.reviewPeriodDays.label).toMatch(
      /Stock review frequency/i,
    );
    expect(REPLENISHMENT_FIELD_COPY.reviewPeriodDays.hint).toMatch(
      /not an order quantity/i,
    );
  });
});
