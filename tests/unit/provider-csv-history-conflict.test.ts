import fs from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  CSV_HISTORY_CONFLICT_SQLSTATE,
  CsvPersistenceHistoryConflictError,
} from "@/lib/providers/csv/persistence-errors";

import { orchestrateCsvInventorySnapshot } from "@/lib/providers/csv/orchestrate-resource";

import type { CsvResourcePersistencePort } from "@/lib/providers/csv/resource-orchestration";

const context = {
  organizationId: "org-1",
  integrationId: "integration-1",
  storeId: "store-1",
  provider: "csv" as const,
  scope: {
    organizationId: "org-1",
    storeId: "store-1",
    source: "integration_binding" as const,
  },
};

describe("CSV immutable history conflict typing", () => {
  it("defines stable SA002 history conflict identity", () => {
    expect(CSV_HISTORY_CONFLICT_SQLSTATE).toBe("SA002");

    const error = new CsvPersistenceHistoryConflictError(
      "csv_append_inventory_snapshot",
    );

    expect(error.name).toBe("CsvPersistenceHistoryConflictError");

    expect(error.reasonCode).toBe("HISTORY_CONFLICT");

    expect(error.rpcName).toBe("csv_append_inventory_snapshot");
  });

  it("wires SA002 to the typed persistence history conflict", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "lib/providers/csv/supabase-persistence.ts"),
      "utf8",
    );

    expect(source).toContain("CSV_HISTORY_CONFLICT_SQLSTATE");

    expect(source).toContain("CsvPersistenceHistoryConflictError");

    expect(source).toContain("error.code === CSV_HISTORY_CONFLICT_SQLSTATE");

    expect(source).toContain(
      "throw new CsvPersistenceHistoryConflictError(rpcName)",
    );
  });

  it("quarantines contradictory persisted inventory history", async () => {
    const persistence = {
      resolveBinding: vi.fn(
        async ({ resourceType }: { resourceType: string }) => {
          if (resourceType === "product_variant") {
            return {
              canonicalEntityId: "variant-1",
            };
          }

          if (resourceType === "location") {
            return {
              canonicalEntityId: "location-1",
            };
          }

          return null;
        },
      ),

      appendInventorySnapshot: vi.fn(async () => {
        throw new CsvPersistenceHistoryConflictError(
          "csv_append_inventory_snapshot",
        );
      }),
    } as unknown as CsvResourcePersistencePort;

    const result = await orchestrateCsvInventorySnapshot(
      context,
      {
        disposition: "accepted",
        provider: "csv",
        observationType: "inventory_snapshot",
        adapterVersion: "inventory-v1",
        variantExternalId: "V-1",
        locationExternalId: "L-1",
        canonical: {
          variantExternalId: "V-1",
          locationExternalId: "L-1",
          observedAt: "2026-10-12T12:00:00.000Z",
          onHandQuantity: 11,
          availableQuantity: 8,
          committedQuantity: 2,
          incomingQuantity: null,
        },
        issues: [],
      },
      persistence,
    );

    expect(result).toEqual({
      disposition: "quarantined",
      reasonCode: "HISTORY_CONFLICT",
      issues: [],
    });
  });
});
