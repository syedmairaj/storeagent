/**
 * Store-local calendar date for M5 as-of / readiness "current" checks.
 * Matches the Intl formatting used by sales-aggregates storeLocalDate.
 */
export function storeLocalAsOfDate(
  timeZone: string,
  instant: Date = new Date(),
): string {
  if (!timeZone.trim()) {
    throw new Error("store timezone is required.");
  }

  if (Number.isNaN(instant.getTime())) {
    throw new Error("as-of instant must be a valid UTC timestamp.");
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (year === undefined || month === undefined || day === undefined) {
    throw new Error("unable to resolve store-local as-of date.");
  }

  return `${year}-${month}-${day}`;
}
