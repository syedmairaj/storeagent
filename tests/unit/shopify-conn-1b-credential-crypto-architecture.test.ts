import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

const ROOT = process.cwd();
const CRYPTO_DIR = "lib/integration-credentials";

const CRYPTO_FILES = [
  "index.ts",
  "aad.ts",
  "aead.ts",
  "envelope.ts",
  "errors.ts",
  "kek.ts",
  "types.ts",
] as const;

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

describe("SHOPIFY-CONN-1b credential crypto architecture", () => {
  it("marks every crypto module server-only", () => {
    for (const file of CRYPTO_FILES) {
      const text = read(`${CRYPTO_DIR}/${file}`);
      expect(text.startsWith('import "server-only"')).toBe(true);
    }
  });

  it("does not expose KEK via NEXT_PUBLIC or browser-facing env helpers", () => {
    for (const file of CRYPTO_FILES) {
      const text = read(`${CRYPTO_DIR}/${file}`);
      expect(text).not.toMatch(/NEXT_PUBLIC_/);
      expect(text).not.toContain("readPublicEnvironment");
    }

    const env = read("lib/config/env.ts");
    expect(env).not.toContain("INTEGRATION_CREDENTIALS_KEK");
  });

  it("keeps crypto offline — no DB, Shopify HTTP, OAuth, or vault RPC", () => {
    for (const file of CRYPTO_FILES) {
      const text = read(`${CRYPTO_DIR}/${file}`);
      expect(text).not.toMatch(/\b(fetch|supabase|createClient)\b/);
      expect(text).not.toMatch(/\.(from|rpc)\(\s*['"`]/);
      expect(text).not.toContain("oauth");
      expect(text).not.toContain("shopify.com");
      expect(text).not.toContain("process.env.SHOPIFY");
    }
  });

  it("uses Node crypto AES-256-GCM only (no new crypto dependency)", () => {
    const aead = read(`${CRYPTO_DIR}/aead.ts`);
    const types = read(`${CRYPTO_DIR}/types.ts`);
    expect(aead).toContain('from "node:crypto"');
    expect(aead).toContain("createCipheriv");
    expect(aead).toContain("createDecipheriv");
    expect(aead).toContain("AEAD_ALGORITHM");
    expect(types).toContain('"aes-256-gcm"');

    const pkg = read("package.json");
    expect(pkg).not.toMatch(
      /"(tweetnacl|libsodium|noble-ciphers|node-forge|crypto-js)"/,
    );
  });

  it("generates seal nonces internally and enforces canonical Base64 KEKs", () => {
    const aead = read(`${CRYPTO_DIR}/aead.ts`);
    expect(aead).toContain("generateNonce()");
    expect(aead).toContain('hasOwnProperty.call(input, "nonce")');
    expect(aead).not.toMatch(/readonly nonce\?:/);

    const kek = read(`${CRYPTO_DIR}/kek.ts`);
    expect(kek).toContain("parseCanonicalBase64Kek");
    expect(kek).toContain("CANONICAL_BASE64_32_BYTES");
    expect(kek).toContain("ENV_VERSIONED_KEK_NAME");
    expect(kek).toContain("toString(\"base64\") !== raw");
  });

  it("binds AAD purpose for access, refresh, and dek_wrap", () => {
    const aad = read(`${CRYPTO_DIR}/aad.ts`);
    const types = read(`${CRYPTO_DIR}/types.ts`);
    expect(types).toContain("access:");
    expect(types).toContain("refresh:");
    expect(types).toContain("dek_wrap:");
    expect(aad).toContain("AAD_FORMAT_VERSION");
    expect(aad).toContain("organizationId");
    expect(aad).toContain("integrationId");
    expect(aad).toContain("tokenKind");
    expect(aad).toContain("keyVersion");
  });

  it("error messages are codes only — no secret interpolation templates", () => {
    const errors = read(`${CRYPTO_DIR}/errors.ts`);
    expect(errors).toContain("super(code)");
    expect(errors).not.toMatch(/\$\{/);
    expect(errors).toContain('this.name = "CredentialCryptoError"');
    expect(errors).not.toMatch(
      /super\([^)]*(ciphertext|plaintext|token|key)/i,
    );

    for (const file of CRYPTO_FILES) {
      const text = read(`${CRYPTO_DIR}/${file}`);
      expect(text).not.toMatch(
        /console\.(log|info|debug|warn|error)\(/,
      );
    }
  });

  it("does not import crypto modules from client components or app routes", () => {
    const clientAndApp = [
      ...fs
        .readdirSync(path.join(ROOT, "app"), { recursive: true })
        .map(String)
        .filter((p) => p.endsWith(".ts") || p.endsWith(".tsx"))
        .map((p) => path.join("app", p)),
      ...fs
        .readdirSync(path.join(ROOT, "components"), { recursive: true })
        .map(String)
        .filter((p) => p.endsWith(".ts") || p.endsWith(".tsx"))
        .map((p) => path.join("components", p)),
    ];

    for (const file of clientAndApp) {
      const text = read(file);
      expect(text).not.toContain("@/lib/integration-credentials");
      expect(text).not.toContain("lib/integration-credentials");
    }
  });

  it("preserves CONN-1a envelope column contract in migration comments/shape", () => {
    const migration = read(
      "supabase/migrations/20261121120000_shopify_conn_1a_integration_credential_vault.sql",
    );
    expect(migration).toContain("access_nonce bytea not null");
    expect(migration).toContain("access_auth_tag bytea not null");
    expect(migration).toContain("dek_wrap_nonce bytea not null");
    expect(migration).toContain("dek_wrap_auth_tag bytea not null");
    expect(migration).toContain("length(access_nonce) = 12");
    expect(migration).toContain("length(access_auth_tag) = 16");
    expect(migration).not.toMatch(
      /^\s*nonce bytea not null/m,
    );
  });
});
