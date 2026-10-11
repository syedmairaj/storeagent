import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import type {
  CsvBindingLookup,
  CsvPersistedResource,
  CsvPersistenceDisposition,
  CsvResourcePersistencePort,
} from "@/lib/providers/csv/resource-orchestration";

import type { CsvTrustedImportContext } from "@/lib/providers/csv/trusted-context";

type SupabaseAdminClient = ReturnType<typeof createSupabaseAdminClient>;

interface CsvRpcRow {
  canonical_entity_id: string;
  disposition: string;
}

function requireStoreId(context: CsvTrustedImportContext): string {
  if (context.storeId === null) {
    throw new Error(
      "CSV persistence requires a store-scoped trusted integration.",
    );
  }

  return context.storeId;
}

function sourceMetadata(adapterVersion: string): {
  adapterVersion: string;
} {
  const normalized = adapterVersion.trim();

  if (!normalized) {
    throw new Error("CSV persistence adapterVersion must not be blank.");
  }

  return {
    adapterVersion: normalized,
  };
}

function persistenceDisposition(value: string): CsvPersistenceDisposition {
  if (value === "imported" || value === "updated" || value === "skipped") {
    return value;
  }

  throw new Error(`Unexpected CSV persistence disposition "${value}".`);
}

function rpcResult(rpcName: string, data: unknown): CsvPersistedResource {
  if (!Array.isArray(data) || data.length !== 1) {
    throw new Error(
      `CSV persistence RPC "${rpcName}" must return exactly one row.`,
    );
  }

  const row = data[0] as Partial<CsvRpcRow>;

  if (
    typeof row.canonical_entity_id !== "string" ||
    !row.canonical_entity_id.trim()
  ) {
    throw new Error(
      `CSV persistence RPC "${rpcName}" returned an invalid canonical entity id.`,
    );
  }

  if (typeof row.disposition !== "string") {
    throw new Error(
      `CSV persistence RPC "${rpcName}" returned an invalid disposition.`,
    );
  }

  return {
    canonicalEntityId: row.canonical_entity_id,
    disposition: persistenceDisposition(row.disposition),
  };
}

async function callRpc(
  client: SupabaseAdminClient,
  rpcName: string,
  args: Record<string, unknown>,
): Promise<CsvPersistedResource> {
  const { data, error } = await client.rpc(rpcName, args);

  if (error) {
    throw new Error(
      `CSV persistence RPC "${rpcName}" failed: ${error.message}`,
    );
  }

  return rpcResult(rpcName, data);
}

