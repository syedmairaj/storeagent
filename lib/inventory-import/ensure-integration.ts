import "server-only";

import type { Integration } from "@/lib/commerce-domain/types";
import { MERCHANT_CSV_LOCATION_EXTERNAL_ID } from "@/lib/inventory-import/contract";
import { bindCsvLocation } from "@/lib/providers/csv/location-binding";
import {
  buildCsvTrustedImportContext,
  type CsvTrustedImportContext,
} from "@/lib/providers/csv/trusted-context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

type IntegrationRow = {
  id: string;
  organization_id: string;
  store_id: string | null;
  provider: string;
  status: string;
  display_name: string | null;
  configuration: unknown;
  created_at: string;
  updated_at: string;
};

function toIntegration(row: IntegrationRow): Integration {
  return {
    id: row.id,
    organizationId: row.organization_id,
    storeId: row.store_id,
    provider: row.provider as Integration["provider"],
    status: row.status as Integration["status"],
    displayName: row.display_name,
    configuration: (row.configuration as Integration["configuration"]) ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function ensureCsvStoreIntegration(input: {
  organizationId: string;
  storeId: string;
  locationId: string;
  client?: AdminClient;
}): Promise<{
  integration: Integration;
  context: CsvTrustedImportContext;
}> {
  const client = input.client ?? createSupabaseAdminClient();

  const { data: existing, error: existingError } = await client
    .from("integrations")
    .select(
      "id,organization_id,store_id,provider,status,display_name,configuration,created_at,updated_at",
    )
    .eq("organization_id", input.organizationId)
    .eq("store_id", input.storeId)
    .eq("provider", "csv")
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1);

  if (existingError) {
    throw new Error(
      `Unable to load CSV integration: ${existingError.message}`,
    );
  }

  let row = (existing?.[0] as IntegrationRow | undefined) ?? null;

  if (!row) {
    const { data: created, error: createError } = await client
      .from("integrations")
      .insert({
        organization_id: input.organizationId,
        store_id: input.storeId,
        provider: "csv",
        status: "active",
        display_name: "CSV inventory import",
        configuration: {
          purpose: "merchant_inventory_import_v1",
        },
      })
      .select(
        "id,organization_id,store_id,provider,status,display_name,configuration,created_at,updated_at",
      )
      .single();

    if (createError || !created) {
      throw new Error(
        `Unable to create CSV integration: ${createError?.message ?? "unknown"}`,
      );
    }

    row = created as IntegrationRow;
  }

  const integration = toIntegration(row);
  const context = buildCsvTrustedImportContext(
    integration,
    input.organizationId,
  );

  await bindCsvLocation(
    {
      context,
      externalId: MERCHANT_CSV_LOCATION_EXTERNAL_ID,
      canonicalLocationId: input.locationId,
      sourceMetadata: {
        configuredBy: "merchant_inventory_import_v1",
        locationName: MERCHANT_CSV_LOCATION_EXTERNAL_ID,
      },
    },
    client,
  );

  return { integration, context };
}
