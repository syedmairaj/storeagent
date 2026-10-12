import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it, vi } from "vitest";

import type { CsvSyncRunPersistencePort } from "@/lib/providers/csv/sync-run-persistence";

import type { CsvTrustedImportContext } from "@/lib/providers/csv/trusted-context";

vi.mock("server-only", () => ({}));

const LIVE = process.env.RUN_CSV_LIVE_TESTS === "1";

const ORG_ID = randomUUID();

const STORE_ID = randomUUID();

const INTEGRATION_ID = randomUUID();

const context: CsvTrustedImportContext = {
  organizationId: ORG_ID,

  integrationId: INTEGRATION_ID,

  storeId: STORE_ID,

  provider: "csv",

  scope: {
    organizationId: ORG_ID,

    storeId: STORE_ID,

    source: "integration_binding",
  },
};

const describeLive = LIVE ? describe : describe.skip;

describeLive("CSV SyncRun Supabase persistence live", () => {
  let admin: Awaited<ReturnType<typeof loadAdmin>>;

  let persistence: CsvSyncRunPersistencePort;

  async function loadAdmin() {
    const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");

    return createSupabaseAdminClient();
  }

  async function loadPersistence() {
    const { createCsvSyncRunPersistence } =
      await import("@/lib/providers/csv/sync-run-persistence");

    return createCsvSyncRunPersistence(admin);
  }

  beforeAll(async () => {
    if (!LIVE) {
      return;
    }

    admin = await loadAdmin();

    const { error: organizationError } = await admin
      .from("organizations")
      .insert({
        id: ORG_ID,

        name: "M3.9D-E2 Live Org",

        country_code: null,

        default_currency: "USD",

        timezone: "UTC",
      });

    if (organizationError) {
      throw new Error(
        `Live fixture organization failed: ${organizationError.message}`,
      );
    }

    const { error: storeError } = await admin.from("stores").insert({
      id: STORE_ID,

      organization_id: ORG_ID,

      name: "M3.9D-E2 Live Store",

      status: "active",

      currency: "USD",

      timezone: "UTC",
    });

    if (storeError) {
      throw new Error(`Live fixture store failed: ${storeError.message}`);
    }

    const { error: integrationError } = await admin
      .from("integrations")
      .insert({
        id: INTEGRATION_ID,

        organization_id: ORG_ID,

        store_id: STORE_ID,

        provider: "csv",

        status: "active",

        display_name: "M3.9D-E2 CSV",

        configuration: {},
      });

    if (integrationError) {
      throw new Error(
        `Live fixture integration failed: ${integrationError.message}`,
      );
    }

    persistence = await loadPersistence();
  });

  it("acquires, detects in-progress replay, completes, and returns terminal replay", async () => {
    const first = await persistence.begin({
      context,

      idempotencyKey: "import-001",

      reconciliationMetadata: {
        source: "live-adapter-test",
      },
    });

    expect(first).toEqual({
      syncRunId: expect.any(String),

      disposition: "started",

      status: "running",

      counts: {
        discovered: 0,

        imported: 0,

        updated: 0,

        skipped: 0,

        quarantined: 0,

        failed: 0,
      },
    });

    const activeReplay = await persistence.begin({
      context,

      idempotencyKey: "import-001",
    });

    expect(activeReplay).toEqual({
      syncRunId: first.syncRunId,

      disposition: "in_progress",

      status: "running",

      counts: {
        discovered: 0,

        imported: 0,

        updated: 0,

        skipped: 0,

        quarantined: 0,

        failed: 0,
      },
    });

    const completed = await persistence.complete({
      context,

      syncRunId: first.syncRunId,

      counts: {
        discovered: 3,

        imported: 2,

        updated: 0,

        skipped: 1,

        quarantined: 0,

        failed: 0,
      },

      reconciliationMetadata: {
        phase: "complete",
      },
    });

    expect(completed).toEqual({
      syncRunId: first.syncRunId,

      status: "completed",
    });

    const terminalReplay = await persistence.begin({
      context,

      idempotencyKey: "import-001",
    });

    expect(terminalReplay).toEqual({
      syncRunId: first.syncRunId,

      disposition: "replayed",

      status: "completed",

      counts: {
        discovered: 3,

        imported: 2,

        updated: 0,

        skipped: 1,

        quarantined: 0,

        failed: 0,
      },
    });
  });

  it("persists failed lifecycle and replays the failed SyncRun without creating another run", async () => {
    const started = await persistence.begin({
      context,

      idempotencyKey: "import-002",
    });

    expect(started.disposition).toBe("started");

    expect(started.status).toBe("running");

    const failed = await persistence.fail({
      context,

      syncRunId: started.syncRunId,

      errorSummary: {
        code: "LIVE_TEST_FAILURE",
      },

      reconciliationMetadata: {
        phase: "failed",
      },
    });

    expect(failed).toEqual({
      syncRunId: started.syncRunId,

      status: "failed",
    });

    const replay = await persistence.begin({
      context,

      idempotencyKey: "import-002",
    });

    expect(replay).toEqual({
      syncRunId: started.syncRunId,

      disposition: "replayed",

      status: "failed",

      counts: {
        discovered: 0,

        imported: 0,

        updated: 0,

        skipped: 0,

        quarantined: 0,

        failed: 0,
      },
    });

    const { count, error } = await admin
      .from("sync_runs")
      .select("*", {
        count: "exact",

        head: true,
      })
      .eq("organization_id", ORG_ID)
      .eq("integration_id", INTEGRATION_ID);

    expect(error).toBeNull();

    expect(count).toBe(2);
  });
});
