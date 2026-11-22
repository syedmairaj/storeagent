import "server-only";

import {
  CredentialCryptoError,
} from "@/lib/integration-credentials/errors";
import {
  AAD_FORMAT_VERSION,
  SEAL_PURPOSE,
  type CredentialAadBinding,
  type SealPurpose,
} from "@/lib/integration-credentials/types";

/**
 * Canonical AAD encoding (format version 1).
 *
 * Layout (big-endian):
 *   u8  aad_format_version (=1)
 *   u8  seal_purpose       (1=access, 2=refresh, 3=dek_wrap)
 *   u16 organization_id UTF-8 length + bytes
 *   u16 integration_id UTF-8 length + bytes
 *   u16 provider UTF-8 length + bytes
 *   u16 token_kind UTF-8 length + bytes
 *   u32 key_version
 *
 * Binds the CONN-1 required fields and distinguishes seal purpose so
 * access/refresh/DEK-wrap cannot be authenticated interchangeably.
 */

const MAX_FIELD_BYTES = 2048;

function requireNonEmptyString(
  value: string,
  label: string,
): Buffer {
  if (typeof value !== "string" || value.length === 0) {
    void label;
    throw new CredentialCryptoError("malformed_input");
  }
  const buf = Buffer.from(value, "utf8");
  if (buf.length === 0 || buf.length > MAX_FIELD_BYTES) {
    throw new CredentialCryptoError("malformed_input");
  }
  return buf;
}

function writeLengthPrefixed(
  chunks: Buffer[],
  field: Buffer,
): void {
  if (field.length > 0xffff) {
    throw new CredentialCryptoError("malformed_input");
  }
  const len = Buffer.alloc(2);
  len.writeUInt16BE(field.length, 0);
  chunks.push(len, field);
}

export function encodeCredentialAad(
  binding: CredentialAadBinding,
  purpose: SealPurpose,
): Buffer {
  if (
    !Number.isInteger(binding.keyVersion) ||
    binding.keyVersion < 1 ||
    binding.keyVersion > 0xffffffff
  ) {
    throw new CredentialCryptoError("malformed_input");
  }

  const purposeCode = SEAL_PURPOSE[purpose];
  if (purposeCode === undefined) {
    throw new CredentialCryptoError("malformed_input");
  }

  const organizationId = requireNonEmptyString(
    binding.organizationId,
    "organizationId",
  );
  const integrationId = requireNonEmptyString(
    binding.integrationId,
    "integrationId",
  );
  const provider = requireNonEmptyString(binding.provider, "provider");
  const tokenKind = requireNonEmptyString(binding.tokenKind, "tokenKind");

  const header = Buffer.alloc(2);
  header.writeUInt8(AAD_FORMAT_VERSION, 0);
  header.writeUInt8(purposeCode, 1);

  const keyVersionBuf = Buffer.alloc(4);
  keyVersionBuf.writeUInt32BE(binding.keyVersion, 0);

  const chunks: Buffer[] = [header];
  writeLengthPrefixed(chunks, organizationId);
  writeLengthPrefixed(chunks, integrationId);
  writeLengthPrefixed(chunks, provider);
  writeLengthPrefixed(chunks, tokenKind);
  chunks.push(keyVersionBuf);

  return Buffer.concat(chunks);
}

/**
 * Decode for deterministic tests / diagnostics only.
 * Never logs field values; throws CredentialCryptoError on malformation.
 */
export function decodeCredentialAad(aad: Buffer): {
  formatVersion: number;
  purpose: SealPurpose;
  organizationId: string;
  integrationId: string;
  provider: string;
  tokenKind: string;
  keyVersion: number;
} {
  if (!Buffer.isBuffer(aad) || aad.length < 2 + 4) {
    throw new CredentialCryptoError("malformed_input");
  }

  const formatVersion = aad.readUInt8(0);
  if (formatVersion !== AAD_FORMAT_VERSION) {
    throw new CredentialCryptoError("unsupported_aad_version");
  }

  const purposeCode = aad.readUInt8(1);
  let purpose: SealPurpose;
  if (purposeCode === SEAL_PURPOSE.access) {
    purpose = "access";
  } else if (purposeCode === SEAL_PURPOSE.refresh) {
    purpose = "refresh";
  } else if (purposeCode === SEAL_PURPOSE.dek_wrap) {
    purpose = "dek_wrap";
  } else {
    throw new CredentialCryptoError("malformed_input");
  }

  let offset = 2;

  function readField(): string {
    if (offset + 2 > aad.length) {
      throw new CredentialCryptoError("malformed_input");
    }
    const len = aad.readUInt16BE(offset);
    offset += 2;
    if (len === 0 || offset + len > aad.length) {
      throw new CredentialCryptoError("malformed_input");
    }
    const slice = aad.subarray(offset, offset + len);
    offset += len;
    return slice.toString("utf8");
  }

  const organizationId = readField();
  const integrationId = readField();
  const provider = readField();
  const tokenKind = readField();

  if (offset + 4 !== aad.length) {
    throw new CredentialCryptoError("malformed_input");
  }
  const keyVersion = aad.readUInt32BE(offset);

  return {
    formatVersion,
    purpose,
    organizationId,
    integrationId,
    provider,
    tokenKind,
    keyVersion,
  };
}
