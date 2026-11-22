const REDACTED =
  "[REDACTED]";

const SENSITIVE_KEY =
  /(?:authorization|cookie|password|passwd|secret|token|api[_-]?key|service[_-]?role|session|credential)/i;

/** Vault envelope / lease field names that do not match SENSITIVE_KEY alone. */
const VAULT_SENSITIVE_KEY =
  /(?:access_ciphertext|refresh_ciphertext|dek_wrapped|dek_wrap_nonce|dek_wrap_auth_tag|access_nonce|refresh_nonce|access_auth_tag|refresh_auth_tag|refresh_lock_token|(?:^|_)ciphertext(?:$|_)|(?:^|_)auth_tag(?:$|_))/i;

/**
 * Non-secret diagnostic keys that contain the substring "token" / "key"
 * and must keep their values for observability.
 */
const SAFE_DIAGNOSTIC_KEY =
  /^(?:token_kind|tokenKind|key_version|keyVersion)$/;

const BEARER_VALUE =
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;

const JWT_VALUE =
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;

/** Shopify Admin / app opaque token prefixes (synthetic fixtures included). */
const SHOPIFY_OPAQUE_TOKEN =
  /\bshp(?:at|ca|pa|ss|rt)_[A-Za-z0-9_]+\b/gi;

const MAX_DEPTH = 6;

function isSensitiveObjectKey(
  key: string,
): boolean {
  if (SAFE_DIAGNOSTIC_KEY.test(key)) {
    return false;
  }

  return (
    SENSITIVE_KEY.test(key)
    || VAULT_SENSITIVE_KEY.test(key)
  );
}

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
    )
    .replace(
      SHOPIFY_OPAQUE_TOKEN,
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
      isSensitiveObjectKey(
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
