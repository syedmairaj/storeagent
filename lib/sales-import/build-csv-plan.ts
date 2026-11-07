import type { CsvImportPlan } from "@/lib/providers/csv/import-assembly";
import type { CsvTrustedImportContext } from "@/lib/providers/csv/trusted-context";

import {
  MERCHANT_SALES_CSV_LOCATION_EXTERNAL_ID,
  MERCHANT_SALES_IMPORT_ADAPTER_VERSION,
  type MerchantSalesImportPreviewRow,
} from "@/lib/sales-import/contract";

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

export function collectMerchantSalesOrders(
  rows: readonly MerchantSalesImportPreviewRow[],
): Map<
  string,
  {
    orderId: string;
    orderedAtIso: string;
    orderStatus: string;
    currency: string;
  }
> {
  const ready = rows.filter((row) => row.importStatus === "ready");
  const ordersById = new Map<
    string,
    {
      orderId: string;
      orderedAtIso: string;
      orderStatus: string;
      currency: string;
    }
  >();

  for (const row of ready) {
    const existing = ordersById.get(row.orderId);
    if (!existing) {
      ordersById.set(row.orderId, {
        orderId: row.orderId,
        orderedAtIso: row.orderedAtIso,
        orderStatus: row.orderStatus,
        currency: row.currency,
      });
      continue;
    }

    // Same order_id must not contradict timestamp/status/currency.
    if (
      existing.orderedAtIso !== row.orderedAtIso ||
      existing.orderStatus !== row.orderStatus ||
      existing.currency !== row.currency
    ) {
      throw new Error(
        `Order ${row.orderId} has conflicting header fields across lines.`,
      );
    }
  }

  return ordersById;
}

/**
 * Expand merchant-friendly sales lines into M3 order + order_item lanes.
 *
 * Variant external IDs use the plain SKU (same identity as inventory import V1).
 * Location is bound to the authorized merchant location via "Main".
 */
export function buildMerchantSalesCsvImportPlan(input: {
  context: CsvTrustedImportContext;
  rows: readonly MerchantSalesImportPreviewRow[];
}): CsvImportPlan {
  const ready = input.rows.filter((row) => row.importStatus === "ready");
  const ordersById = collectMerchantSalesOrders(input.rows);

  const orderLines = [
    "Order ID,Status,Ordered At,Currency,External Reference",
  ];
  for (const order of ordersById.values()) {
    orderLines.push(
      [
        csvEscape(order.orderId),
        csvEscape(order.orderStatus),
        csvEscape(order.orderedAtIso),
        csvEscape(order.currency),
        csvEscape(order.orderId),
      ].join(","),
    );
  }

  const itemLines = [
    "Line ID,Order ID,Variant ID,Location ID,Quantity,Unit Price,Currency",
  ];
  for (const row of ready) {
    itemLines.push(
      [
        csvEscape(row.lineId),
        csvEscape(row.orderId),
        // Plain SKU matches merchant inventory import variant external IDs.
        csvEscape(row.sku),
        csvEscape(MERCHANT_SALES_CSV_LOCATION_EXTERNAL_ID),
        String(row.quantity),
        csvEscape(row.unitPrice ?? ""),
        csvEscape(row.currency),
      ].join(","),
    );
  }

  return {
    context: input.context,
    orders: {
      source: orderLines.join("\n"),
      config: {
        resourceType: "order",
        adapterVersion: `${MERCHANT_SALES_IMPORT_ADAPTER_VERSION}-order`,
        mappings: [
          { canonicalField: "externalId", sourceColumn: "Order ID" },
          { canonicalField: "status", sourceColumn: "Status" },
          { canonicalField: "orderedAt", sourceColumn: "Ordered At" },
          { canonicalField: "currency", sourceColumn: "Currency" },
          {
            canonicalField: "externalReference",
            sourceColumn: "External Reference",
          },
        ],
      },
    },
    orderItems: {
      source: itemLines.join("\n"),
      config: {
        resourceType: "order_item",
        adapterVersion: `${MERCHANT_SALES_IMPORT_ADAPTER_VERSION}-order-item`,
        mappings: [
          { canonicalField: "externalId", sourceColumn: "Line ID" },
          { canonicalField: "externalParentId", sourceColumn: "Order ID" },
          {
            canonicalField: "variantExternalId",
            sourceColumn: "Variant ID",
          },
          {
            canonicalField: "locationExternalId",
            sourceColumn: "Location ID",
          },
          { canonicalField: "quantity", sourceColumn: "Quantity" },
          {
            canonicalField: "unitPriceAmount",
            sourceColumn: "Unit Price",
          },
          { canonicalField: "currency", sourceColumn: "Currency" },
        ],
      },
    },
  };
}
