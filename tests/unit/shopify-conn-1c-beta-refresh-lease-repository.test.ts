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
  acquireAndDecryptIntegrationCredentialRefreshLock,
  acquireIntegrationCredentialRefreshLock,
  buildTrustedCredentialScope,
  CREDENTIAL_BINDING_AUTHORIZATION_STATUS,
  CredentialPersistenceError,
  REFRESH_LOCK_LEASE_SECONDS_DEFAULT,
  releaseIntegrationCredentialRefreshLock,
  resolveIntegrationOwnershipForTenant,
  rotateIntegrationCredentialsUnderLease,
  type IntegrationCredentialRpcClient,
  type IntegrationOwnershipLookup,
  type IntegrationOwnershipRecord,
  type TrustedCredentialScope,
} from "@/lib/integration-credentials/repository";
import type {
  TenantContext,
} from "@/lib/tenancy/types";

const ORG = "c011c0b0-0000-4000-8000-000000000001";
const INTEG = "c011c0b0-0000-4000-8000-000000000003";
const USER = "c011c0b0-0000-4000-8000-0000000000aa";

function testKek(seed: number): Buffer {
  const key = Buffer.alloc(KEY_BYTE_LENGTH);
  key.fill(seed & 0xff);
  return key;
}

function resolver(version = 1) {
  return createKekResolver({
    keys: new Map([[version, testKek(0x42)]]),
    currentVersion: version,
  });
}

function tenant(): TenantContext {
  return {
    userId: USER,
    organizationId: ORG,
    role: "owner",
    storeId: null,
  };
}

