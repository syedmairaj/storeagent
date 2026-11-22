import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("server-only", () => ({}));

import {
  CredentialCryptoError,
  createKekResolver,
  KEY_BYTE_LENGTH,
  type PlaintextCredentialSet,
} from "@/lib/integration-credentials";
import {
  assertTrustedCredentialScope,
  buildTrustedCredentialScope,
  clearIntegrationCredentials,
  createIntegrationCredentials,
  CREDENTIAL_BINDING_AUTHORIZATION_STATUS,
  CredentialPersistenceError,
  loadAndDecryptIntegrationCredentials,
  loadIntegrationCredentialEnvelope,
  parseCredentialBytea,
  parsePositiveSafeGeneration,
  replaceIntegrationCredentials,
  resolveIntegrationOwnershipForTenant,
  type IntegrationCredentialRpcClient,
  type IntegrationOwnershipLookup,
  type IntegrationOwnershipRecord,
  type TrustedCredentialScope,
} from "@/lib/integration-credentials/repository";
import type {
  TenantContext,
} from "@/lib/tenancy/types";

const ORG = "c011c000-0000-4000-8000-000000000001";
const OTHER_ORG = "c011c000-0000-4000-8000-000000000011";
const INTEG = "c011c000-0000-4000-8000-000000000003";
const USER = "c011c000-0000-4000-8000-0000000000aa";

function testKek(seed: number): Buffer {
  const key = Buffer.alloc(KEY_BYTE_LENGTH);
  key.fill(seed & 0xff);
  return key;
}

function resolver(version = 1) {
  return createKekResolver({
    keys: new Map([[version, testKek(0x41)]]),
    currentVersion: version,
  });
}

function tenant(overrides?: Partial<TenantContext>): TenantContext {
  return {
    userId: USER,
    organizationId: ORG,
    role: "owner",
    storeId: null,
    ...overrides,
  };
}

function ownershipRecord(
  overrides?: Partial<IntegrationOwnershipRecord>,
): IntegrationOwnershipRecord {
  return {
    id: INTEG,
    organizationId: ORG,
    storeId: null,
    provider: "shopify",
    ...overrides,
  };
}

function lookupWith(
  record: IntegrationOwnershipRecord | null,
): IntegrationOwnershipLookup {
  return {
    findByOrganizationAndId: async ({ organizationId, integrationId }) => {
      if (record == null) {
        return null;
      }
      if (
        record.organizationId !== organizationId
        || record.id !== integrationId
      ) {
        return null;
      }
      return record;
    },
  };
}

async function scope(
  overrides?: Partial<IntegrationOwnershipRecord>,
): Promise<TrustedCredentialScope> {
  const ownership = await resolveIntegrationOwnershipForTenant({
    tenant: tenant(),
    integrationId: overrides?.id ?? INTEG,
    lookup: lookupWith(ownershipRecord(overrides)),
  });
  return buildTrustedCredentialScope(tenant(), ownership);
}

function plaintext(
  overrides?: Partial<PlaintextCredentialSet>,
): PlaintextCredentialSet {
  return {
    organizationId: ORG,
    integrationId: INTEG,
    provider: "shopify",
    tokenKind: "offline_expiring",
    accessToken: "shpat_test_access_token_fixture_cccc",
    refreshToken: "shprt_test_refresh_token_fixture_dddd",
    ...overrides,
  };
}

function mockClient(
  handlers: Record<string, (args: Record<string, unknown>) => unknown>,
): IntegrationCredentialRpcClient {
  return {
    async rpc(fn, args = {}) {
      const handler = handlers[fn];
      if (!handler) {
        return {
          data: null,
          error: {
            message:
              `SQLSTATE 23505 duplicate key detail org=${ORG} token=shpat_leak`,
          },
        };
      }
      return { data: handler(args), error: null };
    },
  };
}

