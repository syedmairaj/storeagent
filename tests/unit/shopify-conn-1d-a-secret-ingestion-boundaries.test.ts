import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(),
}));

import { ensureCsvStoreIntegration } from "@/lib/inventory-import/ensure-integration";
import { bindCsvLocation } from "@/lib/providers/csv/location-binding";
import { createCsvSyncRunPersistence } from "@/lib/providers/csv/sync-run-persistence";
import type { CsvTrustedImportContext } from "@/lib/providers/csv/trusted-context";
import {
  assertNonSecretIngestionPayload,
  guardOptionalNonSecretJson,
  isSecretIngestionError,
  SecretIngestionError,
  SECRET_INGESTION_REJECTED,
} from "@/lib/security/secret-ingestion";
import { CREDENTIAL_BINDING_AUTHORIZATION_STATUS } from "@/lib/integration-credentials/repository";

const SYNTHETIC_ACCESS = "shpat_test_access_token_fixture_1daa";
const SYNTHETIC_REFRESH = "shprt_test_refresh_token_fixture_1dbb";

const context: CsvTrustedImportContext = {
  organizationId: "org-1",
  integrationId: "integration-1",
  storeId: "store-1",
  provider: "csv",
  scope: {
    organizationId: "org-1",
    storeId: "store-1",
    source: "integration_binding",
  },
};

