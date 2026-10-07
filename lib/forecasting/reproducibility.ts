import type {
  ForecastAlgorithmVersions,
  ForecastReproducibilityDescriptor,
  ForecastReproducibilityResult,
} from "./types";

export const FORECAST_ALGORITHM_VERSIONS_V1:
  ForecastAlgorithmVersions = {
    weightedDemand: "weighted-demand-v1",
    trendAdjustment: "trend-adjustment-v1",
    stockoutCensoring: "stockout-censoring-v1",
    promotionTreatment: "promotion-treatment-v1",
    coldStart: "cold-start-v1",
    confidence: "forecast-confidence-v1",
    horizon: "forecast-horizon-v1",
    backtest: "forecast-backtest-v1",
  };

function stableSerialize(
  value: unknown,
): string {
  if (value === null) {
    return "null";
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value
      .map((item) => stableSerialize(item))
      .join(",")}]`;
  }

  if (typeof value === "object") {
    const entries = Object.entries(
      value as Record<string, unknown>,
    ).sort(([a], [b]) =>
      a.localeCompare(b),
    );

    return `{${entries
      .map(
        ([key, item]) =>
          `${JSON.stringify(key)}:${stableSerialize(item)}`,
      )
      .join(",")}}`;
  }

  throw new Error(
    "Unsupported reproducibility value.",
  );
}

function fnv1a32(
  input: string,
): string {
  let hash = 0x811c9dc5;

  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);

    hash = Math.imul(
      hash,
      0x01000193,
    );
  }

  return (
    hash >>> 0
  ).toString(16).padStart(8, "0");
}

/**
 * forecast-reproducibility-v1
 *
 * Produces a deterministic fingerprint from:
 * - algorithm versions
 * - input period
 * - configuration version
 * - canonical normalized input payload
 */
export function buildForecastReproducibilityFingerprint(
  descriptor: ForecastReproducibilityDescriptor,
  canonicalInput: unknown,
): ForecastReproducibilityResult {
  if (!descriptor.inputStartDate) {
    throw new Error(
      "inputStartDate is required.",
    );
  }

  if (!descriptor.inputEndDate) {
    throw new Error(
      "inputEndDate is required.",
    );
  }

  if (!descriptor.configurationVersion) {
    throw new Error(
      "configurationVersion is required.",
    );
  }

  const payload = stableSerialize({
    descriptor,
    canonicalInput,
  });

  return {
    fingerprint: fnv1a32(payload),
    descriptor,
  };
}
