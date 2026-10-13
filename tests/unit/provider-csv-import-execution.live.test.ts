import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it, vi } from "vitest";

import { executeCsvImport } from "@/lib/providers/csv/import-execution";

import type { CsvImportPlan } from "@/lib/providers/csv/import-assembly";

vi.mock("server-only", () => ({}));

const LIVE = process.env.RUN_CSV_LIVE_TESTS === "1";

const ORG_ID = randomUUID();

const STORE_ID = randomUUID();

const LOCATION_ID = randomUUID();

const INTEGRATION_ID = randomUUID();

const LOCATION_EXTERNAL_ID = `M3.9DE4-LOCATION-${INTEGRATION_ID}`;

const context = {
  organizationId: ORG_ID,

  integrationId: INTEGRATION_ID,

  storeId: STORE_ID,

  provider: "csv" as const,

  scope: {
    organizationId: ORG_ID,

    storeId: STORE_ID,

    source: "integration_binding" as const,
  },
};

function productConfig() {
  return {
    resourceType: "product" as const,

    adapterVersion: "m3.9de4-product-v1",

    mappings: [
      {
        canonicalField: "externalId" as const,

        sourceColumn: "Product ID",
      },
      {
        canonicalField: "title" as const,

        sourceColumn: "Title",
      },
      {
        canonicalField: "status" as const,

        sourceColumn: "Status",
      },
    ],
  };
}

function variantConfig() {
  return {
    resourceType: "product_variant" as const,

    adapterVersion: "m3.9de4-variant-v1",

    mappings: [
      {
        canonicalField: "externalId" as const,

        sourceColumn: "Variant ID",
      },
      {
        canonicalField: "externalParentId" as const,

        sourceColumn: "Product ID",
      },
      {
        canonicalField: "sku" as const,

        sourceColumn: "SKU",
      },
      {
        canonicalField: "title" as const,

        sourceColumn: "Title",
      },
      {
        canonicalField: "status" as const,

        sourceColumn: "Status",
      },
      {
        canonicalField: "currency" as const,

        sourceColumn: "Currency",
      },
    ],
  };
}

function inventoryConfig() {
  return {
    observationType: "inventory_snapshot" as const,

    adapterVersion: "m3.9de4-inventory-v1",

    mappings: [
      {
        canonicalField: "variantExternalId" as const,

        sourceColumn: "Variant ID",
      },
      {
        canonicalField: "locationExternalId" as const,

        sourceColumn: "Location ID",
      },
      {
        canonicalField: "observedAt" as const,

        sourceColumn: "Observed At",
      },
      {
        canonicalField: "onHandQuantity" as const,

        sourceColumn: "On Hand",
      },
      {
        canonicalField: "availableQuantity" as const,

        sourceColumn: "Available",
      },
      {
        canonicalField: "committedQuantity" as const,

        sourceColumn: "Committed",
      },
      {
        canonicalField: "incomingQuantity" as const,

        sourceColumn: "Incoming",
      },
    ],
  };
}

function plan(): CsvImportPlan {
  return {
    context,

    products: {
      source: ["Product ID,Title,Status", "P-1,D-E4 Widget,active"].join("\n"),

      config: productConfig(),
    },

    productVariants: {
      source: [
        "Variant ID,Product ID,SKU,Title,Status,Currency",
        "V-1,P-1,DE4-SKU-1,D-E4 Widget Small,active,USD",
      ].join("\n"),

      config: variantConfig(),
    },

    inventorySnapshots: {
      source: [
        "Variant ID,Location ID,Observed At,On Hand,Available,Committed,Incoming",
        `V-1,${LOCATION_EXTERNAL_ID},2026-10-12T06:00:00Z,25,20,5,10`,
      ].join("\n"),

      config: inventoryConfig(),
    },
  };
}

const describeLive = LIVE ? describe : describe.skip;

