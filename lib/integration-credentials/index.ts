import "server-only";

/**
 * SHOPIFY-CONN-1b — server-only AES-256-GCM envelope primitives.
 * Provider-neutral; compatible with CONN-1a integration_credentials bytea shape.
 * No DB persistence, OAuth, or runtime activation in this slice.
 */

export {
  decodeCredentialAad,
  encodeCredentialAad,
} from "@/lib/integration-credentials/aad";

export {
  aeadOpen,
  aeadSeal,
  assertAes256Key,
  generateDataEncryptionKey,
  generateNonce,
  wipeBuffer,
} from "@/lib/integration-credentials/aead";

export {
  decryptCredentialSet,
  encryptCredentialSet,
  toIntegrationCredentialByteaColumns,
} from "@/lib/integration-credentials/envelope";

export {
  CredentialCryptoError,
  isCredentialCryptoError,
  type CredentialCryptoErrorCode,
} from "@/lib/integration-credentials/errors";

export {
  createKekResolver,
  createKekResolverFromEnv,
  INTEGRATION_CREDENTIALS_KEK_ENV,
  parseCanonicalBase64Kek,
  type KekResolver,
} from "@/lib/integration-credentials/kek";

export {
  AAD_FORMAT_VERSION,
  AEAD_ALGORITHM,
  AUTH_TAG_BYTE_LENGTH,
  KEY_BYTE_LENGTH,
  NONCE_BYTE_LENGTH,
  SEAL_PURPOSE,
  type CredentialAadBinding,
  type CredentialTokenKind,
  type DecryptedCredentialSet,
  type PlaintextCredentialSet,
  type SealPurpose,
  type SealedCredentialEnvelope,
  type SealedField,
} from "@/lib/integration-credentials/types";
