import "server-only";

import {
  encodeCredentialAad,
} from "@/lib/integration-credentials/aad";
import {
  aeadOpen,
  aeadSeal,
  generateDataEncryptionKey,
  wipeBuffer,
} from "@/lib/integration-credentials/aead";
import {
  CredentialCryptoError,
} from "@/lib/integration-credentials/errors";
import {
  type KekResolver,
} from "@/lib/integration-credentials/kek";
import {
  AUTH_TAG_BYTE_LENGTH,
  KEY_BYTE_LENGTH,
  NONCE_BYTE_LENGTH,
  type CredentialAadBinding,
  type DecryptedCredentialSet,
  type PlaintextCredentialSet,
  type SealedCredentialEnvelope,
  type SealedField,
} from "@/lib/integration-credentials/types";

function bindingFromPlaintext(
  plaintext: PlaintextCredentialSet,
  keyVersion: number,
): CredentialAadBinding {
  return {
    organizationId: plaintext.organizationId,
    integrationId: plaintext.integrationId,
    provider: plaintext.provider,
    tokenKind: plaintext.tokenKind,
    keyVersion,
  };
}

function bindingFromEnvelope(
  envelope: SealedCredentialEnvelope,
): CredentialAadBinding {
  return {
    organizationId: envelope.organizationId,
    integrationId: envelope.integrationId,
    provider: envelope.provider,
    tokenKind: envelope.tokenKind,
    keyVersion: envelope.keyVersion,
  };
}

function assertSealedFieldShape(field: SealedField): void {
  if (
    !Buffer.isBuffer(field.ciphertext) ||
    field.ciphertext.length === 0 ||
    !Buffer.isBuffer(field.nonce) ||
    field.nonce.length !== NONCE_BYTE_LENGTH ||
    !Buffer.isBuffer(field.authTag) ||
    field.authTag.length !== AUTH_TAG_BYTE_LENGTH
  ) {
    throw new CredentialCryptoError("malformed_input");
  }
}

function cloneSealedField(field: SealedField): SealedField {
  return {
    ciphertext: Buffer.from(field.ciphertext),
    nonce: Buffer.from(field.nonce),
    authTag: Buffer.from(field.authTag),
  };
}

/**
 * Encrypt a credential set under a fresh random DEK, wrap DEK with the
 * current KEK. Produces independent AES-256-GCM seals (access, optional
 * refresh, DEK wrap) each with its own 12-byte nonce and 16-byte auth tag.
 *
 * Compatible with CONN-1a bytea column shapes — no DB I/O.
 */
export function encryptCredentialSet(
  plaintext: PlaintextCredentialSet,
  kekResolver: KekResolver,
): SealedCredentialEnvelope {
  if (
    typeof plaintext.accessToken !== "string" ||
    plaintext.accessToken.length === 0
  ) {
    throw new CredentialCryptoError("malformed_input");
  }

  if (plaintext.tokenKind === "offline_expiring") {
    if (
      typeof plaintext.refreshToken !== "string" ||
      plaintext.refreshToken.length === 0
    ) {
      throw new CredentialCryptoError("token_kind_requires_refresh");
    }
  }

  const keyVersion = kekResolver.currentVersion;
  const kek = kekResolver.resolve(keyVersion);
  const dek = generateDataEncryptionKey();

  const accessPlain = Buffer.from(plaintext.accessToken, "utf8");
  const refreshPlain =
    plaintext.refreshToken !== null
      ? Buffer.from(plaintext.refreshToken, "utf8")
      : null;

  try {
    const binding = bindingFromPlaintext(plaintext, keyVersion);

    const access = aeadSeal({
      key: dek,
      plaintext: accessPlain,
      aad: encodeCredentialAad(binding, "access"),
    });

    const refresh =
      refreshPlain !== null
        ? aeadSeal({
            key: dek,
            plaintext: refreshPlain,
            aad: encodeCredentialAad(binding, "refresh"),
          })
        : null;

    const dekWrap = aeadSeal({
      key: kek,
      plaintext: dek,
      aad: encodeCredentialAad(binding, "dek_wrap"),
    });

    return {
      organizationId: plaintext.organizationId,
      integrationId: plaintext.integrationId,
      provider: plaintext.provider,
      tokenKind: plaintext.tokenKind,
      keyVersion,
      access: cloneSealedField(access),
      refresh: refresh ? cloneSealedField(refresh) : null,
      dekWrap: cloneSealedField(dekWrap),
    };
  } finally {
    wipeBuffer(dek);
    wipeBuffer(kek);
    wipeBuffer(accessPlain);
    if (refreshPlain) {
      wipeBuffer(refreshPlain);
    }
  }
}

