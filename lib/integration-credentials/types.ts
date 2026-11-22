import "server-only";

/** AES-256-GCM sizes frozen by CONN-1a schema constraints. */
export const AEAD_ALGORITHM = "aes-256-gcm" as const;
export const KEY_BYTE_LENGTH = 32;
export const NONCE_BYTE_LENGTH = 12;
export const AUTH_TAG_BYTE_LENGTH = 16;

/** Canonical AAD wire format version (integer, not KEK key_version). */
export const AAD_FORMAT_VERSION = 1 as const;

/**
 * Seal purpose bound into AAD so access / refresh / DEK-wrap cannot be swapped.
 * Numeric codes are stable wire values for format version 1.
 */
export const SEAL_PURPOSE = {
  access: 1,
  refresh: 2,
  dek_wrap: 3,
} as const;

export type SealPurpose = keyof typeof SEAL_PURPOSE;

/** Provider values allowed by CONN-1a (kept as string for binding; not re-validated here). */
export type CredentialTokenKind = "offline_expiring";

export type CredentialAadBinding = {
  readonly organizationId: string;
  readonly integrationId: string;
  readonly provider: string;
  readonly tokenKind: CredentialTokenKind;
  readonly keyVersion: number;
};

export type SealedField = {
  readonly ciphertext: Buffer;
  readonly nonce: Buffer;
  readonly authTag: Buffer;
};

/**
 * Binary envelope aligned with public.integration_credentials sealed columns.
 * Ciphertext / nonce / auth_tag are separate Buffers matching independent bytea fields.
 */
export type SealedCredentialEnvelope = {
  readonly organizationId: string;
  readonly integrationId: string;
  readonly provider: string;
  readonly tokenKind: CredentialTokenKind;
  readonly keyVersion: number;
  readonly access: SealedField;
  readonly refresh: SealedField | null;
  readonly dekWrap: SealedField;
};

export type PlaintextCredentialSet = {
  readonly organizationId: string;
  readonly integrationId: string;
  readonly provider: string;
  readonly tokenKind: CredentialTokenKind;
  readonly accessToken: string;
  readonly refreshToken: string | null;
};

export type DecryptedCredentialSet = {
  readonly accessToken: string;
  readonly refreshToken: string | null;
  readonly keyVersion: number;
  readonly tokenKind: CredentialTokenKind;
};
