/**
 * Presentation helpers for M7.4b demo Actions evidence.
 * Null / undefined / non-finite → "Unknown" (never coerce to zero).
 */

/**
 * Deterministic merchant-facing explanations for demo reason codes.
 * Only maps known fixture codes; unknown codes fall back to a stable humanization.
 */
const DEMO_REASON_CODE_EXPLANATIONS:
  Readonly<Record<string, string>> = {
    below_reorder_point:
      "Available stock is below the reorder point.",
    incoming_insufficient:
      "Incoming stock is not enough to cover lead-time demand.",
    excess_days_of_stock:
      "Days of stock are high relative to recent demand.",
    aging_inventory:
      "Inventory has been sitting longer than expected.",
    seasonal_clearance:
      "This seasonal variant should be cleared before it ages further.",
    soft_demand:
      "Recent demand is soft compared with on-hand stock.",
    insufficient_velocity_history:
      "There is not enough sales history to trust velocity.",
    incoming_quantity_unknown:
      "Incoming quantity is unknown, so the position is uncertain.",
    conflicting_days_of_stock_signals:
      "Days-of-stock signals conflict, so StoreAgent is watching instead of acting.",
    stale_inventory_observation:
      "The inventory observation looks stale or incomplete.",
    missing_available_quantity:
      "Available quantity is missing from the evidence snapshot.",
    stable_recent_velocity:
      "Recent velocity looks stable enough to support this recommendation.",
    lead_time_covered_by_policy:
      "Lead time is covered by the current stocking policy.",
    elevated_days_of_stock:
      "Days of stock are elevated for this SKU.",
    clearance_candidate:
      "This SKU looks like a clearance candidate in the demo fixture.",
    conflicting_signals:
      "Signals conflict across the available evidence.",
    incomplete_incoming:
      "Incoming evidence is incomplete.",
    stale_evidence:
      "Evidence in this snapshot is stale.",
  };

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

export function explainDemoReasonCode(
  code: string,
): string {
  const known =
    DEMO_REASON_CODE_EXPLANATIONS[code];

  if (
    known
  ) {
    return known;
  }

  const humanized =
    code
      .trim()
      .replace(
        /_/g,
        " ",
      )
      .replace(
        /\s+/g,
        " ",
      );

  if (
    humanized.length === 0
  ) {
    return "Unspecified evidence note.";
  }

  return `${humanized.charAt(0).toUpperCase()}${humanized.slice(1)}.`;
}
