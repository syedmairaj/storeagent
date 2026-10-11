import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import { normalizeExternalId } from "@/lib/providers/external-identity";

import type { CsvPersistenceDisposition } from "./resource-orchestration";

import type { CsvTrustedImportContext } from "./trusted-context";

import { requireCsvStoreScopedContext } from "./trusted-context";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

export interface CsvLocationBindingResult {
  canonicalEntityId: string;

  disposition: Extract<CsvPersistenceDisposition, "imported" | "skipped">;
}

function requireCanonicalLocationId(value: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error("canonicalLocationId must not be empty.");
  }

  return normalized;
}

function disposition(value: unknown): "imported" | "skipped" {
  if (value === "imported" || value === "skipped") {
    return value;
  }

  throw new Error(
    `Unexpected CSV location binding disposition "${String(value)}".`,
  );
}

export async function bindCsvLocation(
  input: {
    context: CsvTrustedImportContext;

    externalId: string;

    canonicalLocationId: string;

    sourceMetadata?: Record<string, unknown> | null;
  },
  client: SupabaseAdminClient = createSupabaseAdminClient(),
): Promise<CsvLocationBindingResult> {
  requireCsvStoreScopedContext(input.context);

  const storeId = input.context.storeId;

  if (storeId === null) {
    throw new Error("CSV location binding requires store-scoped context.");
  }

  const externalId = normalizeExternalId(input.externalId);

  const canonicalLocationId = requireCanonicalLocationId(
    input.canonicalLocationId,
  );

  const { data, error } = await client.rpc("csv_bind_location", {
    p_organization_id: input.context.organizationId,

    p_store_id: storeId,

    p_integration_id: input.context.integrationId,

    p_external_id: externalId,

    p_canonical_location_id: canonicalLocationId,

    p_source_metadata: input.sourceMetadata ?? null,
  });

  if (error) {
    throw new Error(`CSV location binding failed: ${error.message}`);
  }

  if (!Array.isArray(data) || data.length !== 1) {
    throw new Error("CSV location binding RPC must return exactly one row.");
  }

  const row = data[0] as {
    canonical_entity_id?: unknown;

    disposition?: unknown;
  };

  if (
    typeof row.canonical_entity_id !== "string" ||
    !row.canonical_entity_id.trim()
  ) {
    throw new Error(
      "CSV location binding returned an invalid canonical entity id.",
    );
  }

  return {
    canonicalEntityId: row.canonical_entity_id,

    disposition: disposition(row.disposition),
  };
}
