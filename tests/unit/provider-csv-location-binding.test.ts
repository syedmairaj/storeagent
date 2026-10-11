import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(),
}));

import { bindCsvLocation } from "@/lib/providers/csv/location-binding";

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

describe("CSV location binding", () => {
  it("binds normalized external location identity through the dedicated RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          canonical_entity_id: "location-1",

          disposition: "imported",
        },
      ],

      error: null,
    });

    const result = await bindCsvLocation(
      {
        context,

        externalId: "  WAREHOUSE-DXB  ",

        canonicalLocationId: "location-1",

        sourceMetadata: {
          configuredBy: "merchant",
        },
      },
      {
        rpc,
      } as never,
    );

    expect(result).toEqual({
      canonicalEntityId: "location-1",

      disposition: "imported",
    });

    expect(rpc).toHaveBeenCalledWith("csv_bind_location", {
      p_organization_id: "org-1",

      p_store_id: "store-1",

      p_integration_id: "integration-1",

      p_external_id: "WAREHOUSE-DXB",

      p_canonical_location_id: "location-1",

      p_source_metadata: {
        configuredBy: "merchant",
      },
    });
  });

  it("accepts idempotent replay", async () => {
    const result = await bindCsvLocation(
      {
        context,

        externalId: "MAIN",

        canonicalLocationId: "location-1",
      },
      {
        rpc: vi.fn().mockResolvedValue({
          data: [
            {
              canonical_entity_id: "location-1",

              disposition: "skipped",
            },
          ],

          error: null,
        }),
      } as never,
    );

    expect(result.disposition).toBe("skipped");
  });

  it("rejects org-only context before RPC execution", async () => {
    const rpc = vi.fn();

    await expect(
      bindCsvLocation(
        {
          context: {
            ...context,

            storeId: null,

            scope: {
              organizationId: "org-1",

              storeId: null,

              source: "integration_binding",
            },
          },

          externalId: "MAIN",

          canonicalLocationId: "location-1",
        },
        {
          rpc,
        } as never,
      ),
    ).rejects.toThrow();

    expect(rpc).not.toHaveBeenCalled();
  });

  it("surfaces RPC binding conflict as failure", async () => {
    await expect(
      bindCsvLocation(
        {
          context,

          externalId: "MAIN",

          canonicalLocationId: "location-2",
        },
        {
          rpc: vi.fn().mockResolvedValue({
            data: null,

            error: {
              message:
                "CSV location identity is already bound to another canonical location",
            },
          }),
        } as never,
      ),
    ).rejects.toThrow("CSV location identity is already bound");
  });
});
