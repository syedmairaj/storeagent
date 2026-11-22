import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildTrustedCredentialScope,
  CREDENTIAL_BINDING_AUTHORIZATION_STATUS,
  CredentialPersistenceError,
  disconnectOrRevokeIntegrationCredentials,
  resolveIntegrationOwnershipForTenant,
  type IntegrationCredentialRpcClient,
  type IntegrationOwnershipLookup,
  type IntegrationOwnershipRecord,
  type TrustedCredentialScope,
} from "@/lib/integration-credentials/repository";
import type {
  TenantContext,
} from "@/lib/tenancy/types";

const ORG = "c011d0c0-0000-4000-8000-000000000001";
const INTEG = "c011d0c0-0000-4000-8000-000000000003";
const USER = "c011d0c0-0000-4000-8000-0000000000aa";

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

describe("SHOPIFY-CONN-1d-C disconnect/revoke repository wrapper", () => {
  it("keeps binding authorization NOT_YET_VERIFIED", () => {
    expect(CREDENTIAL_BINDING_AUTHORIZATION_STATUS).toBe("NOT_YET_VERIFIED");
  });

  it("rejects fabricated scope and reason/status mismatch without RPC", async () => {
    const client: IntegrationCredentialRpcClient = {
      rpc: async () => {
        throw new Error("rpc must not be called");
      },
    };

    await expect(
      disconnectOrRevokeIntegrationCredentials({
        scope: {
          organizationId: ORG,
          integrationId: INTEG,
          provider: "shopify",
          storeId: null,
          source: "integration_binding",
        } as TrustedCredentialScope,
        reasonClass: "merchant_disconnect",
        terminalStatus: "disconnected",
        expectedGeneration: 1,
        client,
      }),
    ).rejects.toBeInstanceOf(CredentialPersistenceError);

    const trusted = await scope();
    await expect(
      disconnectOrRevokeIntegrationCredentials({
        scope: trusted,
        reasonClass: "merchant_disconnect",
        terminalStatus: "revoked",
        expectedGeneration: 1,
        client,
      }),
    ).rejects.toMatchObject({ code: "invalid_scope" });
  });

  it("maps completed/already_terminal to credentialsDestroyed; never lease_held", async () => {
    const trusted = await scope();

    const completedClient: IntegrationCredentialRpcClient = {
      rpc: async (fn, args) => {
        expect(fn).toBe("disconnect_or_revoke_integration_credentials");
        expect(args?.p_reason_class).toBe("uninstall");
        expect(args?.p_terminal_status).toBe("revoked");
        expect(args?.p_expected_generation).toBe(2);
        return {
          data: [
            {
              outcome: "completed",
              integration_status: "revoked",
              credential_generation: null,
              vault_present: false,
              refresh_lock_expires_at: null,
              external_account_released: true,
            },
          ],
          error: null,
        };
      },
    };

    const completed = await disconnectOrRevokeIntegrationCredentials({
      scope: trusted,
      reasonClass: "uninstall",
      terminalStatus: "revoked",
      expectedGeneration: 2,
      client: completedClient,
    });
    expect(completed.outcome).toBe("completed");
    expect(completed.credentialsDestroyed).toBe(true);
    expect(completed.externalAccountReleased).toBe(true);

    const leaseClient: IntegrationCredentialRpcClient = {
      rpc: async () => ({
        data: {
          outcome: "lease_held",
          integration_status: "disconnected",
          credential_generation: 1,
          vault_present: true,
          refresh_lock_expires_at: "2099-01-01T00:00:00.000Z",
          external_account_released: false,
        },
        error: null,
      }),
    };

    const leaseHeld = await disconnectOrRevokeIntegrationCredentials({
      scope: trusted,
      reasonClass: "merchant_disconnect",
      terminalStatus: "disconnected",
      expectedGeneration: 1,
      client: leaseClient,
    });
    expect(leaseHeld.outcome).toBe("lease_held");
    expect(leaseHeld.credentialsDestroyed).toBe(false);
    expect(leaseHeld.vaultPresent).toBe(true);

    const alreadyClient: IntegrationCredentialRpcClient = {
      rpc: async () => ({
        data: {
          outcome: "already_terminal",
          integration_status: "revoked",
          credential_generation: null,
          vault_present: false,
          refresh_lock_expires_at: null,
          external_account_released: false,
        },
        error: null,
      }),
    };

    const already = await disconnectOrRevokeIntegrationCredentials({
      scope: trusted,
      reasonClass: "hard_auth_failure",
      terminalStatus: "revoked",
      expectedGeneration: null,
      client: alreadyClient,
    });
    expect(already.outcome).toBe("already_terminal");
    expect(already.credentialsDestroyed).toBe(true);
  });

  it("sanitizes RPC failures without leaking messages", async () => {
    const trusted = await scope();
    const client: IntegrationCredentialRpcClient = {
      rpc: async () => ({
        data: null,
        error: { message: "secret ciphertext leaked", code: "XX000" },
      }),
    };

    await expect(
      disconnectOrRevokeIntegrationCredentials({
        scope: trusted,
        reasonClass: "merchant_disconnect",
        terminalStatus: "disconnected",
        expectedGeneration: 1,
        client,
      }),
    ).rejects.toMatchObject({
      name: "CredentialPersistenceError",
      code: "rpc_failed",
      message: "rpc_failed",
    });
  });
});
