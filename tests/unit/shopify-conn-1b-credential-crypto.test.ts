import {
  randomBytes,
} from "node:crypto";

import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("server-only", () => ({}));

import {
  AAD_FORMAT_VERSION,
  AUTH_TAG_BYTE_LENGTH,
  CredentialCryptoError,
  KEY_BYTE_LENGTH,
  NONCE_BYTE_LENGTH,
  SEAL_PURPOSE,
  aeadSeal,
  createKekResolver,
  createKekResolverFromEnv,
  decodeCredentialAad,
  decryptCredentialSet,
  encodeCredentialAad,
  encryptCredentialSet,
  generateDataEncryptionKey,
  parseCanonicalBase64Kek,
  toIntegrationCredentialByteaColumns,
  type PlaintextCredentialSet,
  type SealedCredentialEnvelope,
} from "@/lib/integration-credentials";

const ORG_A = "c011b000-0000-4000-8000-000000000001";
const ORG_B = "c011b000-0000-4000-8000-000000000011";
const INTEG_A = "c011b000-0000-4000-8000-000000000003";
const INTEG_B = "c011b000-0000-4000-8000-000000000013";

const ACCESS_FIXTURE = "shpat_test_access_token_fixture_aaaa";
const REFRESH_FIXTURE = "shprt_test_refresh_token_fixture_bbbb";

function testKek(seed: number): Buffer {
  const key = Buffer.alloc(KEY_BYTE_LENGTH);
  key.fill(seed & 0xff);
  key[0] = seed & 0xff;
  key[31] = (seed >> 8) & 0xff;
  return key;
}

function resolver(version = 1, kek = testKek(0x41)) {
  return createKekResolver({
    keys: new Map([[version, kek]]),
    currentVersion: version,
  });
}

function plaintext(overrides?: Partial<PlaintextCredentialSet>): PlaintextCredentialSet {
  return {
    organizationId: ORG_A,
    integrationId: INTEG_A,
    provider: "shopify",
    tokenKind: "offline_expiring",
    accessToken: ACCESS_FIXTURE,
    refreshToken: REFRESH_FIXTURE,
    ...overrides,
  };
}

function expectCryptoFailure(
  fn: () => unknown,
  code?: string,
): void {
  try {
    fn();
    expect.unreachable("expected CredentialCryptoError");
  } catch (error) {
    expect(error).toBeInstanceOf(CredentialCryptoError);
    const err = error as CredentialCryptoError;
    if (code) {
      expect(err.code).toBe(code);
    }
    expect(err.message).toBe(err.code);
    expect(err.message).not.toContain(ACCESS_FIXTURE);
    expect(err.message).not.toContain(REFRESH_FIXTURE);
    expect(String(error)).not.toContain(ACCESS_FIXTURE);
    expect(String(error)).not.toContain("shpat_");
  }
}

