export function normalizeEvaluationValue(
  value: unknown,
): unknown {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return Number(
      value.toFixed(12),
    );
  }

  if (Array.isArray(value)) {
    return value.map(
      normalizeEvaluationValue,
    );
  }

  if (
    value !== null &&
    typeof value === "object"
  ) {
    return Object.fromEntries(
      Object.entries(
        value as Record<
          string,
          unknown
        >,
      ).map(
        ([key, item]) => [
          key,
          normalizeEvaluationValue(
            item,
          ),
        ],
      ),
    );
  }

  return value;
}
