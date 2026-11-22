import "server-only";

import {
  CredentialCryptoError,
} from "@/lib/integration-credentials/errors";
import {
  KEY_BYTE_LENGTH,
} from "@/lib/integration-credentials/types";

type EnvironmentSource = Readonly<
  Record<string, string | undefined>
>;

/**
 * Versioned KEK resolver (server-only).
 *
 * Phase A env naming (fixed here; not wired into readServerEnvironment yet):
 *   INTEGRATION_CREDENTIALS_KEK_V{n}  — canonical Base64 of exactly 32 raw key bytes
 *   INTEGRATION_CREDENTIALS_KEK_CURRENT_VERSION — positive integer for new writes
 *
 * Ambiguous names (unversioned KEK, leading-zero versions, extra suffixes) fail closed.
 * Tests inject keys via createKekResolver({ keys, currentVersion }).
 * Never logs or returns key material in errors.
 */

const ENV_KEY_PREFIX = "INTEGRATION_CREDENTIALS_KEK_V";
const ENV_CURRENT_VERSION = "INTEGRATION_CREDENTIALS_KEK_CURRENT_VERSION";
const ENV_KEK_NAMESPACE = "INTEGRATION_CREDENTIALS_KEK";

/** Exact env key form: INTEGRATION_CREDENTIALS_KEK_V{positive_integer_no_leading_zero} */
const ENV_VERSIONED_KEK_NAME =
  /^INTEGRATION_CREDENTIALS_KEK_V([1-9][0-9]*)$/;

/**
 * Standard Base64 alphabet + correct padding only (no whitespace, no URL-safe).
 * 32 raw bytes always encode to 44 characters ending in a single '='.
 */
const CANONICAL_BASE64_32_BYTES =
  /^[A-Za-z0-9+/]{43}=$/;

export type KekResolver = {
  readonly currentVersion: number;
  resolve(keyVersion: number): Buffer;
};

function copyKey(key: Buffer): Buffer {
  if (!Buffer.isBuffer(key) || key.length !== KEY_BYTE_LENGTH) {
    throw new CredentialCryptoError("invalid_key_length");
  }
  return Buffer.from(key);
}

function parsePositiveVersionStrict(raw: string): number {
  if (!/^[1-9][0-9]*$/.test(raw)) {
    throw new CredentialCryptoError("malformed_input");
  }
  const value = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new CredentialCryptoError("malformed_input");
  }
  return value;
}

function parseCurrentVersionFromEnv(
  raw: string | undefined,
): number {
  if (raw === undefined) {
    throw new CredentialCryptoError("missing_key_version");
  }
  // Reject whitespace-padded / blank current-version values as malformed.
  if (raw.length === 0 || raw !== raw.trim() || raw.trim() === "") {
    throw new CredentialCryptoError(
      raw.trim() === "" ? "missing_key_version" : "malformed_input",
    );
  }
  return parsePositiveVersionStrict(raw);
}

/**
 * Decode a canonical standard Base64 encoding of exactly 32 key bytes.
 * Rejects URL-safe alphabet, missing/wrong padding, whitespace, and
 * non-canonical Node-tolerant encodings (round-trip must match exactly).
 */
export function parseCanonicalBase64Kek(raw: string): Buffer {
  if (typeof raw !== "string" || raw.length === 0) {
    throw new CredentialCryptoError("malformed_input");
  }

  // No trim: env values must be exact canonical Base64 (no surrounding whitespace).
  if (!CANONICAL_BASE64_32_BYTES.test(raw)) {
    // Distinguish wrong decoded length (valid-looking base64 of other sizes)
    // from alphabet/padding malformation when possible without accepting
    // Node's lenient decoder as authoritative.
    if (/^[A-Za-z0-9+/]*={0,2}$/.test(raw) && !/\s/.test(raw)) {
      let decoded: Buffer;
      try {
        decoded = Buffer.from(raw, "base64");
      } catch {
        throw new CredentialCryptoError("malformed_input");
      }
      const roundTrip = decoded.toString("base64");
      if (roundTrip === raw && decoded.length !== KEY_BYTE_LENGTH) {
        throw new CredentialCryptoError("invalid_key_length");
      }
    }
    throw new CredentialCryptoError("malformed_input");
  }

  let key: Buffer;
  try {
    key = Buffer.from(raw, "base64");
  } catch {
    throw new CredentialCryptoError("malformed_input");
  }

  if (key.length !== KEY_BYTE_LENGTH) {
    throw new CredentialCryptoError("invalid_key_length");
  }

  // Canonical round-trip: rejects Node-accepted non-canonical inputs that
  // somehow matched the length regex.
  if (key.toString("base64") !== raw) {
    throw new CredentialCryptoError("malformed_input");
  }

  return key;
}

/**
 * Explicit test/production injection: map of key_version → 32-byte KEK.
 * resolve() returns a fresh copy so callers can wipe without corrupting the map.
 */
export function createKekResolver(input: {
  readonly keys: ReadonlyMap<number, Buffer> | Readonly<Record<number, Buffer>>;
  readonly currentVersion: number;
}): KekResolver {
  if (
    !Number.isInteger(input.currentVersion) ||
    input.currentVersion < 1
  ) {
    throw new CredentialCryptoError("malformed_input");
  }

  const store = new Map<number, Buffer>();

  const entries =
    input.keys instanceof Map
      ? input.keys.entries()
      : Object.entries(input.keys).map(
          ([version, key]) =>
            [Number(version), key] as [number, Buffer],
        );

  for (const [version, key] of entries) {
    if (!Number.isInteger(version) || version < 1) {
      throw new CredentialCryptoError("malformed_input");
    }
    store.set(version, copyKey(key));
  }

  if (!store.has(input.currentVersion)) {
    throw new CredentialCryptoError("missing_key_version");
  }

  return {
    currentVersion: input.currentVersion,
    resolve(keyVersion: number): Buffer {
      if (!Number.isInteger(keyVersion) || keyVersion < 1) {
        throw new CredentialCryptoError("malformed_input");
      }
      const key = store.get(keyVersion);
      if (!key) {
        throw new CredentialCryptoError("unknown_key_version");
      }
      return Buffer.from(key);
    },
  };
}

/**
 * Dedicated server-only env reader for versioned KEKs.
 * Fail closed on missing current version, ambiguous names, malformed Base64,
 * invalid versions, or wrong key length.
 */
export function createKekResolverFromEnv(
  source: EnvironmentSource = process.env,
): KekResolver {
  const currentVersion = parseCurrentVersionFromEnv(
    source[ENV_CURRENT_VERSION],
  );

  const keys = new Map<number, Buffer>();

  for (const [name, value] of Object.entries(source)) {
    if (name === ENV_CURRENT_VERSION) {
      continue;
    }

    if (!name.startsWith(ENV_KEK_NAMESPACE)) {
      continue;
    }

    const matched = ENV_VERSIONED_KEK_NAME.exec(name);
    if (matched === null) {
      // Ambiguous / non-canonical KEK env name under our namespace.
      throw new CredentialCryptoError("malformed_input");
    }

    const version = parsePositiveVersionStrict(matched[1]!);

    if (value === undefined) {
      throw new CredentialCryptoError("malformed_input");
    }

    keys.set(version, parseCanonicalBase64Kek(value));
  }

  return createKekResolver({
    keys,
    currentVersion,
  });
}

export const INTEGRATION_CREDENTIALS_KEK_ENV = {
  keyPrefix: ENV_KEY_PREFIX,
  currentVersion: ENV_CURRENT_VERSION,
  namespace: ENV_KEK_NAMESPACE,
} as const;