/**
 * Decrypt a sealed credential envelope. Fail closed on wrong AAD, wrong KEK,
 * unknown key_version, malformed fields, or auth-tag failure.
 */
export function decryptCredentialSet(
  envelope: SealedCredentialEnvelope,
  kekResolver: KekResolver,
): DecryptedCredentialSet {
  if (
    !Number.isInteger(envelope.keyVersion) ||
    envelope.keyVersion < 1
  ) {
    throw new CredentialCryptoError("malformed_input");
  }

  assertSealedFieldShape(envelope.access);
  assertSealedFieldShape(envelope.dekWrap);
  if (envelope.refresh !== null) {
    assertSealedFieldShape(envelope.refresh);
  }

  if (
    envelope.tokenKind === "offline_expiring" &&
    envelope.refresh === null
  ) {
    throw new CredentialCryptoError("token_kind_requires_refresh");
  }

  const binding = bindingFromEnvelope(envelope);
  const kek = kekResolver.resolve(envelope.keyVersion);
  let dek: Buffer | null = null;
  let accessPlain: Buffer | null = null;
  let refreshPlain: Buffer | null = null;

  try {
    dek = aeadOpen({
      key: kek,
      sealed: envelope.dekWrap,
      aad: encodeCredentialAad(binding, "dek_wrap"),
    });

    if (dek.length !== KEY_BYTE_LENGTH) {
      throw new CredentialCryptoError("invalid_key_length");
    }

    accessPlain = aeadOpen({
      key: dek,
      sealed: envelope.access,
      aad: encodeCredentialAad(binding, "access"),
    });

    if (envelope.refresh !== null) {
      refreshPlain = aeadOpen({
        key: dek,
        sealed: envelope.refresh,
        aad: encodeCredentialAad(binding, "refresh"),
      });
    }

    return {
      accessToken: accessPlain.toString("utf8"),
      refreshToken: refreshPlain ? refreshPlain.toString("utf8") : null,
      keyVersion: envelope.keyVersion,
      tokenKind: envelope.tokenKind,
    };
  } finally {
    wipeBuffer(kek);
    if (dek) {
      wipeBuffer(dek);
    }
    if (accessPlain) {
      wipeBuffer(accessPlain);
    }
    if (refreshPlain) {
      wipeBuffer(refreshPlain);
    }
  }
}

/**
 * Map envelope sealed fields onto CONN-1a column names for future persistence
 * adapters. No I/O — serialization shape only.
 */
export function toIntegrationCredentialByteaColumns(
  envelope: SealedCredentialEnvelope,
): {
  access_ciphertext: Buffer;
  access_nonce: Buffer;
  access_auth_tag: Buffer;
  refresh_ciphertext: Buffer | null;
  refresh_nonce: Buffer | null;
  refresh_auth_tag: Buffer | null;
  dek_wrapped: Buffer;
  dek_wrap_nonce: Buffer;
  dek_wrap_auth_tag: Buffer;
  key_version: number;
} {
  assertSealedFieldShape(envelope.access);
  assertSealedFieldShape(envelope.dekWrap);
  if (envelope.refresh !== null) {
    assertSealedFieldShape(envelope.refresh);
  }

  return {
    access_ciphertext: Buffer.from(envelope.access.ciphertext),
    access_nonce: Buffer.from(envelope.access.nonce),
    access_auth_tag: Buffer.from(envelope.access.authTag),
    refresh_ciphertext: envelope.refresh
      ? Buffer.from(envelope.refresh.ciphertext)
      : null,
    refresh_nonce: envelope.refresh
      ? Buffer.from(envelope.refresh.nonce)
      : null,
    refresh_auth_tag: envelope.refresh
      ? Buffer.from(envelope.refresh.authTag)
      : null,
    dek_wrapped: Buffer.from(envelope.dekWrap.ciphertext),
    dek_wrap_nonce: Buffer.from(envelope.dekWrap.nonce),
    dek_wrap_auth_tag: Buffer.from(envelope.dekWrap.authTag),
    key_version: envelope.keyVersion,
  };
}
