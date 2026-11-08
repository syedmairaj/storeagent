import type { MerchantPlanningInputs } from "@/lib/planning-inputs/types";

/**
 * Parse a single planning-day field.
 * Blank / null / undefined → unknown (null). Explicit "0" → known zero.
 * Rejects negatives, fractions, and non-integers.
 */
export function parsePlanningDayInput(
  raw: string | number | null | undefined,
  fieldLabel: string,
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (raw === null || raw === undefined) {
    return { ok: true, value: null };
  }

  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || !Number.isInteger(raw) || raw < 0) {
      return {
        ok: false,
        error: `${fieldLabel} must be a whole number of days (≥ 0), or blank for unknown.`,
      };
    }
    return { ok: true, value: raw };
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { ok: true, value: null };
  }

  if (!/^\d+$/.test(trimmed)) {
    return {
      ok: false,
      error: `${fieldLabel} must be a whole number of days (≥ 0), or blank for unknown.`,
    };
  }

  const value = Number(trimmed);
  if (!Number.isSafeInteger(value) || value < 0) {
    return {
      ok: false,
      error: `${fieldLabel} must be a whole number of days (≥ 0), or blank for unknown.`,
    };
  }

  return { ok: true, value };
}

export function parseMerchantPlanningInputs(input: {
  leadTimeDays?: string | number | null;
  safetyStockDays?: string | number | null;
  reviewPeriodDays?: string | number | null;
}):
  | { ok: true; value: MerchantPlanningInputs }
  | { ok: false; error: string } {
  const lead = parsePlanningDayInput(input.leadTimeDays, "Lead time");
  if (!lead.ok) {
    return lead;
  }

  const safety = parsePlanningDayInput(
    input.safetyStockDays,
    "Safety stock days",
  );
  if (!safety.ok) {
    return safety;
  }

  const review = parsePlanningDayInput(
    input.reviewPeriodDays,
    "Review period",
  );
  if (!review.ok) {
    return review;
  }

  return {
    ok: true,
    value: {
      leadTimeDays: lead.value,
      safetyStockDays: safety.value,
      reviewPeriodDays: review.value,
    },
  };
}

export function formatPlanningDayForInput(value: number | null): string {
  return value === null ? "" : String(value);
}
