import type {
  DecisionAlgorithmVersions,
  DecisionReproducibilityDescriptor,
  DecisionReproducibilityResult,
} from "./types";

export const DECISION_ALGORITHM_VERSIONS_V1:
  DecisionAlgorithmVersions = {
    reorder: "reorder-rule-v1",
    reduce: "reduce-rule-v1",
    promote: "promote-rule-v1",
    watchHealthy: "watch-healthy-rule-v1",
    conflict: "decision-conflict-v1",
    primaryAction: "primary-action-v1",
    priority: "decision-priority-v1",
    confidence: "decision-confidence-v1",
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
    "Unsupported decision reproducibility value.",
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

export function buildDecisionReproducibilityFingerprint(
  descriptor: DecisionReproducibilityDescriptor,
  canonicalInput: unknown,
): DecisionReproducibilityResult {
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