export function createCsvSupabasePersistence(
  client: SupabaseAdminClient = createSupabaseAdminClient(),
): CsvResourcePersistencePort {
  return {
    async resolveBinding(lookup: CsvBindingLookup) {
      const { data, error } = await client
        .from("provider_bindings")
        .select("canonical_entity_id")
        .eq("organization_id", lookup.organizationId)
        .eq("integration_id", lookup.integrationId)
        .eq("provider", "csv")
        .eq("resource_type", lookup.resourceType)
        .eq("external_id", lookup.externalId)
        .maybeSingle();

      if (error) {
        throw new Error(`CSV ProviderBinding lookup failed: ${error.message}`);
      }

      if (data === null) {
        return null;
      }

      if (
        typeof data.canonical_entity_id !== "string" ||
        !data.canonical_entity_id.trim()
      ) {
        throw new Error(
          "CSV ProviderBinding lookup returned an invalid canonical entity id.",
        );
      }

      return {
        canonicalEntityId: data.canonical_entity_id,
      };
    },

    async persistProduct(input) {
      const storeId = requireStoreId(input.context);

      return callRpc(client, "csv_reconcile_product", {
        p_organization_id: input.context.organizationId,
        p_store_id: storeId,
        p_integration_id: input.context.integrationId,
        p_external_id: input.externalId,
        p_external_parent_id: input.externalParentId,
        p_source_metadata: sourceMetadata(input.adapterVersion),
        p_title: input.title,
        p_brand: input.brand,
        p_category: input.category,
        p_status: input.status,
      });
    },

    async persistProductVariant(input) {
      const storeId = requireStoreId(input.context);

      return callRpc(client, "csv_reconcile_product_variant", {
        p_organization_id: input.context.organizationId,
        p_store_id: storeId,
        p_integration_id: input.context.integrationId,
        p_external_id: input.externalId,
        p_external_parent_id: input.externalParentId,
        p_source_metadata: sourceMetadata(input.adapterVersion),
        p_product_id: input.productId,
        p_sku: input.sku,
        p_barcode: input.barcode,
        p_title: input.title,
        p_status: input.status,
        p_cost_amount: input.costAmount,
        p_selling_price_amount: input.sellingPriceAmount,
        p_currency: input.currency,
      });
    },

    async appendInventorySnapshot(input) {
      const storeId = requireStoreId(input.context);

      return callRpc(client, "csv_append_inventory_snapshot", {
        p_organization_id: input.context.organizationId,
        p_store_id: storeId,
        p_integration_id: input.context.integrationId,
        p_variant_id: input.variantId,
        p_location_id: input.locationId,
        p_observed_at: input.observedAt,
        p_on_hand_quantity: input.onHandQuantity,
        p_available_quantity: input.availableQuantity,
        p_committed_quantity: input.committedQuantity,
        p_incoming_quantity: input.incomingQuantity,
      });
    },

    async persistOrder(input) {
      const storeId = requireStoreId(input.context);

      return callRpc(client, "csv_reconcile_order", {
        p_organization_id: input.context.organizationId,
        p_store_id: storeId,
        p_integration_id: input.context.integrationId,
        p_external_id: input.externalId,
        p_external_parent_id: input.externalParentId,
        p_source_metadata: sourceMetadata(input.adapterVersion),
        p_external_reference: input.externalReference,
        p_status: input.status,
        p_ordered_at: input.orderedAt,
        p_currency: input.currency,
        p_gross_amount: input.grossAmount,
        p_discount_amount: input.discountAmount,
        p_net_amount: input.netAmount,
      });
    },

    async persistOrderItem(input) {
      const storeId = requireStoreId(input.context);

      return callRpc(client, "csv_reconcile_order_item", {
        p_organization_id: input.context.organizationId,
        p_store_id: storeId,
        p_integration_id: input.context.integrationId,
        p_external_id: input.externalId,
        p_external_parent_id: input.externalParentId,
        p_source_metadata: sourceMetadata(input.adapterVersion),
        p_order_id: input.orderId,
        p_variant_id: input.variantId,
        p_location_id: input.locationId,
        p_quantity: input.quantity,
        p_unit_price_amount: input.unitPriceAmount,
        p_discount_amount: input.discountAmount,
        p_unit_cost_amount: input.unitCostAmount,
        p_currency: input.currency,
      });
    },

    async persistSupplier(input) {
      return callRpc(client, "csv_reconcile_supplier", {
        p_organization_id: input.context.organizationId,
        p_integration_id: input.context.integrationId,
        p_external_id: input.externalId,
        p_external_parent_id: input.externalParentId,
        p_source_metadata: sourceMetadata(input.adapterVersion),
        p_name: input.name,
        p_default_lead_time_days: input.defaultLeadTimeDays,
        p_currency: input.currency,
        p_email: input.email,
        p_phone: input.phone,
      });
    },

    async persistSupplierProduct(input) {
      return callRpc(client, "csv_reconcile_supplier_product", {
        p_organization_id: input.context.organizationId,
        p_integration_id: input.context.integrationId,
        p_supplier_id: input.supplierId,
        p_variant_id: input.variantId,
        p_supplier_sku: input.supplierSku,
        p_unit_cost_amount: input.unitCostAmount,
        p_currency: input.currency,
        p_lead_time_days: input.leadTimeDays,
        p_minimum_order_quantity: input.minimumOrderQuantity,
        p_pack_size: input.packSize,
        p_preferred: input.preferred,
      });
    },

    async persistPurchaseOrder(input) {
      const storeId = requireStoreId(input.context);

      return callRpc(client, "csv_reconcile_purchase_order", {
        p_organization_id: input.context.organizationId,
        p_store_id: storeId,
        p_integration_id: input.context.integrationId,
        p_external_id: input.externalId,
        p_external_parent_id: input.externalParentId,
        p_source_metadata: sourceMetadata(input.adapterVersion),
        p_supplier_id: input.supplierId,
        p_external_reference: input.externalReference,
        p_status: input.status,
        p_ordered_at: input.orderedAt,
        p_expected_at: input.expectedAt,
        p_received_at: input.receivedAt,
        p_currency: input.currency,
      });
    },

    async persistPurchaseOrderItem(input) {
      const storeId = requireStoreId(input.context);

      return callRpc(client, "csv_reconcile_purchase_order_item", {
        p_organization_id: input.context.organizationId,
        p_store_id: storeId,
        p_integration_id: input.context.integrationId,
        p_external_id: input.externalId,
        p_external_parent_id: input.externalParentId,
        p_source_metadata: sourceMetadata(input.adapterVersion),
        p_purchase_order_id: input.purchaseOrderId,
        p_variant_id: input.variantId,
        p_destination_location_id: input.destinationLocationId,
        p_ordered_quantity: input.orderedQuantity,
        p_received_quantity: input.receivedQuantity,
        p_unit_cost_amount: input.unitCostAmount,
        p_currency: input.currency,
      });
    },
  };
}