describeLive("CSV operational import replay live Supabase E2E", () => {
  let admin: Awaited<ReturnType<typeof loadAdmin>>;

  let resourcePersistence: Awaited<ReturnType<typeof loadResourcePersistence>>;

  let syncRunPersistence: Awaited<ReturnType<typeof loadSyncRunPersistence>>;

  async function loadAdmin() {
    const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");

    return createSupabaseAdminClient();
  }

  async function loadResourcePersistence() {
    const { createCsvSupabasePersistence } =
      await import("@/lib/providers/csv/supabase-persistence");

    return createCsvSupabasePersistence(admin);
  }

  async function loadSyncRunPersistence() {
    const { createCsvSyncRunPersistence } =
      await import("@/lib/providers/csv/sync-run-persistence");

    return createCsvSyncRunPersistence(admin);
  }

  async function inventorySnapshotCount(): Promise<number> {
    const { count, error } = await admin
      .from("inventory_snapshots")
      .select("*", {
        count: "exact",

        head: true,
      })
      .eq("organization_id", ORG_ID)
      .eq("store_id", STORE_ID);

    if (error) {
      throw new Error(`Inventory snapshot count failed: ${error.message}`);
    }

    return count ?? 0;
  }

  beforeAll(async () => {
    if (!LIVE) {
      return;
    }

    admin = await loadAdmin();

    const { error: orgError } = await admin.from("organizations").insert({
      id: ORG_ID,

      name: "M3.9D-E4 Live Org",

      country_code: null,

      default_currency: "USD",

      timezone: "UTC",
    });

    if (orgError) {
      throw new Error(`Live fixture organization failed: ${orgError.message}`);
    }

    const { error: storeError } = await admin.from("stores").insert({
      id: STORE_ID,

      organization_id: ORG_ID,

      name: "M3.9D-E4 Live Store",

      status: "active",

      currency: "USD",

      timezone: "UTC",
    });

    if (storeError) {
      throw new Error(`Live fixture store failed: ${storeError.message}`);
    }

    const { error: locationError } = await admin.from("locations").insert({
      id: LOCATION_ID,

      organization_id: ORG_ID,

      store_id: STORE_ID,

      name: "M3.9D-E4 Warehouse",

      status: "active",

      code: "DE4-LIVE",
    });

    if (locationError) {
      throw new Error(`Live fixture location failed: ${locationError.message}`);
    }

    const { error: integrationError } = await admin
      .from("integrations")
      .insert({
        id: INTEGRATION_ID,

        organization_id: ORG_ID,

        store_id: STORE_ID,

        provider: "csv",

        status: "active",

        display_name: "M3.9D-E4 CSV",

        configuration: {},
      });

    if (integrationError) {
      throw new Error(
        `Live fixture integration failed: ${integrationError.message}`,
      );
    }

    const { bindCsvLocation } =
      await import("@/lib/providers/csv/location-binding");

    const locationBinding = await bindCsvLocation(
      {
        context,

        externalId: LOCATION_EXTERNAL_ID,

        canonicalLocationId: LOCATION_ID,

        sourceMetadata: {
          configuredBy: "m3.9de4-live-test",
        },
      },
      admin,
    );

    expect(locationBinding).toEqual({
      canonicalEntityId: LOCATION_ID,

      disposition: "imported",
    });

    resourcePersistence = await loadResourcePersistence();

    syncRunPersistence = await loadSyncRunPersistence();
  });

  it("prevents same-key replay from appending immutable inventory history", async () => {
    const first = await executeCsvImport({
      plan: plan(),

      idempotencyKey: "de4-import-a",

      resourcePersistence,

      syncRunPersistence,
    });

    expect(first.disposition).toBe("executed");

    expect(first.status).toBe("completed");

    expect(first.counts).toEqual({
      discovered: 3,

      imported: 3,

      updated: 0,

      skipped: 0,

      quarantined: 0,

      failed: 0,
    });

    expect(first.execution).not.toBeNull();

    expect(await inventorySnapshotCount()).toBe(1);

    const replay = await executeCsvImport({
      plan: plan(),

      idempotencyKey: "de4-import-a",

      resourcePersistence,

      syncRunPersistence,
    });

    expect(replay.syncRunId).toBe(first.syncRunId);

    expect(replay.disposition).toBe("replayed");

    expect(replay.status).toBe("completed");

    expect(replay.execution).toBeNull();

    expect(replay.counts).toEqual(first.counts);

    expect(await inventorySnapshotCount()).toBe(1);
  });

  it("treats a new idempotency key as a new operational import while reconciling current state", async () => {
    const result = await executeCsvImport({
      plan: plan(),

      idempotencyKey: "de4-import-b",

      resourcePersistence,

      syncRunPersistence,
    });

    expect(result.disposition).toBe("executed");

    expect(result.status).toBe("completed");

    expect(result.counts).toEqual({
      discovered: 3,

      imported: 0,

      updated: 0,

      skipped: 3,

      quarantined: 0,

      failed: 0,
    });

    expect(result.execution).not.toBeNull();

    expect(await inventorySnapshotCount()).toBe(1);

    const {
      count: productCount,

      error: productCountError,
    } = await admin
      .from("products")
      .select("*", {
        count: "exact",

        head: true,
      })
      .eq("organization_id", ORG_ID);

    expect(productCountError).toBeNull();

    expect(productCount).toBe(1);

    const {
      count: variantCount,

      error: variantCountError,
    } = await admin
      .from("product_variants")
      .select("*", {
        count: "exact",

        head: true,
      })
      .eq("organization_id", ORG_ID);

    expect(variantCountError).toBeNull();

    expect(variantCount).toBe(1);
  });

  it("persists exactly two terminal SyncRuns for the two operational import keys", async () => {
    const {
      data: syncRuns,

      error: syncRunsError,
    } = await admin
      .from("sync_runs")
      .select(
        "id,idempotency_key,status,discovered_count,imported_count,updated_count,skipped_count,quarantined_count,failed_count",
      )
      .eq("organization_id", ORG_ID)
      .eq("integration_id", INTEGRATION_ID);

    expect(syncRunsError).toBeNull();

    expect(syncRuns).toHaveLength(2);

    const byKey = new Map(
      (syncRuns ?? []).map((row) => [row.idempotency_key, row]),
    );

    expect(byKey.get("de4-import-a")).toMatchObject({
      status: "completed",

      discovered_count: 3,

      imported_count: 3,

      updated_count: 0,

      skipped_count: 0,

      quarantined_count: 0,

      failed_count: 0,
    });

    expect(byKey.get("de4-import-b")).toMatchObject({
      status: "completed",

      discovered_count: 3,

      imported_count: 0,

      updated_count: 0,

      skipped_count: 3,

      quarantined_count: 0,

      failed_count: 0,
    });
  });
});
