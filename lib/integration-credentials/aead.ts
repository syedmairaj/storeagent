import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

import {
  CredentialCryptoError,
} from "@/lib/integration-credentials/errors";
import {
  AEAD_ALGORITHM,
  AUTH_TAG_BYTE_LENGTH,
  KEY_BYTE_LENGTH,
  NONCE_BYTE_LENGTH,
  type SealedField,
} from "@/lib/integration-credentials/types";

/**
 * Low-level AES-256-GCM seal/open.
 * Auth tag is returned separately (CONN-1a stores tag in its own bytea column).
 * Seal nonces are generated internally — callers cannot supply or reuse them.
 */

export function assertAes256Key(key: Buffer): void {
  if (!Buffer.isBuffer(key) || key.length !== KEY_BYTE_LENGTH) {
    throw new CredentialCryptoError("invalid_key_length");
  }
}

export function generateDataEncryptionKey(): Buffer {
  return randomBytes(KEY_BYTE_LENGTH);
}

export function generateNonce(): Buffer {
  return randomBytes(NONCE_BYTE_LENGTH);
}

/**
 * Best-effort overwrite of a Buffer. JavaScript does not guarantee
 * zeroization against GC copies, heap snapshots, or OS swapping.
 */
export function wipeBuffer(buffer: Buffer): void {
  if (Buffer.isBuffer(buffer) && buffer.length > 0) {
    buffer.fill(0);
  }
}

export function aeadSeal(input: {
  readonly key: Buffer;
  readonly plaintext: Buffer;
  readonly aad: Buffer;
}): SealedField {
  // Runtime guard: production seal API rejects caller-controlled nonces.
  if (
    Object.prototype.hasOwnProperty.call(input, "nonce")
  ) {
    throw new CredentialCryptoError("malformed_input");
  }

  assertAes256Key(input.key);

  if (!Buffer.isBuffer(input.plaintext) || input.plaintext.length === 0) {
    throw new CredentialCryptoError("malformed_input");
  }
  if (!Buffer.isBuffer(input.aad) || input.aad.length === 0) {
    throw new CredentialCryptoError("malformed_input");
  }

  const nonce = generateNonce();

  try {
    const cipher = createCipheriv(AEAD_ALGORITHM, input.key, nonce, {
      authTagLength: AUTH_TAG_BYTE_LENGTH,
    });
    cipher.setAAD(input.aad);
    const ciphertext = Buffer.concat([
      cipher.update(input.plaintext),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    if (authTag.length !== AUTH_TAG_BYTE_LENGTH) {
      throw new CredentialCryptoError("malformed_input");
    }
    return {
      ciphertext,
      nonce,
      authTag,
    };
  } catch (error) {
    if (error instanceof CredentialCryptoError) {
      throw error;
    }
    throw new CredentialCryptoError("malformed_input");
  }
}

export function aeadOpen(input: {
  readonly key: Buffer;
  readonly sealed: SealedField;
  readonly aad: Buffer;
}): Buffer {
  assertAes256Key(input.key);

  const { sealed, aad } = input;
  if (
    !Buffer.isBuffer(sealed.ciphertext) ||
    sealed.ciphertext.length === 0 ||
    !Buffer.isBuffer(sealed.nonce) ||
    sealed.nonce.length !== NONCE_BYTE_LENGTH ||
    !Buffer.isBuffer(sealed.authTag) ||
    sealed.authTag.length !== AUTH_TAG_BYTE_LENGTH ||
    !Buffer.isBuffer(aad) ||
    aad.length === 0
  ) {
    throw new CredentialCryptoError("malformed_input");
  }

  try {
    const decipher = createDecipheriv(
      AEAD_ALGORITHM,
      input.key,
      sealed.nonce,
      {
        authTagLength: AUTH_TAG_BYTE_LENGTH,
      },
    );
    decipher.setAAD(aad);
    decipher.setAuthTag(sealed.authTag);
    return Buffer.concat([
      decipher.update(sealed.ciphertext),
      decipher.final(),
    ]);
  } catch (error) {
    if (error instanceof CredentialCryptoError) {
      throw error;
    }
    throw new CredentialCryptoError("decrypt_failed");
  }
}
