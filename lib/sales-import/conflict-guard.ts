import "server-only";

import type { CsvTrustedImportContext } from "@/lib/providers/csv/trusted-context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  collectSalesHistoryConflicts,
  type ExistingSalesOrder,
  type ExistingSalesOrderItem,
  type ProposedSalesOrder,
  type ProposedSalesOrderItem,
} from "@/lib/sales-import/conflict-policy";
import type { MerchantSalesImportPreviewRow } from "@/lib/sales-import/contract";
import { collectMerchantSalesOrders } from "@/lib/sales-import/build-csv-plan";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

type BindingRow = {
  external_id: string;
  canonical_entity_id: string;
  resource_type: string;
};

/**
 * Fail closed before persistence when proposed sales identities already exist
 * with different commercial fields. Identical replays return no conflicts.
 */
export async function assertNoConflictingSalesHistory(input: {
  context: CsvTrustedImportContext;
  rows: readonly MerchantSalesImportPreviewRow[];
  client?: AdminClient;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const ready = input.rows.filter((row) => row.importStatus === "ready");
  if (ready.length === 0) {
    return { ok: true };
  }

  const storeId = input.context.storeId;
  if (!storeId) {
    return { ok: false, error: "Sales import requires a store-scoped CSV integration." };
  }

  const orders = collectMerchantSalesOrders(input.rows);
  const proposedOrders: ProposedSalesOrder[] = [...orders.values()].map(
    (order) => ({
      orderExternalId: order.orderId,
      status: order.orderStatus,
      orderedAtIso: order.orderedAtIso,
      currency: order.currency,
      externalReference: order.orderId,
    }),
  );
  const proposedItems: ProposedSalesOrderItem[] = ready.map((row) => ({
    lineExternalId: row.lineId,
    orderExternalId: row.orderId,
    variantSku: row.sku,
    quantity: row.quantity,
    currency: row.currency,
    unitPrice: row.unitPrice,
  }));

  const orderExternalIds = proposedOrders.map((order) => order.orderExternalId);
  const lineExternalIds = proposedItems.map((item) => item.lineExternalId);

  const client = input.client ?? createSupabaseAdminClient();

  const { data: bindings, error: bindingError } = await client
    .from("provider_bindings")
    .select("external_id,canonical_entity_id,resource_type")
    .eq("organization_id", input.context.organizationId)
    .eq("integration_id", input.context.integrationId)
    .eq("provider", "csv")
    .in("resource_type", ["order", "order_item"])
    .in("external_id", [...orderExternalIds, ...lineExternalIds]);

  if (bindingError) {
    return {
      ok: false,
      error: "Unable to verify existing sales history before import.",
    };
  }

  const bindingRows = (bindings ?? []) as BindingRow[];
  const orderBindings = bindingRows.filter(
    (row) => row.resource_type === "order",
  );
  const itemBindings = bindingRows.filter(
    (row) => row.resource_type === "order_item",
  );

  const existingOrders: ExistingSalesOrder[] = [];
  if (orderBindings.length > 0) {
    const { data: orderRows, error: orderError } = await client
      .from("orders")
      .select("id,status,ordered_at,currency,external_reference")
      .eq("organization_id", input.context.organizationId)
      .eq("store_id", storeId)
      .in(
        "id",
        orderBindings.map((row) => row.canonical_entity_id),
      );

    if (orderError) {
      return {
        ok: false,
        error: "Unable to verify existing orders before import.",
      };
    }

    const orderById = new Map(
      (orderRows ?? []).map((row) => [
        String((row as { id: string }).id),
        row as {
          id: string;
          status: string;
          ordered_at: string;
          currency: string;
          external_reference: string | null;
        },
      ]),
    );

    for (const binding of orderBindings) {
      const order = orderById.get(binding.canonical_entity_id);
      if (!order) {
        continue;
      }
      existingOrders.push({
        orderExternalId: binding.external_id,
        status: order.status,
        orderedAtIso: order.ordered_at,
        currency: order.currency,
        externalReference: order.external_reference,
      });
    }
  }

  const existingItems: ExistingSalesOrderItem[] = [];
  if (itemBindings.length > 0) {
    const { data: itemRows, error: itemError } = await client
      .from("order_items")
      .select(
        "id,order_id,variant_id,quantity,currency,unit_price_amount",
      )
      .eq("organization_id", input.context.organizationId)
      .eq("store_id", storeId)
      .in(
        "id",
        itemBindings.map((row) => row.canonical_entity_id),
      );

    if (itemError) {
      return {
        ok: false,
        error: "Unable to verify existing order lines before import.",
      };
    }

    const items = (itemRows ?? []) as Array<{
      id: string;
      order_id: string;
      variant_id: string;
      quantity: number;
      currency: string | null;
      unit_price_amount: string | number | null;
    }>;

    const variantIds = [...new Set(items.map((item) => item.variant_id))];
    const orderIds = [...new Set(items.map((item) => item.order_id))];

    const [{ data: variants }, { data: parentOrders }, { data: orderBindingsForParents }] =
      await Promise.all([
        client
          .from("product_variants")
          .select("id,sku")
          .eq("organization_id", input.context.organizationId)
          .eq("store_id", storeId)
          .in("id", variantIds),
        client
          .from("orders")
          .select("id")
          .eq("organization_id", input.context.organizationId)
          .eq("store_id", storeId)
          .in("id", orderIds),
        client
          .from("provider_bindings")
          .select("external_id,canonical_entity_id")
          .eq("organization_id", input.context.organizationId)
          .eq("integration_id", input.context.integrationId)
          .eq("provider", "csv")
          .eq("resource_type", "order")
          .in("canonical_entity_id", orderIds),
      ]);

    const skuByVariant = new Map(
      ((variants ?? []) as Array<{ id: string; sku: string }>).map((row) => [
        row.id,
        row.sku,
      ]),
    );
    const orderExternalByCanonical = new Map(
      (
        (orderBindingsForParents ?? []) as Array<{
          external_id: string;
          canonical_entity_id: string;
        }>
      ).map((row) => [row.canonical_entity_id, row.external_id]),
    );

    void parentOrders;

    const itemByCanonical = new Map(items.map((item) => [item.id, item]));
    for (const binding of itemBindings) {
      const item = itemByCanonical.get(binding.canonical_entity_id);
      if (!item) {
        continue;
      }
      const unitPrice =
        item.unit_price_amount == null
          ? null
          : String(item.unit_price_amount);
      existingItems.push({
        lineExternalId: binding.external_id,
        orderExternalId:
          orderExternalByCanonical.get(item.order_id) ?? item.order_id,
        variantSku: skuByVariant.get(item.variant_id) ?? "",
        quantity: item.quantity,
        currency: item.currency,
        unitPrice,
      });
    }
  }

  const conflicts = collectSalesHistoryConflicts({
    proposedOrders,
    existingOrders,
    proposedItems,
    existingItems,
  });

  if (conflicts.length > 0) {
    return { ok: false, error: conflicts[0]! };
  }

  return { ok: true };
}
