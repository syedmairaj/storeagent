/**
 * Presentation helpers for M7.4b demo Actions evidence.
 * Null / undefined / non-finite → "Unknown" (never coerce to zero).
 */

export function formatDemoUnknownNumber(
  value: number | null | undefined,
  options?: {
    digits?: number;
    suffix?: string;
  },
): string {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(value)
  ) {
    return "Unknown";
  }

  const digits = options?.digits ?? 0;
  const formatted =
    digits > 0
      ? value.toFixed(digits)
      : String(Math.trunc(value) === value ? value : Number(value.toFixed(2)));

  return options?.suffix
    ? `${formatted}${options.suffix}`
    : formatted;
}

export function formatDemoDataQualityScore(
  value: number | null | undefined,
): string {
  if (
    value === null ||
    value === undefined ||
    !Number.isFinite(value)
  ) {
    return "Unknown";
  }

  return `${Math.round(value * 100)}%`;
}

export function formatDemoPriorityLabel(
  priority: string,
): string {
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

export function formatDemoConfidenceLabel(
  confidence: string,
): string {
  return confidence.charAt(0).toUpperCase() + confidence.slice(1);
}
