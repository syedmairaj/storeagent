/**
 * Merchant sales import conflict policy (V1).
 *
 * M3 csv_reconcile_order / csv_reconcile_order_item update commercial fields
 * on identity match. Sales History V1 therefore preflights and rejects
 * conflicting reimports before persistence so historical sales cannot change
 * silently. Identical replays remain allowed (SyncRun + reconcile skip).
 */

export type ProposedSalesOrder = {
  orderExternalId: string;
  status: string;
  orderedAtIso: string;
  currency: string;
  externalReference: string | null;
};

export type ExistingSalesOrder = {
  orderExternalId: string;
  status: string;
  orderedAtIso: string;
  currency: string;
  externalReference: string | null;
};

export type ProposedSalesOrderItem = {
  lineExternalId: string;
  orderExternalId: string;
  variantSku: string;
  quantity: number;
  currency: string | null;
  unitPrice: string | null;
};

export type ExistingSalesOrderItem = {
  lineExternalId: string;
  orderExternalId: string;
  variantSku: string;
  quantity: number;
  currency: string | null;
  unitPrice: string | null;
};

function normalizeInstant(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toISOString();
}

function moneyKey(value: string | null): string {
  if (value == null || value.trim() === "") {
    return "";
  }
  const asNumber = Number(value);
  if (!Number.isFinite(asNumber)) {
    return value.trim();
  }
  return asNumber.toFixed(4);
}

export function describeSalesOrderConflict(
  proposed: ProposedSalesOrder,
  existing: ExistingSalesOrder,
): string | null {
  const mismatches: string[] = [];
  if (existing.status !== proposed.status) {
    mismatches.push("status");
  }
  if (
    normalizeInstant(existing.orderedAtIso) !==
    normalizeInstant(proposed.orderedAtIso)
  ) {
    mismatches.push("ordered_at");
  }
  if (existing.currency !== proposed.currency) {
    mismatches.push("currency");
  }
  if (
    (existing.externalReference ?? proposed.orderExternalId) !==
    (proposed.externalReference ?? proposed.orderExternalId)
  ) {
    mismatches.push("external_reference");
  }
  if (mismatches.length === 0) {
    return null;
  }
  return `Order "${proposed.orderExternalId}" already exists with different ${mismatches.join(", ")}. Conflicting sales history cannot overwrite prior orders.`;
}

export function describeSalesOrderItemConflict(
  proposed: ProposedSalesOrderItem,
  existing: ExistingSalesOrderItem,
): string | null {
  const mismatches: string[] = [];
  if (existing.orderExternalId !== proposed.orderExternalId) {
    mismatches.push("order_id");
  }
  if (existing.variantSku !== proposed.variantSku) {
    mismatches.push("sku");
  }
  if (existing.quantity !== proposed.quantity) {
    mismatches.push("quantity");
  }
  if ((existing.currency ?? "") !== (proposed.currency ?? "")) {
    mismatches.push("currency");
  }
  if (moneyKey(existing.unitPrice) !== moneyKey(proposed.unitPrice)) {
    mismatches.push("unit_price");
  }
  if (mismatches.length === 0) {
    return null;
  }
  return `Line "${proposed.lineExternalId}" already exists with different ${mismatches.join(", ")}. Conflicting sales lines cannot overwrite prior quantities.`;
}

export function collectSalesHistoryConflicts(input: {
  proposedOrders: readonly ProposedSalesOrder[];
  existingOrders: readonly ExistingSalesOrder[];
  proposedItems: readonly ProposedSalesOrderItem[];
  existingItems: readonly ExistingSalesOrderItem[];
}): string[] {
  const existingOrderById = new Map(
    input.existingOrders.map((order) => [order.orderExternalId, order]),
  );
  const existingItemById = new Map(
    input.existingItems.map((item) => [item.lineExternalId, item]),
  );

  const conflicts: string[] = [];

  for (const proposed of input.proposedOrders) {
    const existing = existingOrderById.get(proposed.orderExternalId);
    if (!existing) {
      continue;
    }
    const message = describeSalesOrderConflict(proposed, existing);
    if (message) {
      conflicts.push(message);
    }
  }

  for (const proposed of input.proposedItems) {
    const existing = existingItemById.get(proposed.lineExternalId);
    if (!existing) {
      continue;
    }
    const message = describeSalesOrderItemConflict(proposed, existing);
    if (message) {
      conflicts.push(message);
    }
  }

  return conflicts;
}
