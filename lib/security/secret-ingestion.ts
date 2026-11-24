/**
 * CONN-1d-A / CONN-1d-E — fail-closed secret ingestion guard for non-vault
 * JSON payloads.
 *
 * Rejects credential-like keys and Shopify/Bearer/JWT/Basic-like values
 * before they can be written to integrations.configuration, provider binding
 * source_metadata, or SyncRun error/reconciliation JSON.
 *
 * Defense in depth only: the authoritative control is the CONN-1d-E trigger
 * public.conn_1d_e_reject_secret_json. This guard is stricter than the
 * trigger so every payload it accepts is also accepted by the database.
 *
 * Only plain data is accepted (no proxies, accessors, class instances or
 * serialization hooks). The payload is serialized once and the parsed copy
 * is validated and returned, so callers persist exactly what was validated.
 *
 * Does not log or echo rejected payload contents.
 */

import { types } from "node:util";

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

/** Compact UTF-8 bytes; jsonb::text expands at most 1.5x, under the DB 8192 cap. */
const MAX_UTF8_BYTES = 4096;

const KEY_SHAPE = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

/** Folded = lowercase with `_` and `-` removed. */
const EXEMPT_FOLDED_KEYS = new Set([
  "tokenkind",
  "keyversion",
]);

const FORBIDDEN_FOLDED_KEYS = new Set([
  "session",
  "accessnonce",
  "refreshnonce",
]);

const FORBIDDEN_KEY_FRAGMENT =
  /token|secret|password|passwd|credential|ciphertext|authorization|cookie|bearer|apikey|privatekey|authtag|dekwrap|servicerole/;

const SECRET_VALUE_PATTERNS: readonly RegExp[] = [
  /shp(?:at|ca|pa|ss|rt)_[a-z0-9_]/i,
  /bearer\s+[a-z0-9._~+/=-]/i,
  /eyj[a-z0-9_-]+\.[a-z0-9_-]+\./i,
  /Basic\s+[A-Za-z0-9+/]{8,}/,
  /"(?:access|refresh|id)_?token"\s*:/i,
  /"client_?secret"\s*:/i,
];

const ARRAY_INDEX = /^(?:0|[1-9][0-9]*)$/;

function reject(boundary: SecretIngestionBoundary): never {
  throw new SecretIngestionError(boundary);
}

/** NUL and lone surrogates are not storable as jsonb. */
function isStorableString(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 0) {
      return false;
    }
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        return false;
      }
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function hasSerializationHook(): boolean {
  return (
    Object.getOwnPropertyDescriptor(Object.prototype, "toJSON") !== undefined
    || Object.getOwnPropertyDescriptor(Array.prototype, "toJSON") !== undefined
  );
}

/**
 * Structural pre-walk of the caller's value. Reads own property descriptors
 * only, so getters, proxies and toJSON hooks are never invoked.
 */
function inspectPlainData(
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
  boundary: SecretIngestionBoundary,
): void {
  if (depth > MAX_DEPTH) {
    reject(boundary);
  }

  if (value === null || value === undefined) {
    return;
  }

  switch (typeof value) {
    case "string":
      if (!isStorableString(value)) {
        reject(boundary);
      }
      return;
    case "number":
      // Exponent forms expand when re-rendered as jsonb numeric text.
      if (!Number.isFinite(value) || /e/i.test(String(value))) {
        reject(boundary);
      }
      return;
    case "boolean":
      return;
    case "object":
      break;
    default:
      reject(boundary);
  }

  const object = value as object;

  if (types.isProxy(object) || seen.has(object)) {
    reject(boundary);
  }
  seen.add(object);

  const isArray = Array.isArray(object);
  const prototype = Object.getPrototypeOf(object);

  if (
    isArray
      ? prototype !== Array.prototype
      : prototype !== Object.prototype && prototype !== null
  ) {
    reject(boundary);
  }

  let ownIndexCount = 0;

  for (const key of Reflect.ownKeys(object)) {
    if (typeof key !== "string") {
      reject(boundary);
    }
    if (isArray && key === "length") {
      continue;
    }
    if (isArray && !ARRAY_INDEX.test(key)) {
      reject(boundary);
    }
    if (isArray) {
      ownIndexCount += 1;
    }
    if (!isArray && !isStorableString(key)) {
      reject(boundary);
    }

    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    if (!descriptor || !("value" in descriptor)) {
      reject(boundary);
    }
    inspectPlainData(descriptor.value, depth + 1, seen, boundary);
  }

  // A hole would be read through Array.prototype during serialization.
  if (
    isArray
    && ownIndexCount !== Object.getOwnPropertyDescriptor(object, "length")?.value
  ) {
    reject(boundary);
  }
}

function containsSecretValue(value: string): boolean {
  return SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

function isForbiddenKey(key: string): boolean {
  if (!KEY_SHAPE.test(key) || containsSecretValue(key)) {
    return true;
  }
  const folded = key.replace(/[_-]/g, "").toLowerCase();
  if (EXEMPT_FOLDED_KEYS.has(folded)) {
    return false;
  }
  return (
    FORBIDDEN_FOLDED_KEYS.has(folded)
    || FORBIDDEN_KEY_FRAGMENT.test(folded)
  );
}

/** Policy walk over the parsed canonical copy (plain JSON only). */
function validateCanonical(
  value: unknown,
  depth: number,
  boundary: SecretIngestionBoundary,
): void {
  if (depth > MAX_DEPTH) {
    reject(boundary);
  }

  if (typeof value === "string") {
    if (containsSecretValue(value)) {
      reject(boundary);
    }
    return;
  }

  if (value === null || typeof value !== "object") {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      validateCanonical(item, depth + 1, boundary);
    }
    return;
  }

  for (const key of Object.keys(value)) {
    if (isForbiddenKey(key)) {
      reject(boundary);
    }
    validateCanonical(
      (value as Record<string, unknown>)[key],
      depth + 1,
      boundary,
    );
  }
}

/**
 * Fail closed if `value` is not plain JSON data or contains secret material.
 * Returns the validated canonical copy, which callers must persist.
 */
export function assertNonSecretIngestionPayload<T>(
  value: T,
  boundary: SecretIngestionBoundary,
): T {
  if (hasSerializationHook()) {
    reject(boundary);
  }

  inspectPlainData(value, 0, new WeakSet<object>(), boundary);

  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    return value;
  }

  if (Buffer.byteLength(serialized, "utf8") > MAX_UTF8_BYTES) {
    reject(boundary);
  }

  const canonical: unknown = JSON.parse(serialized);
  validateCanonical(canonical, 0, boundary);
  return canonical as T;
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
