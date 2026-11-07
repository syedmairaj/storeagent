import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it, vi } from "vitest";

import { buildMerchantCsvImportPlan } from "@/lib/inventory-import/build-csv-plan";
import { ensureCsvStoreIntegration } from "@/lib/inventory-import/ensure-integration";
import { parseMerchantInventoryCsv } from "@/lib/inventory-import/parse-merchant-csv";
import { executeCsvImport } from "@/lib/providers/csv/import-execution";

vi.mock("server-only", () => ({}));

const LIVE = process.env.RUN_CSV_LIVE_TESTS === "1";
const describeLive = LIVE ? describe : describe.skip;

const ORG_ID = randomUUID();
const STORE_ID = randomUUID();
const LOCATION_ID = randomUUID();

describeLive("merchant inventory import live", () => {
  let admin: Awaited<
    ReturnType<typeof import("@/lib/supabase/admin").createSupabaseAdminClient>
  >;

  beforeAll(async () => {
    const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
    admin = createSupabaseAdminClient();

    const { error: orgError } = await admin.from("organizations").insert({
      id: ORG_ID,
      name: "Merchant CSV Import Org",
      country_code: "US",
      default_currency: "USD",
      timezone: "UTC",
    });
    if (orgError) {
      throw new Error(orgError.message);
    }

    const { error: storeError } = await admin.from("stores").insert({
      id: STORE_ID,
      organization_id: ORG_ID,
      name: "Merchant Store",
      status: "active",
      currency: "USD",
      timezone: "UTC",
    });
    if (storeError) {
      throw new Error(storeError.message);
    }

    const { error: locationError } = await admin.from("locations").insert({
      id: LOCATION_ID,
      organization_id: ORG_ID,
      store_id: STORE_ID,
      name: "Main",
      status: "active",
      code: null,
    });
    if (locationError) {
      throw new Error(locationError.message);
    }
  });

  it("persists a merchant CSV through ensure + executeCsvImport", async () => {
    const csv = [
      "sku,product_name,available_quantity,on_hand_quantity",
      "LIVE-SKU-1,Live Widget,7,9",
    ].join("\n");

    const parsed = parseMerchantInventoryCsv({ source: csv });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    const { context } = await ensureCsvStoreIntegration({
      organizationId: ORG_ID,
      storeId: STORE_ID,
      locationId: LOCATION_ID,
      client: admin,
    });

    const { createCsvSupabasePersistence } = await import(
      "@/lib/providers/csv/supabase-persistence"
    );
    const { createCsvSyncRunPersistence } = await import(
      "@/lib/providers/csv/sync-run-persistence"
    );

    const first = await executeCsvImport({
      plan: buildMerchantCsvImportPlan({
        context,
        rows: parsed.rows,
        storeCurrency: "USD",
        observedAt: "2026-11-07T15:00:00.000Z",
      }),
      idempotencyKey: `merchant-live-${ORG_ID}`,
      resourcePersistence: createCsvSupabasePersistence(admin),
      syncRunPersistence: createCsvSyncRunPersistence(admin),
    });

    expect(first.disposition).toBe("executed");
    expect(first.counts.failed).toBe(0);
    expect(first.counts.quarantined).toBe(0);
    expect(first.counts.imported).toBeGreaterThan(0);

    const { count } = await admin
      .from("inventory_snapshots")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", ORG_ID)
      .eq("store_id", STORE_ID);

    expect(count).toBe(1);

    const replay = await executeCsvImport({
      plan: buildMerchantCsvImportPlan({
        context,
        rows: parsed.rows,
        storeCurrency: "USD",
        observedAt: "2026-11-07T15:00:00.000Z",
      }),
      idempotencyKey: `merchant-live-${ORG_ID}`,
      resourcePersistence: createCsvSupabasePersistence(admin),
      syncRunPersistence: createCsvSyncRunPersistence(admin),
    });

    expect(replay.disposition).toBe("replayed");
    expect(replay.syncRunId).toBe(first.syncRunId);

    const { count: afterReplay } = await admin
      .from("inventory_snapshots")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", ORG_ID)
      .eq("store_id", STORE_ID);

    expect(afterReplay).toBe(1);
  });
});
