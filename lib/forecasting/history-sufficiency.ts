import type {
  HistorySufficiencyInput,
  HistorySufficiencyResult,
} from "./types";

export const LIMITED_HISTORY_MIN_DAYS_V1 = 7;
export const SUFFICIENT_HISTORY_MIN_DAYS_V1 = 28;

/**
 * forecast-history-sufficiency-v1
 *
 * 0-6 usable days   -> insufficient
 * 7-27 usable days  -> limited
 * 28+ usable days   -> sufficient
 */
export function classifyHistorySufficiency(
  input: HistorySufficiencyInput,
): HistorySufficiencyResult {
  if (
    !Number.isInteger(input.usableDays) ||
    input.usableDays < 0
  ) {
    throw new Error(
      "usableDays must be a non-negative integer.",
    );
  }

  if (
    input.usableDays <
    LIMITED_HISTORY_MIN_DAYS_V1
  ) {
    return {
      dataSufficiency: "insufficient",
      usableDays: input.usableDays,
    };
  }

  if (
    input.usableDays <
    SUFFICIENT_HISTORY_MIN_DAYS_V1
  ) {
    return {
      dataSufficiency: "limited",
      usableDays: input.usableDays,
    };
  }

  return {
    dataSufficiency: "sufficient",
    usableDays: input.usableDays,
  };
}