describe("SHOPIFY-CONN-1b credential AEAD crypto", () => {
  it("V1: encrypt→decrypt round-trip; wrong key and wrong AAD fail closed", () => {
    const sealed = encryptCredentialSet(plaintext(), resolver(1));
    const opened = decryptCredentialSet(sealed, resolver(1));

    expect(opened.accessToken).toBe(ACCESS_FIXTURE);
    expect(opened.refreshToken).toBe(REFRESH_FIXTURE);
    expect(opened.keyVersion).toBe(1);

    expectCryptoFailure(
      () => decryptCredentialSet(sealed, resolver(1, testKek(0x99))),
      "decrypt_failed",
    );

    const wrongOrg: SealedCredentialEnvelope = {
      ...sealed,
      organizationId: ORG_B,
    };
    expectCryptoFailure(
      () => decryptCredentialSet(wrongOrg, resolver(1)),
      "decrypt_failed",
    );
  });

  it("V2: ciphertext for org A cannot decrypt under org B / integration B AAD", () => {
    const sealed = encryptCredentialSet(plaintext(), resolver(1));

    expectCryptoFailure(() =>
      decryptCredentialSet(
        { ...sealed, organizationId: ORG_B },
        resolver(1),
      ),
    );

    expectCryptoFailure(() =>
      decryptCredentialSet(
        { ...sealed, integrationId: INTEG_B },
        resolver(1),
      ),
    );

    expectCryptoFailure(() =>
      decryptCredentialSet(
        { ...sealed, provider: "woocommerce" },
        resolver(1),
      ),
    );
  });

  it("V3 crypto: unknown/missing key_version fails closed (no silent fallback)", () => {
    const sealed = encryptCredentialSet(plaintext(), resolver(1));

    const v2Only = createKekResolver({
      keys: new Map([[2, testKek(0x42)]]),
      currentVersion: 2,
    });

    expectCryptoFailure(
      () => decryptCredentialSet(sealed, v2Only),
      "unknown_key_version",
    );

    expectCryptoFailure(
      () =>
        createKekResolver({
          keys: new Map([[1, testKek(0x41)]]),
          currentVersion: 2,
        }),
      "missing_key_version",
    );

    const multi = createKekResolver({
      keys: new Map([
        [1, testKek(0x41)],
        [2, testKek(0x42)],
      ]),
      currentVersion: 2,
    });
    const sealedV2 = encryptCredentialSet(plaintext(), multi);
    expect(sealedV2.keyVersion).toBe(2);
    expect(decryptCredentialSet(sealedV2, multi).accessToken).toBe(
      ACCESS_FIXTURE,
    );
    expectCryptoFailure(() =>
      decryptCredentialSet(sealedV2, resolver(1)),
    );
  });

  it("uses distinct random nonces and independent auth tags per seal", () => {
    const a = encryptCredentialSet(plaintext(), resolver(1));
    const b = encryptCredentialSet(plaintext(), resolver(1));

    const nonces = [
      a.access.nonce,
      a.refresh!.nonce,
      a.dekWrap.nonce,
      b.access.nonce,
      b.refresh!.nonce,
      b.dekWrap.nonce,
    ];

    for (const nonce of nonces) {
      expect(nonce.length).toBe(NONCE_BYTE_LENGTH);
    }

    const nonceHex = new Set(nonces.map((n) => n.toString("hex")));
    expect(nonceHex.size).toBe(nonces.length);

    const tags = [
      a.access.authTag,
      a.refresh!.authTag,
      a.dekWrap.authTag,
    ];
    for (const tag of tags) {
      expect(tag.length).toBe(AUTH_TAG_BYTE_LENGTH);
    }
    expect(new Set(tags.map((t) => t.toString("hex"))).size).toBe(3);

    expect(a.access.ciphertext.equals(b.access.ciphertext)).toBe(false);
  });

  it("denies access/refresh seal swap via purpose-bound AAD", () => {
    const sealed = encryptCredentialSet(plaintext(), resolver(1));

    const swapped: SealedCredentialEnvelope = {
      ...sealed,
      access: sealed.refresh!,
      refresh: sealed.access,
    };

    expectCryptoFailure(
      () => decryptCredentialSet(swapped, resolver(1)),
      "decrypt_failed",
    );
  });

  it("fails closed on wrong/missing KEK, malformed ciphertext, missing tag, wrong nonce", () => {
    const sealed = encryptCredentialSet(plaintext(), resolver(1));

    expectCryptoFailure(
      () =>
        createKekResolverFromEnv({
          INTEGRATION_CREDENTIALS_KEK_CURRENT_VERSION: "1",
        }),
      "missing_key_version",
    );

    expectCryptoFailure(
      () =>
        createKekResolverFromEnv({
          INTEGRATION_CREDENTIALS_KEK_CURRENT_VERSION: "1",
          INTEGRATION_CREDENTIALS_KEK_V1: Buffer.alloc(16).toString("base64"),
        }),
      "invalid_key_length",
    );

    const envResolver = createKekResolverFromEnv({
      INTEGRATION_CREDENTIALS_KEK_CURRENT_VERSION: "1",
      INTEGRATION_CREDENTIALS_KEK_V1: testKek(0x41).toString("base64"),
    });
    expect(decryptCredentialSet(sealed, envResolver).accessToken).toBe(
      ACCESS_FIXTURE,
    );

    const badCipher: SealedCredentialEnvelope = {
      ...sealed,
      access: {
        ...sealed.access,
        ciphertext: Buffer.from(sealed.access.ciphertext),
      },
    };
    badCipher.access.ciphertext[0]! ^= 0xff;
    expectCryptoFailure(
      () => decryptCredentialSet(badCipher, resolver(1)),
      "decrypt_failed",
    );

    expectCryptoFailure(
      () =>
        decryptCredentialSet(
          {
            ...sealed,
            access: {
              ...sealed.access,
              authTag: Buffer.alloc(0),
            },
          },
          resolver(1),
        ),
      "malformed_input",
    );

    expectCryptoFailure(
      () =>
        decryptCredentialSet(
          {
            ...sealed,
            access: {
              ...sealed.access,
              nonce: Buffer.alloc(NONCE_BYTE_LENGTH - 1, 1),
            },
          },
          resolver(1),
        ),
      "malformed_input",
    );

    const wrongNonce: SealedCredentialEnvelope = {
      ...sealed,
      access: {
        ...sealed.access,
        nonce: randomBytes(NONCE_BYTE_LENGTH),
      },
    };
    expectCryptoFailure(
      () => decryptCredentialSet(wrongNonce, resolver(1)),
      "decrypt_failed",
    );
  });

  it("encodes AAD deterministically and distinguishes purposes", () => {
    const binding = {
      organizationId: ORG_A,
      integrationId: INTEG_A,
      provider: "shopify",
      tokenKind: "offline_expiring" as const,
      keyVersion: 1,
    };

    const accessA = encodeCredentialAad(binding, "access");
    const accessB = encodeCredentialAad(binding, "access");
    expect(accessA.equals(accessB)).toBe(true);
    expect(accessA[0]).toBe(AAD_FORMAT_VERSION);
    expect(accessA[1]).toBe(SEAL_PURPOSE.access);

    const refresh = encodeCredentialAad(binding, "refresh");
    const dekWrap = encodeCredentialAad(binding, "dek_wrap");
    expect(accessA.equals(refresh)).toBe(false);
    expect(accessA.equals(dekWrap)).toBe(false);
    expect(refresh[1]).toBe(SEAL_PURPOSE.refresh);
    expect(dekWrap[1]).toBe(SEAL_PURPOSE.dek_wrap);

    const decoded = decodeCredentialAad(accessA);
    expect(decoded).toEqual({
      formatVersion: 1,
      purpose: "access",
      organizationId: ORG_A,
      integrationId: INTEG_A,
      provider: "shopify",
      tokenKind: "offline_expiring",
      keyVersion: 1,
    });

    const orgB = encodeCredentialAad(
      { ...binding, organizationId: ORG_B },
      "access",
    );
    expect(accessA.equals(orgB)).toBe(false);
  });

  it("maps sealed fields to CONN-1a bytea column shapes", () => {
    const sealed = encryptCredentialSet(plaintext(), resolver(1));
    const columns = toIntegrationCredentialByteaColumns(sealed);

    expect(columns.access_nonce.length).toBe(12);
    expect(columns.access_auth_tag.length).toBe(16);
    expect(columns.refresh_nonce!.length).toBe(12);
    expect(columns.refresh_auth_tag!.length).toBe(16);
    expect(columns.dek_wrap_nonce.length).toBe(12);
    expect(columns.dek_wrap_auth_tag.length).toBe(16);
    expect(columns.access_ciphertext.length).toBeGreaterThan(0);
    expect(columns.refresh_ciphertext!.length).toBeGreaterThan(0);
    expect(columns.dek_wrapped.length).toBe(KEY_BYTE_LENGTH);
    expect(columns.key_version).toBe(1);
  });

  it("never embeds secrets in CredentialCryptoError messages", () => {
    const kek = generateDataEncryptionKey();
    const sealed = encryptCredentialSet(
      plaintext(),
      createKekResolver({
        keys: new Map([[1, kek]]),
        currentVersion: 1,
      }),
    );

    expectCryptoFailure(() =>
      decryptCredentialSet(sealed, resolver(1, testKek(0x77))),
    );

    expectCryptoFailure(
      () =>
        encryptCredentialSet(
          plaintext({ refreshToken: null }),
          resolver(1),
        ),
      "token_kind_requires_refresh",
    );

    expectCryptoFailure(
      () =>
        createKekResolver({
          keys: new Map([[1, Buffer.alloc(8)]]),
          currentVersion: 1,
        }),
      "invalid_key_length",
    );
  });

  it("rejects malformed Base64 KEK encodings (canonical-only)", () => {
    const canonical = testKek(0x41).toString("base64");
    expect(parseCanonicalBase64Kek(canonical).equals(testKek(0x41))).toBe(
      true,
    );

    // Missing padding (Node would often accept; we must not).
    const unpadded = canonical.replace(/=+$/, "");
    expectCryptoFailure(
      () => parseCanonicalBase64Kek(unpadded),
      "malformed_input",
    );

    // URL-safe alphabet characters are never accepted.
    expectCryptoFailure(
      () =>
        parseCanonicalBase64Kek(
          `${"A".repeat(42)}-_=`,
        ),
      "malformed_input",
    );

    expectCryptoFailure(
      () => parseCanonicalBase64Kek(` ${canonical}`),
      "malformed_input",
    );
    expectCryptoFailure(
      () => parseCanonicalBase64Kek(`${canonical}\n`),
      "malformed_input",
    );
    expectCryptoFailure(
      () => parseCanonicalBase64Kek(""),
      "malformed_input",
    );
    expectCryptoFailure(
      () => parseCanonicalBase64Kek("!!!not-base64!!!"),
      "malformed_input",
    );

    // Wrong length but otherwise canonical Base64 of 16 bytes.
    expectCryptoFailure(
      () => parseCanonicalBase64Kek(Buffer.alloc(16).toString("base64")),
      "invalid_key_length",
    );
  });

  it("rejects invalid / ambiguous KEK env version names", () => {
    const good = testKek(0x41).toString("base64");

    expectCryptoFailure(
      () =>
        createKekResolverFromEnv({
          INTEGRATION_CREDENTIALS_KEK_CURRENT_VERSION: "01",
          INTEGRATION_CREDENTIALS_KEK_V1: good,
        }),
      "malformed_input",
    );

    expectCryptoFailure(
      () =>
        createKekResolverFromEnv({
          INTEGRATION_CREDENTIALS_KEK_CURRENT_VERSION: "0",
          INTEGRATION_CREDENTIALS_KEK_V1: good,
        }),
      "malformed_input",
    );

    expectCryptoFailure(
      () =>
        createKekResolverFromEnv({
          INTEGRATION_CREDENTIALS_KEK_CURRENT_VERSION: "1",
          INTEGRATION_CREDENTIALS_KEK: good,
        }),
      "malformed_input",
    );

    expectCryptoFailure(
      () =>
        createKekResolverFromEnv({
          INTEGRATION_CREDENTIALS_KEK_CURRENT_VERSION: "1",
          INTEGRATION_CREDENTIALS_KEK_V01: good,
        }),
      "malformed_input",
    );

    expectCryptoFailure(
      () =>
        createKekResolverFromEnv({
          INTEGRATION_CREDENTIALS_KEK_CURRENT_VERSION: "1",
          INTEGRATION_CREDENTIALS_KEK_V1_BACKUP: good,
        }),
      "malformed_input",
    );

    expectCryptoFailure(
      () =>
        createKekResolverFromEnv({
          INTEGRATION_CREDENTIALS_KEK_CURRENT_VERSION: "1",
          INTEGRATION_CREDENTIALS_KEK_V1: good,
          INTEGRATION_CREDENTIALS_KEK_V2EXTRA: good,
        }),
      "malformed_input",
    );

    // Valid canonical pair still works.
    const ok = createKekResolverFromEnv({
      INTEGRATION_CREDENTIALS_KEK_CURRENT_VERSION: "1",
      INTEGRATION_CREDENTIALS_KEK_V1: good,
    });
    expect(ok.currentVersion).toBe(1);
    expect(ok.resolve(1).length).toBe(KEY_BYTE_LENGTH);
  });

  it("rejects caller-controlled nonce on aeadSeal (internal random only)", () => {
    const key = generateDataEncryptionKey();
    const plaintextBuf = Buffer.from("token-value", "utf8");
    const aad = Buffer.from("aad-v1", "utf8");

    const sealed = aeadSeal({ key, plaintext: plaintextBuf, aad });
    expect(sealed.nonce.length).toBe(NONCE_BYTE_LENGTH);
    expect(sealed.authTag.length).toBe(AUTH_TAG_BYTE_LENGTH);

    const again = aeadSeal({ key, plaintext: plaintextBuf, aad });
    expect(sealed.nonce.equals(again.nonce)).toBe(false);

    expectCryptoFailure(
      () =>
        aeadSeal({
          key,
          plaintext: plaintextBuf,
          aad,
          // @ts-expect-error production API must not accept caller nonce
          nonce: randomBytes(NONCE_BYTE_LENGTH),
        }),
      "malformed_input",
    );
  });
});
