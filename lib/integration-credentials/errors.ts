import "server-only";

/**
 * Safe credential-crypto failure classes.
 * Messages are stable error codes only — never plaintext, keys, ciphertext,
 * nonces, tags, or AAD bytes.
 */

export type CredentialCryptoErrorCode =
  | "malformed_input"
  | "invalid_key_length"
  | "missing_key_version"
  | "unknown_key_version"
  | "decrypt_failed"
  | "unsupported_aad_version"
  | "token_kind_requires_refresh";

export class CredentialCryptoError extends Error {
  readonly code: CredentialCryptoErrorCode;

  constructor(code: CredentialCryptoErrorCode) {
    super(code);
    this.name = "CredentialCryptoError";
    this.code = code;
  }
}

export function isCredentialCryptoError(
  value: unknown,
): value is CredentialCryptoError {
  return value instanceof CredentialCryptoError;
}