describe("SHOPIFY-CONN-1c-α credential repository", () => {
  it("marks end-to-end binding authorization as NOT_YET_VERIFIED", () => {
    expect(CREDENTIAL_BINDING_AUTHORIZATION_STATUS).toBe("NOT_YET_VERIFIED");
  });

  it("requires TenantContext + independently resolved ownership", async () => {
    const ownership = await resolveIntegrationOwnershipForTenant({
      tenant: tenant(),
      integrationId: INTEG,
      lookup: lookupWith(ownershipRecord()),
      expectedProvider: "shopify",
    });
    const trusted = buildTrustedCredentialScope(tenant(), ownership);
    expect(trusted.source).toBe("integration_binding");
    expect(() =>
      assertTrustedCredentialScope(trusted, "integration_credentials.load"),
    ).not.toThrow();
  });

  it("fails closed on fabricated ownership and cross-org lookup rows", async () => {
    await expect(
      resolveIntegrationOwnershipForTenant({
        tenant: tenant(),
        integrationId: INTEG,
        lookup: lookupWith(null),
      }),
    ).rejects.toMatchObject({ code: "integration_not_found" });

    await expect(
      resolveIntegrationOwnershipForTenant({
        tenant: tenant(),
        integrationId: INTEG,
        lookup: {
          findByOrganizationAndId: async () =>
            ownershipRecord({ organizationId: OTHER_ORG }),
        },
      }),
    ).rejects.toMatchObject({ code: "scope_mismatch" });

    expect(() =>
      buildTrustedCredentialScope(tenant(), {
        integrationId: INTEG,
        organizationId: ORG,
        storeId: null,
        provider: "shopify",
      } as never),
    ).toThrow(CredentialPersistenceError);

    const fabricated = {
      organizationId: ORG,
      integrationId: INTEG,
      provider: "shopify",
      storeId: null,
      source: "integration_binding",
    } as unknown as TrustedCredentialScope;

    expect(() =>
      assertTrustedCredentialScope(fabricated, "integration_credentials.load"),
    ).toThrow(CredentialPersistenceError);
  });

  it("create encrypts before RPC and never sends plaintext fields", async () => {
    const captured: Record<string, unknown>[] = [];
    const client = mockClient({
      replace_integration_credential_set: (args) => {
        captured.push(args);
        return {
          credential_id: "cred-1",
          credential_generation: 1,
          outcome: "inserted",
        };
      },
    });

    const result = await createIntegrationCredentials({
      scope: await scope(),
      plaintext: plaintext(),
      kekResolver: resolver(),
      accessExpiresAt: "2030-01-01T00:00:00.000Z",
      refreshExpiresAt: "2030-04-01T00:00:00.000Z",
      scopeGranted: "read_products",
      client,
    });

    expect(result).toEqual({
      credentialId: "cred-1",
      credentialGeneration: 1,
      outcome: "inserted",
    });
    expect(captured).toHaveLength(1);
    const args = captured[0]!;
    expect(args.p_expected_generation).toBeNull();
    expect(JSON.stringify(args)).not.toContain("shpat_");
    expect(String(args.p_access_ciphertext)).toMatch(/^\\x/);
  });

  it("maps returned RPC errors and thrown rpc exceptions without leaking SQL", async () => {
    const errorClient = mockClient({});
    try {
      await loadIntegrationCredentialEnvelope({
        scope: await scope(),
        client: errorClient,
      });
      expect.unreachable("expected rpc_failed");
    } catch (error) {
      expect(error).toBeInstanceOf(CredentialPersistenceError);
      expect((error as CredentialPersistenceError).code).toBe("rpc_failed");
      expect(String(error)).not.toContain("SQLSTATE");
      expect(String(error)).not.toContain("shpat_");
    }

    const throwingClient: IntegrationCredentialRpcClient = {
      async rpc() {
        throw new Error(`relation does not exist org=${ORG} token=shpat_leak`);
      },
    };

    try {
      await loadIntegrationCredentialEnvelope({
        scope: await scope(),
        client: throwingClient,
      });
      expect.unreachable("expected rpc_failed from throw");
    } catch (error) {
      expect(error).toBeInstanceOf(CredentialPersistenceError);
      expect((error as CredentialPersistenceError).code).toBe("rpc_failed");
      expect(String(error)).not.toContain("relation does not exist");
      expect(String(error)).not.toContain("shpat_");
    }
  });

  it("rejects plaintext that does not match trusted scope", async () => {
    const client = mockClient({});
    await expect(
      createIntegrationCredentials({
        scope: await scope(),
        plaintext: plaintext({ organizationId: "other-org" }),
        kekResolver: resolver(),
        client,
      }),
    ).rejects.toMatchObject({ code: "scope_mismatch" });
  });

  it("enforces Number.isSafeInteger generation bounds", () => {
    expect(parsePositiveSafeGeneration(1)).toBe(1);
    expect(parsePositiveSafeGeneration("2")).toBe(2);
    expect(parsePositiveSafeGeneration(BigInt(3))).toBe(3);

    expect(() => parsePositiveSafeGeneration(0)).toThrow(
      CredentialPersistenceError,
    );
    expect(() => parsePositiveSafeGeneration(-1)).toThrow(
      CredentialPersistenceError,
    );
    expect(() => parsePositiveSafeGeneration(1.5)).toThrow(
      CredentialPersistenceError,
    );
    expect(() => parsePositiveSafeGeneration(Number.MAX_SAFE_INTEGER + 1))
      .toThrow(CredentialPersistenceError);
    expect(() =>
      parsePositiveSafeGeneration(
        BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1),
      ),
    ).toThrow(CredentialPersistenceError);
    expect(() => parsePositiveSafeGeneration("01")).toThrow(
      CredentialPersistenceError,
    );
    expect(() => parsePositiveSafeGeneration("9007199254740992")).toThrow(
      CredentialPersistenceError,
    );
  });

  it("rejects unsafe expectedGeneration and malformed generation responses", async () => {
    const client = mockClient({
      replace_integration_credential_set: () => ({
        credential_id: "cred-1",
        credential_generation: "9007199254740992",
        outcome: "replaced",
      }),
    });

    await expect(
      replaceIntegrationCredentials({
        scope: await scope(),
        plaintext: plaintext(),
        expectedGeneration: Number.MAX_SAFE_INTEGER + 1,
        kekResolver: resolver(),
        client,
      }),
    ).rejects.toMatchObject({ code: "invalid_generation" });

    await expect(
      replaceIntegrationCredentials({
        scope: await scope(),
        plaintext: plaintext(),
        expectedGeneration: 1,
        kekResolver: resolver(),
        client,
      }),
    ).rejects.toMatchObject({ code: "malformed_rpc_response" });
  });

  it("treats stale-generation replace outcomes as conflict without throw", async () => {
    const client = mockClient({
      replace_integration_credential_set: () => ({
        credential_id: null,
        credential_generation: null,
        outcome: "conflict",
      }),
    });

    const result = await replaceIntegrationCredentials({
      scope: await scope(),
      plaintext: plaintext(),
      expectedGeneration: 1,
      kekResolver: resolver(),
      client,
    });
    expect(result).toEqual({
      credentialId: null,
      credentialGeneration: null,
      outcome: "conflict",
    });
  });

  it("strictly validates bytea hex and canonical Base64", () => {
    expect(parseCredentialBytea("\\x0a0b").equals(Buffer.from("0a0b", "hex"))).toBe(
      true,
    );
    expect(() => parseCredentialBytea("\\x0a0")).toThrow(CredentialPersistenceError);
    const canonical = Buffer.from([1]).toString("base64");
    expect(parseCredentialBytea(canonical).equals(Buffer.from([1]))).toBe(true);
    expect(() => parseCredentialBytea("AQ")).toThrow(CredentialPersistenceError);
  });

  it("decrypt failure does not invoke clear RPC", async () => {
    const calls: string[] = [];
    const kek = resolver(1);
    const { encryptCredentialSet, toIntegrationCredentialByteaColumns } =
      await import("@/lib/integration-credentials/envelope");
    const envelope = encryptCredentialSet(plaintext(), kek);
    const cols = toIntegrationCredentialByteaColumns(envelope);

    const client = mockClient({
      load_integration_credential_envelope: () => {
        calls.push("load");
        return [{
          id: "cred-1",
          organization_id: ORG,
          integration_id: INTEG,
          provider: "shopify",
          token_kind: "offline_expiring",
          access_ciphertext: cols.access_ciphertext,
          access_nonce: cols.access_nonce,
          access_auth_tag: cols.access_auth_tag,
          refresh_ciphertext: cols.refresh_ciphertext,
          refresh_nonce: cols.refresh_nonce,
          refresh_auth_tag: cols.refresh_auth_tag,
          dek_wrapped: cols.dek_wrapped,
          dek_wrap_nonce: cols.dek_wrap_nonce,
          dek_wrap_auth_tag: cols.dek_wrap_auth_tag,
          key_version: 1,
          access_expires_at: null,
          refresh_expires_at: null,
          scope: null,
          credential_generation: "1",
          last_rotated_at: null,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        }];
      },
      clear_integration_credentials: () => {
        calls.push("clear");
        return "cleared";
      },
    });

    const wrongKek = createKekResolver({
      keys: new Map([[1, testKek(0x99)]]),
      currentVersion: 1,
    });

    await expect(
      loadAndDecryptIntegrationCredentials({
        scope: await scope(),
        kekResolver: wrongKek,
        client,
      }),
    ).rejects.toBeInstanceOf(CredentialCryptoError);

    expect(calls).toEqual(["load"]);
  });

  it("clear forwards generation fence and never mutates status fields", async () => {
    let seen: Record<string, unknown> | null = null;
    const client = mockClient({
      clear_integration_credentials: (args) => {
        seen = args;
        return "fenced";
      },
    });

    const outcome = await clearIntegrationCredentials({
      scope: await scope(),
      expectedGeneration: 4,
      client,
    });

    expect(outcome).toBe("fenced");
    expect(seen).toEqual({
      p_organization_id: ORG,
      p_integration_id: INTEG,
      p_provider: "shopify",
      p_expected_generation: 4,
    });
  });
});