function rpcClient(
  implementation?: (
    rpcName: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>,
) {
  return {
    rpc: vi.fn(
      implementation
        ?? (async () => ({
          data: null,
          error: { message: "unreachable" },
        })),
    ),
  };
}

describe("CONN-1d-A V11 secret ingestion boundaries", () => {
  it("keeps credential binding authorization NOT_YET_VERIFIED", () => {
    expect(CREDENTIAL_BINDING_AUTHORIZATION_STATUS).toBe("NOT_YET_VERIFIED");
  });

  it("accepts legitimate non-secret CSV configuration and metadata", () => {
    expect(
      assertNonSecretIngestionPayload(
        { purpose: "merchant_inventory_import_v1" },
        "integrations.configuration",
      ),
    ).toEqual({ purpose: "merchant_inventory_import_v1" });

    expect(
      assertNonSecretIngestionPayload(
        {
          configuredBy: "merchant_inventory_import_v1",
          locationName: "MAIN",
          adapterVersion: "csv-adapter-v1",
          token_kind: "offline_expiring",
          key_version: 1,
        },
        "provider_bindings.source_metadata",
      ),
    ).toMatchObject({ adapterVersion: "csv-adapter-v1" });

    expect(
      guardOptionalNonSecretJson(null, "sync_runs.error_summary"),
    ).toBeNull();
  });

  it("rejects nested secret keys and Shopify-like values without echoing payload", () => {
    const cases: Array<{ label: string; value: unknown }> = [
      {
        label: "access_token key",
        value: { access_token: "not-a-shopify-shape" },
      },
      {
        label: "refreshToken camelCase",
        value: { nested: { refreshToken: "x" } },
      },
      {
        label: "vault ciphertext key",
        value: { access_ciphertext: "\\xaa" },
      },
      {
        label: "dek_wrapped key",
        value: { envelope: { dek_wrapped: "\\xbb" } },
      },
      {
        label: "shpat value",
        value: { note: `failed ${SYNTHETIC_ACCESS}` },
      },
      {
        label: "shprt value in array",
        value: { errors: [SYNTHETIC_REFRESH] },
      },
      {
        label: "Bearer value",
        value: { detail: "Authorization Bearer abc.def.ghi-secret" },
      },
      {
        label: "shopify_access_token compound",
        value: { shopify_access_token: "x" },
      },
    ];

    for (const entry of cases) {
      let caught: unknown;
      try {
        assertNonSecretIngestionPayload(
          entry.value,
          "integrations.configuration",
        );
      } catch (error) {
        caught = error;
      }

      expect(caught, entry.label).toBeInstanceOf(SecretIngestionError);
      expect(isSecretIngestionError(caught)).toBe(true);
      expect((caught as SecretIngestionError).code).toBe(
        SECRET_INGESTION_REJECTED,
      );
      expect(String(caught)).not.toContain(SYNTHETIC_ACCESS);
      expect(String(caught)).not.toContain(SYNTHETIC_REFRESH);
      expect(String(caught)).not.toContain("abc.def.ghi-secret");
      expect(String(caught)).not.toContain("\\xaa");
    }
  });

  it("rejects secret source_metadata at bindCsvLocation before RPC", async () => {
    const client = rpcClient();

    await expect(
      bindCsvLocation(
        {
          context,
          externalId: "MAIN",
          canonicalLocationId: "location-1",
          sourceMetadata: {
            configuredBy: "merchant",
            access_token: SYNTHETIC_ACCESS,
          },
        },
        client as never,
      ),
    ).rejects.toSatisfy((error: unknown) => {
      expect(isSecretIngestionError(error)).toBe(true);
      expect(String(error)).not.toContain(SYNTHETIC_ACCESS);
      return true;
    });

    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("still binds locations with non-secret metadata", async () => {
    const client = rpcClient(async () => ({
      data: [
        {
          canonical_entity_id: "location-1",
          disposition: "imported",
        },
      ],
      error: null,
    }));

    await expect(
      bindCsvLocation(
        {
          context,
          externalId: "MAIN",
          canonicalLocationId: "location-1",
          sourceMetadata: {
            configuredBy: "merchant_inventory_import_v1",
            locationName: "MAIN",
          },
        },
        client as never,
      ),
    ).resolves.toEqual({
      canonicalEntityId: "location-1",
      disposition: "imported",
    });

    expect(client.rpc).toHaveBeenCalledTimes(1);
  });

  it("rejects secret SyncRun reconciliation metadata before RPC", async () => {
    const client = rpcClient();
    const persistence = createCsvSyncRunPersistence(client as never);

    await expect(
      persistence.begin({
        context,
        idempotencyKey: "import-1",
        reconciliationMetadata: {
          orchestration: "csv-import",
          refresh_token: SYNTHETIC_REFRESH,
        },
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expect(isSecretIngestionError(error)).toBe(true);
      expect(String(error)).not.toContain(SYNTHETIC_REFRESH);
      return true;
    });

    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("rejects secret SyncRun error_summary before fail RPC", async () => {
    const client = rpcClient();
    const persistence = createCsvSyncRunPersistence(client as never);

    await expect(
      persistence.fail({
        context,
        syncRunId: "sync-1",
        errorSummary: {
          code: "CSV_IMPORT_ORCHESTRATION_FAILED",
          raw: `token=${SYNTHETIC_ACCESS}`,
        },
        reconciliationMetadata: {
          orchestration: "csv-import",
        },
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expect(isSecretIngestionError(error)).toBe(true);
      expect(String(error)).not.toContain(SYNTHETIC_ACCESS);
      return true;
    });

    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("allows non-secret SyncRun begin metadata through the writer", async () => {
    const client = rpcClient(async () => ({
      data: [
        {
          sync_run_id: "sync-1",
          disposition: "started",
          status: "running",
          discovered_count: 0,
          imported_count: 0,
          updated_count: 0,
          skipped_count: 0,
          quarantined_count: 0,
          failed_count: 0,
        },
      ],
      error: null,
    }));

    const persistence = createCsvSyncRunPersistence(client as never);

    await expect(
      persistence.begin({
        context,
        idempotencyKey: "import-ok",
        reconciliationMetadata: {
          orchestration: "csv-import",
        },
      }),
    ).resolves.toMatchObject({
      syncRunId: "sync-1",
      disposition: "started",
    });

    expect(client.rpc).toHaveBeenCalledTimes(1);
  });

  it("guards integrations.configuration on CSV ensure insert before write", async () => {
    const insert = vi.fn().mockReturnValue({
      select: () => ({
        single: async () => ({
          data: {
            id: "integration-1",
            organization_id: "org-1",
            store_id: "store-1",
            provider: "csv",
            status: "active",
            display_name: "CSV inventory import",
            configuration: { purpose: "merchant_inventory_import_v1" },
            created_at: "2026-11-22T00:00:00.000Z",
            updated_at: "2026-11-22T00:00:00.000Z",
          },
          error: null,
        }),
      }),
    });

    const from = vi.fn((table: string) => {
      if (table === "integrations") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  eq: () => ({
                    order: () => ({
                      limit: async () => ({ data: [], error: null }),
                    }),
                  }),
                }),
              }),
            }),
          }),
          insert,
        };
      }
      throw new Error(`unexpected table ${table}`);
    });

    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          canonical_entity_id: "location-1",
          disposition: "imported",
        },
      ],
      error: null,
    });

    await ensureCsvStoreIntegration({
      organizationId: "org-1",
      storeId: "store-1",
      locationId: "location-1",
      client: { from, rpc } as never,
    });

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        configuration: {
          purpose: "merchant_inventory_import_v1",
        },
      }),
    );
    expect(insert.mock.calls[0]?.[0]?.configuration).not.toHaveProperty(
      "access_token",
    );
  });

  it("wires guards at confirmed writer sources", () => {
    const root = process.cwd();
    const ensure = readFileSync(
      join(root, "lib/inventory-import/ensure-integration.ts"),
      "utf8",
    );
    const location = readFileSync(
      join(root, "lib/providers/csv/location-binding.ts"),
      "utf8",
    );
    const syncRun = readFileSync(
      join(root, "lib/providers/csv/sync-run-persistence.ts"),
      "utf8",
    );
    const csvPersistence = readFileSync(
      join(root, "lib/providers/csv/supabase-persistence.ts"),
      "utf8",
    );

    expect(ensure).toContain("assertNonSecretIngestionPayload");
    expect(ensure).toContain("integrations.configuration");
    expect(location).toContain("guardOptionalNonSecretJson");
    expect(location).toContain("provider_bindings.source_metadata");
    expect(syncRun).toContain("sync_runs.error_summary");
    expect(syncRun).toContain("sync_runs.reconciliation_metadata");
    expect(csvPersistence).toContain("assertNonSecretIngestionPayload");
    expect(csvPersistence).toContain("provider_bindings.source_metadata");
  });
});
