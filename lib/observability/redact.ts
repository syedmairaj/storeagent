const REDACTED =
  "[REDACTED]";

const SENSITIVE_KEY =
  /(?:authorization|cookie|password|passwd|secret|token|api[_-]?key|service[_-]?role|session|credential)/i;

const BEARER_VALUE =
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;

const JWT_VALUE =
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;

const MAX_DEPTH = 6;

function redactString(
  value:
    string,
): string {
  return value
    .replace(
      BEARER_VALUE,
      `Bearer ${REDACTED}`,
    )
    .replace(
      JWT_VALUE,
      REDACTED,
    );
}

function redactInternal(
  value:
    unknown,

  depth:
    number,

  seen:
    WeakSet<object>,
): unknown {
  if (
    depth > MAX_DEPTH
  ) {
    return "[TRUNCATED]";
  }

  if (
    typeof value === "string"
  ) {
    return redactString(
      value,
    );
  }

  if (
    value === null ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (
    typeof value !== "object"
  ) {
    return String(
      value,
    );
  }

  if (
    seen.has(value)
  ) {
    return "[CIRCULAR]";
  }

  seen.add(value);

  if (
    Array.isArray(value)
  ) {
    return value
      .slice(0, 50)
      .map(
        (item) =>
          redactInternal(
            item,
            depth + 1,
            seen,
          ),
      );
  }

  const output:
    Record<string, unknown> =
      {};

  for (
    const [
      key,
      child,
    ] of Object.entries(
      value,
    ).slice(0, 100)
  ) {
    output[key] =
      SENSITIVE_KEY.test(
        key,
      )
        ? REDACTED
        : redactInternal(
            child,
            depth + 1,
            seen,
          );
  }

  return output;
}

export function redactObservabilityValue(
  value:
    unknown,
): unknown {
  return redactInternal(
    value,
    0,
    new WeakSet<object>(),
  );
}