function ownershipRecord(): IntegrationOwnershipRecord {
  return {
    id: INTEG,
    organizationId: ORG,
    storeId: null,
    provider: "shopify",
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

async function scope(): Promise<TrustedCredentialScope> {
  const ownership = await resolveIntegrationOwnershipForTenant({
    tenant: tenant(),
    integrationId: INTEG,
    lookup: lookupWith(ownershipRecord()),
  });
  return buildTrustedCredentialScope(tenant(), ownership);
}

function plaintext(): PlaintextCredentialSet {
  return {
    organizationId: ORG,
    integrationId: INTEG,
    provider: "shopify",
    tokenKind: "offline_expiring",
    accessToken: "shpat_access_fixture_beta",
    refreshToken: "shprt_refresh_fixture_beta",
  };
}

function sealedBuffers() {
  return {
    access_ciphertext: Buffer.from("aa", "hex"),
    access_nonce: Buffer.from("0102030405060708090a0b0c", "hex"),
    access_auth_tag: Buffer.from("a1a2a3a4a5a6a7a8a9aaabacadaeafb0", "hex"),
    refresh_ciphertext: Buffer.from("bb", "hex"),
    refresh_nonce: Buffer.from("1112131415161718191a1b1c", "hex"),
    refresh_auth_tag: Buffer.from("b1b2b3b4b5b6b7b8b9babbbcbdbebfc0", "hex"),
    dek_wrapped: Buffer.from("cc", "hex"),
    dek_wrap_nonce: Buffer.from("2122232425262728292a2b2c", "hex"),
    dek_wrap_auth_tag: Buffer.from("c1c2c3c4c5c6c7c8c9cacbcccdcecfd0", "hex"),
  };
}

describe("SHOPIFY-CONN-1c-β repository lease wrappers", () => {
  it("keeps binding authorization NOT_YET_VERIFIED", () => {
    expect(CREDENTIAL_BINDING_AUTHORIZATION_STATUS).toBe("NOT_YET_VERIFIED");
  });

  it("rejects invalid owner id and lease seconds without RPC", async () => {
    const trusted = await scope();
    const client: IntegrationCredentialRpcClient = {
      rpc: async () => {
        throw new Error("rpc must not be called");
      },
    };

    await expect(
      acquireIntegrationCredentialRefreshLock({
        scope: trusted,
        ownerId: "bad owner",
        client,
      }),
    ).rejects.toMatchObject({ code: "invalid_owner_id" });

    await expect(
      acquireIntegrationCredentialRefreshLock({
        scope: trusted,
        ownerId: "owner-1",
        leaseSeconds: 29,
        client,
      }),
    ).rejects.toMatchObject({ code: "invalid_lease_seconds" });
  });

  it("maps denied acquire with no secrets; defaults lease seconds", async () => {
    const trusted = await scope();
    let seenArgs: Record<string, unknown> | undefined;
    const client: IntegrationCredentialRpcClient = {
      rpc: async (_fn, args) => {
        seenArgs = args;
        return {
          data: [{
            acquired: false,
            refresh_lock_token: null,
            refresh_lock_expires_at: null,
            credential_generation: null,
            id: null,
            organization_id: null,
            integration_id: null,
            provider: null,
            token_kind: null,
            access_ciphertext: null,
            access_nonce: null,
            access_auth_tag: null,
            refresh_ciphertext: null,
            refresh_nonce: null,
            refresh_auth_tag: null,
            dek_wrapped: null,
            dek_wrap_nonce: null,
            dek_wrap_auth_tag: null,
            key_version: null,
            access_expires_at: null,
            refresh_expires_at: null,
            scope: null,
            last_rotated_at: null,
            created_at: null,
            updated_at: null,
          }],
          error: null,
        };
      },
    };

    const result = await acquireIntegrationCredentialRefreshLock({
      scope: trusted,
      ownerId: "owner-1",
      client,
    });

    expect(result).toEqual({ acquired: false });
    expect(seenArgs?.p_lease_seconds).toBe(REFRESH_LOCK_LEASE_SECONDS_DEFAULT);
  });

  it("rejects denied acquire that leaks ciphertext", async () => {
    const trusted = await scope();
    const sealed = sealedBuffers();
    const client: IntegrationCredentialRpcClient = {
      rpc: async () => ({
        data: [{
          acquired: false,
          refresh_lock_token: null,
          refresh_lock_expires_at: null,
          credential_generation: null,
          id: null,
          organization_id: null,
          integration_id: null,
          provider: null,
          token_kind: null,
          access_ciphertext: sealed.access_ciphertext,
          access_nonce: null,
          access_auth_tag: null,
          refresh_ciphertext: null,
          refresh_nonce: null,
          refresh_auth_tag: null,
          dek_wrapped: null,
          dek_wrap_nonce: null,
          dek_wrap_auth_tag: null,
          key_version: null,
          access_expires_at: null,
          refresh_expires_at: null,
          scope: null,
          last_rotated_at: null,
          created_at: null,
          updated_at: null,
        }],
        error: null,
      }),
    };

    await expect(
      acquireIntegrationCredentialRefreshLock({
        scope: trusted,
        ownerId: "owner-1",
        client,
      }),
    ).rejects.toBeInstanceOf(CredentialPersistenceError);
  });

  it("parses rotate/release outcomes and fails closed on unexpected", async () => {
    const trusted = await scope();
    const rotateClient: IntegrationCredentialRpcClient = {
      rpc: async () => ({
        data: [{
          credential_id: "c011c0b0-0000-4000-8000-000000000099",
          credential_generation: 2,
          outcome: "rotated",
        }],
        error: null,
      }),
    };

    const rotated = await rotateIntegrationCredentialsUnderLease({
      scope: trusted,
      plaintext: plaintext(),
      ownerId: "owner-1",
      claimToken: "claim-token-1",
      expectedGeneration: 1,
      kekResolver: resolver(),
      client: rotateClient,
    });
    expect(rotated.outcome).toBe("rotated");
    expect(rotated.credentialGeneration).toBe(2);

    const badClient: IntegrationCredentialRpcClient = {
      rpc: async () => ({
        data: "surprise",
        error: null,
      }),
    };

    await expect(
      releaseIntegrationCredentialRefreshLock({
        scope: trusted,
        ownerId: "owner-1",
        claimToken: "claim-token-1",
        client: badClient,
      }),
    ).rejects.toMatchObject({ code: "unexpected_outcome" });
  });

  it("B15: crypto failure after acquire releases lease and never clears", async () => {
    const trusted = await scope();
    const sealed = sealedBuffers();
    const calls: string[] = [];

    const client: IntegrationCredentialRpcClient = {
      rpc: async (fn) => {
        calls.push(fn);
        if (fn === "acquire_integration_credential_refresh_lock") {
          return {
            data: [{
              acquired: true,
              refresh_lock_token: "claim-token-crypto",
              refresh_lock_expires_at: new Date().toISOString(),
              credential_generation: 1,
              id: "c011c0b0-0000-4000-8000-000000000090",
              organization_id: ORG,
              integration_id: INTEG,
              provider: "shopify",
              token_kind: "offline_expiring",
              ...sealed,
              key_version: 1,
              access_expires_at: null,
              refresh_expires_at: null,
              scope: "read_products",
              last_rotated_at: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }],
            error: null,
          };
        }
        if (fn === "release_integration_credential_refresh_lock") {
          return { data: "released", error: null };
        }
        throw new Error(`unexpected rpc ${fn}`);
      },
    };

    // Wrong KEK → decrypt_failed / unknown path via empty resolver versions.
    const badResolver = createKekResolver({
      keys: new Map([[2, testKek(0x99)]]),
      currentVersion: 2,
    });

    await expect(
      acquireAndDecryptIntegrationCredentialRefreshLock({
        scope: trusted,
        ownerId: "owner-crypto",
        kekResolver: badResolver,
        client,
      }),
    ).rejects.toBeInstanceOf(CredentialCryptoError);

    expect(calls).toEqual([
      "acquire_integration_credential_refresh_lock",
      "release_integration_credential_refresh_lock",
    ]);
    expect(calls).not.toContain("clear_integration_credentials");
  });

  it("normalizes thrown rpc errors without leaking messages", async () => {
    const trusted = await scope();
    const client: IntegrationCredentialRpcClient = {
      rpc: async () => {
        throw new Error("secret claim token abc and ciphertext dump");
      },
    };

    await expect(
      acquireIntegrationCredentialRefreshLock({
        scope: trusted,
        ownerId: "owner-1",
        client,
      }),
    ).rejects.toMatchObject({
      name: "CredentialPersistenceError",
      code: "rpc_failed",
      message: "rpc_failed",
    });
  });
});
