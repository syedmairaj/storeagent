import type { CsvImportPlan } from "@/lib/providers/csv/import-assembly";
import type { CsvTrustedImportContext } from "@/lib/providers/csv/trusted-context";

import {
  MERCHANT_CSV_LOCATION_EXTERNAL_ID,
  MERCHANT_INVENTORY_IMPORT_ADAPTER_VERSION,
  type MerchantImportPreviewRow,
} from "@/lib/inventory-import/contract";

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }
  return value;
}

function quantityCell(value: number | null): string {
  return value == null ? "" : String(value);
}

/**
 * Expand merchant-friendly rows into M3 product / variant / inventory lanes.
 * One SKU maps to one product and one variant (1:1) for V1 simplicity.
 */
export function buildMerchantCsvImportPlan(input: {
  context: CsvTrustedImportContext;
  rows: readonly MerchantImportPreviewRow[];
  storeCurrency: string;
  observedAt: string;
}): CsvImportPlan {
  const ready = input.rows.filter((row) => row.status === "ready");

  const productLines = ["Product ID,Title,Status"];
  const variantLines = [
    "Variant ID,Product ID,SKU,Title,Status,Currency,Barcode",
  ];
  const inventoryLines = [
    "Variant ID,Location ID,Observed At,On Hand,Available,Committed,Incoming",
  ];

  for (const row of ready) {
    const productId = row.sku;
    const variantId = row.sku;

    productLines.push(
      [
        csvEscape(productId),
        csvEscape(row.productName),
        "active",
      ].join(","),
    );

    variantLines.push(
      [
        csvEscape(variantId),
        csvEscape(productId),
        csvEscape(row.sku),
        csvEscape(row.productName),
        "active",
        csvEscape(input.storeCurrency),
        csvEscape(row.barcode ?? ""),
      ].join(","),
    );

    inventoryLines.push(
      [
        csvEscape(variantId),
        csvEscape(MERCHANT_CSV_LOCATION_EXTERNAL_ID),
        csvEscape(input.observedAt),
        quantityCell(row.onHandQuantity),
        quantityCell(row.availableQuantity),
        quantityCell(row.committedQuantity),
        quantityCell(row.incomingQuantity),
      ].join(","),
    );
  }

  return {
    context: input.context,
    products: {
      source: productLines.join("\n"),
      config: {
        resourceType: "product",
        adapterVersion: `${MERCHANT_INVENTORY_IMPORT_ADAPTER_VERSION}-product`,
        mappings: [
          { canonicalField: "externalId", sourceColumn: "Product ID" },
          { canonicalField: "title", sourceColumn: "Title" },
          { canonicalField: "status", sourceColumn: "Status" },
        ],
      },
    },
    productVariants: {
      source: variantLines.join("\n"),
      config: {
        resourceType: "product_variant",
        adapterVersion: `${MERCHANT_INVENTORY_IMPORT_ADAPTER_VERSION}-variant`,
        mappings: [
          { canonicalField: "externalId", sourceColumn: "Variant ID" },
          { canonicalField: "externalParentId", sourceColumn: "Product ID" },
          { canonicalField: "sku", sourceColumn: "SKU" },
          { canonicalField: "title", sourceColumn: "Title" },
          { canonicalField: "status", sourceColumn: "Status" },
          { canonicalField: "currency", sourceColumn: "Currency" },
          { canonicalField: "barcode", sourceColumn: "Barcode" },
        ],
      },
    },
    inventorySnapshots: {
      source: inventoryLines.join("\n"),
      config: {
        observationType: "inventory_snapshot",
        adapterVersion: `${MERCHANT_INVENTORY_IMPORT_ADAPTER_VERSION}-inventory`,
        mappings: [
          {
            canonicalField: "variantExternalId",
            sourceColumn: "Variant ID",
          },
          {
            canonicalField: "locationExternalId",
            sourceColumn: "Location ID",
          },
          { canonicalField: "observedAt", sourceColumn: "Observed At" },
          { canonicalField: "onHandQuantity", sourceColumn: "On Hand" },
          { canonicalField: "availableQuantity", sourceColumn: "Available" },
          {
            canonicalField: "committedQuantity",
            sourceColumn: "Committed",
          },
          { canonicalField: "incomingQuantity", sourceColumn: "Incoming" },
        ],
      },
    },
  };
}
