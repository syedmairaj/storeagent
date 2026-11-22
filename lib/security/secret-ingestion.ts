/**
 * CONN-1d-A — fail-closed secret ingestion guard for non-vault JSON payloads.
 *
 * Rejects known secret field names and Shopify-like opaque credential values
 * before they can be written to integrations.configuration, provider binding
 * source_metadata, or SyncRun error/reconciliation JSON.
 *
 * Does not log or echo rejected payload contents.
 * Does not replace DB-level enforcement (none exists for JSON key bans).
 */

export const SECRET_INGESTION_REJECTED = "secret_ingestion_rejected" as const;

export type SecretIngestionBoundary =
  | "integrations.configuration"
  | "provider_bindings.source_metadata"
  | "sync_runs.error_summary"
  | "sync_runs.reconciliation_metadata";

export class SecretIngestionError extends Error {
  readonly code = SECRET_INGESTION_REJECTED;

  readonly boundary: SecretIngestionBoundary;

  constructor(boundary: SecretIngestionBoundary) {
    super(`Secret material rejected at ingestion boundary (${boundary}).`);
    this.name = "SecretIngestionError";
    this.boundary = boundary;
  }
}

export function isSecretIngestionError(
  error: unknown,
): error is SecretIngestionError {
  return (
    error instanceof SecretIngestionError
    || (
      typeof error === "object"
      && error !== null
      && (error as { code?: unknown }).code === SECRET_INGESTION_REJECTED
    )
  );
}

const MAX_DEPTH = 8;

/** Keys that may appear as non-secret diagnostics / config. */
const ALLOWED_KEYS = new Set([
  "token_kind",
  "key_version",
]);

/**
 * Exact forbidden keys after camelCase → snake_case normalization.
 * Intentionally narrower than observability redaction (avoids rejecting
 * safe `token_kind` diagnostics while still blocking credential fields).
 */
const FORBIDDEN_KEYS = new Set([
  "authorization",
  "cookie",
  "password",
  "passwd",
  "secret",
  "client_secret",
  "api_key",
  "apikey",
  "service_role",
  "session",
  "credential",
  "credentials",
  "access_token",
  "refresh_token",
  "id_token",
  "private_key",
  "access_ciphertext",
  "refresh_ciphertext",
  "dek_wrapped",
  "dek_wrap_nonce",
  "dek_wrap_auth_tag",
  "access_nonce",
  "refresh_nonce",
  "access_auth_tag",
  "refresh_auth_tag",
  "refresh_lock_token",
  "ciphertext",
  "auth_tag",
]);

/** Shopify-like opaque token forms (synthetic fixtures + platform prefixes). */
const SHOPIFY_OPAQUE_TOKEN =
  /\bshp(?:at|ca|pa|ss|rt)_[A-Za-z0-9_]+\b/i;

const BEARER_VALUE =
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/i;

function normalizeKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/-/g, "_")
    .toLowerCase();
}

function isForbiddenKey(key: string): boolean {
  const normalized = normalizeKey(key);
  if (ALLOWED_KEYS.has(normalized)) {
    return false;
  }
  if (FORBIDDEN_KEYS.has(normalized)) {
    return true;
  }
  // Catch compound secret-style names (e.g. shopify_access_token).
  if (
    normalized.endsWith("_secret")
    || normalized.endsWith("_password")
    || normalized.endsWith("_credential")
    || normalized.endsWith("_credentials")
    || normalized.endsWith("_ciphertext")
    || normalized.endsWith("_auth_tag")
  ) {
    return true;
  }
  if (
    normalized.endsWith("_token")
    && normalized !== "token_kind"
  ) {
    return true;
  }
  return false;
}

function stringContainsSecretMaterial(value: string): boolean {
  return SHOPIFY_OPAQUE_TOKEN.test(value) || BEARER_VALUE.test(value);
}

function walk(
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
  boundary: SecretIngestionBoundary,
): void {
  if (depth > MAX_DEPTH) {
    throw new SecretIngestionError(boundary);
  }

  if (value === null || value === undefined) {
    return;
  }

  if (typeof value === "string") {
    if (stringContainsSecretMaterial(value)) {
      throw new SecretIngestionError(boundary);
    }
    return;
  }

  if (
    typeof value === "number"
    || typeof value === "boolean"
  ) {
    return;
  }

  if (typeof value !== "object") {
    // Reject unexpected types (bigint, function, symbol) at persist boundaries.
    throw new SecretIngestionError(boundary);
  }

  if (seen.has(value)) {
    throw new SecretIngestionError(boundary);
  }
  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      walk(item, depth + 1, seen, boundary);
    }
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    if (isForbiddenKey(key)) {
      throw new SecretIngestionError(boundary);
    }
    walk(child, depth + 1, seen, boundary);
  }
}

/**
 * Fail closed if `value` contains secret field names or Shopify-like
 * credential strings. Returns the same reference when safe.
 */
export function assertNonSecretIngestionPayload<T>(
  value: T,
  boundary: SecretIngestionBoundary,
): T {
  walk(value, 0, new WeakSet<object>(), boundary);
  return value;
}

/**
 * Null-preserving guard for optional JSON columns.
 */
export function guardOptionalNonSecretJson<T>(
  value: T | null | undefined,
  boundary: SecretIngestionBoundary,
): T | null {
  if (value === null || value === undefined) {
    return null;
  }
  return assertNonSecretIngestionPayload(value, boundary);
}
