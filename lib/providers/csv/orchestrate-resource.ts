import type {
  ProviderNormalizationIssue,
} from "@/lib/providers/types";

import {
  classifyCsvOperationalFailure,
} from "./partial-failure";

import {
  CsvRelationshipUnresolvedError,
  resolveCsvBinding,
  resolveOptionalCsvBinding,
} from "./relationship-resolution";

import type {
  CsvAcceptedRecord,
  CsvResourceOrchestrationResult,
  CsvResourcePersistencePort,
} from "./resource-orchestration";

import {
  requireCsvStoreScopedContext,
} from "./trusted-context";

import type {
  CsvTrustedImportContext,
} from "./trusted-context";

function relationshipIssue(
  message: string,
): ProviderNormalizationIssue {
  return {
    code:
      "RELATIONSHIP_UNRESOLVED",
    message,
    field:
      null,
  };
}

function relationshipFailure(
  error:
    CsvRelationshipUnresolvedError,
): CsvResourceOrchestrationResult {
  return {
    disposition:
      "quarantined",
    reasonCode:
      "RELATIONSHIP_UNRESOLVED",
    issues: [
      relationshipIssue(
        error.message,
      ),
    ],
  };
}

function operationalFailure(
  error: unknown,
): CsvResourceOrchestrationResult {
  const classified =
    classifyCsvOperationalFailure({
      errorCode:
        error instanceof Error
          ? error.name ||
            "CSV_PERSISTENCE_ERROR"
          : "CSV_PERSISTENCE_ERROR",
    });

  if (
    classified.disposition !==
    "failed"
  ) {
    throw new Error(
      "Unexpected CSV operational classification.",
    );
  }

  return classified;
}

async function safely(
  work:
    () =>
      Promise<CsvResourceOrchestrationResult>,
): Promise<CsvResourceOrchestrationResult> {
  try {
    return await work();
  } catch (error) {
    if (
      error instanceof
      CsvRelationshipUnresolvedError
    ) {
      return relationshipFailure(
        error,
      );
    }

    return operationalFailure(
      error,
    );
  }
}

export async function orchestrateCsvProduct(
  context:
    CsvTrustedImportContext,
  record:
    CsvAcceptedRecord<{
      title: string;
      brand: string | null;
      category: string | null;
      status: string;
    }>,
  persistence:
    CsvResourcePersistencePort,
): Promise<CsvResourceOrchestrationResult> {
  return safely(async () => {
    requireCsvStoreScopedContext(
      context,
    );

    return persistence.persistProduct({
      context,
      externalId:
        record.externalId,
      externalParentId:
        record.externalParentId,
      adapterVersion:
        record.adapterVersion,
      ...record.canonical,
    });
  });
}

export async function orchestrateCsvProductVariant(
  context:
    CsvTrustedImportContext,
  record:
    CsvAcceptedRecord<{
      sku: string;
      barcode: string | null;
      title: string | null;
      status: string;
      costAmount: string | null;
      sellingPriceAmount: string | null;
      currency: string | null;
    }>,
  persistence:
    CsvResourcePersistencePort,
): Promise<CsvResourceOrchestrationResult> {
  return safely(async () => {
    requireCsvStoreScopedContext(
      context,
    );

    if (
      record.externalParentId ===
      null
    ) {
      throw new CsvRelationshipUnresolvedError(
        "CSV product variant requires its parent product external identity.",
      );
    }

    const productId =
      await resolveCsvBinding(
        persistence,
        context,
        "product",
        record.externalParentId,
      );

    return persistence.persistProductVariant({
      context,
      externalId:
        record.externalId,
      externalParentId:
        record.externalParentId,
      adapterVersion:
        record.adapterVersion,
      productId,
      ...record.canonical,
    });
  });
}

export async function orchestrateCsvInventorySnapshot(
  context:
    CsvTrustedImportContext,
  record: {
    disposition: "accepted";
    provider: "csv";
    observationType:
      "inventory_snapshot";
    adapterVersion: string;
    variantExternalId: string;
    locationExternalId: string;
    canonical: {
      variantExternalId: string;
      locationExternalId: string;
      observedAt: string;
      onHandQuantity: number | null;
      availableQuantity: number | null;
      committedQuantity: number | null;
      incomingQuantity: number | null;
    };
    issues: readonly [];
  },
  persistence:
    CsvResourcePersistencePort,
): Promise<CsvResourceOrchestrationResult> {
  return safely(async () => {
    requireCsvStoreScopedContext(
      context,
    );

    const variantId =
      await resolveCsvBinding(
        persistence,
        context,
        "product_variant",
        record.variantExternalId,
      );

    const locationId =
      await resolveCsvBinding(
        persistence,
        context,
        "location",
        record.locationExternalId,
      );

    return persistence.appendInventorySnapshot({
      context,
      variantId,
      locationId,
      observedAt:
        record.canonical.observedAt,
      onHandQuantity:
        record.canonical.onHandQuantity,
      availableQuantity:
        record.canonical.availableQuantity,
      committedQuantity:
        record.canonical.committedQuantity,
      incomingQuantity:
        record.canonical.incomingQuantity,
    });
  });
}

export async function orchestrateCsvOrder(
  context:
    CsvTrustedImportContext,
  record:
    CsvAcceptedRecord<{
      externalReference: string | null;
      status: string;
      orderedAt: string;
      currency: string;
      grossAmount: string | null;
      discountAmount: string | null;
      netAmount: string | null;
    }>,
  persistence:
    CsvResourcePersistencePort,
): Promise<CsvResourceOrchestrationResult> {
  return safely(async () => {
    requireCsvStoreScopedContext(
      context,
    );

    return persistence.persistOrder({
      context,
      externalId:
        record.externalId,
      externalParentId:
        record.externalParentId,
      adapterVersion:
        record.adapterVersion,
      ...record.canonical,
    });
  });
}

export async function orchestrateCsvOrderItem(
  context:
    CsvTrustedImportContext,
  record:
    CsvAcceptedRecord<{
      orderExternalId: string;
      variantExternalId: string;
      locationExternalId: string | null;
      quantity: number;
      unitPriceAmount: string | null;
      discountAmount: string | null;
      unitCostAmount: string | null;
      currency: string | null;
    }>,
  persistence:
    CsvResourcePersistencePort,
): Promise<CsvResourceOrchestrationResult> {
  return safely(async () => {
    requireCsvStoreScopedContext(
      context,
    );

    const orderId =
      await resolveCsvBinding(
        persistence,
        context,
        "order",
        record.canonical.orderExternalId,
      );

    const variantId =
      await resolveCsvBinding(
        persistence,
        context,
        "product_variant",
        record.canonical.variantExternalId,
      );

    const locationId =
      await resolveOptionalCsvBinding(
        persistence,
        context,
        "location",
        record.canonical.locationExternalId,
      );

    return persistence.persistOrderItem({
      context,
      externalId:
        record.externalId,
      externalParentId:
        record.externalParentId,
      adapterVersion:
        record.adapterVersion,
      orderId,
      variantId,
      locationId,
      quantity:
        record.canonical.quantity,
      unitPriceAmount:
        record.canonical.unitPriceAmount,
      discountAmount:
        record.canonical.discountAmount,
      unitCostAmount:
        record.canonical.unitCostAmount,
      currency:
        record.canonical.currency,
    });
  });
}

export async function orchestrateCsvSupplier(
  context:
    CsvTrustedImportContext,
  record:
    CsvAcceptedRecord<{
      name: string;
      defaultLeadTimeDays: number | null;
      currency: string | null;
      email: string | null;
      phone: string | null;
    }>,
  persistence:
    CsvResourcePersistencePort,
): Promise<CsvResourceOrchestrationResult> {
  return safely(async () => {
    return persistence.persistSupplier({
      context,
      externalId:
        record.externalId,
      externalParentId:
        record.externalParentId,
      adapterVersion:
        record.adapterVersion,
      ...record.canonical,
    });
  });
}

export async function orchestrateCsvSupplierProduct(
  context:
    CsvTrustedImportContext,
  record: {
    disposition: "accepted";
    provider: "csv";
    relationshipType:
      "supplier_product";
    adapterVersion: string;
    supplierExternalId: string;
    variantExternalId: string;
    canonical: {
      supplierExternalId: string;
      variantExternalId: string;
      supplierSku: string | null;
      unitCostAmount: string | null;
      currency: string | null;
      leadTimeDays: number | null;
      minimumOrderQuantity: number | null;
      packSize: number | null;
      preferred: boolean;
    };
    issues: readonly [];
  },
  persistence:
    CsvResourcePersistencePort,
): Promise<CsvResourceOrchestrationResult> {
  return safely(async () => {
    const supplierId =
      await resolveCsvBinding(
        persistence,
        context,
        "supplier",
        record.supplierExternalId,
      );

    const variantId =
      await resolveCsvBinding(
        persistence,
        context,
        "product_variant",
        record.variantExternalId,
      );

    return persistence.persistSupplierProduct({
      context,
      supplierId,
      variantId,
      supplierSku:
        record.canonical.supplierSku,
      unitCostAmount:
        record.canonical.unitCostAmount,
      currency:
        record.canonical.currency,
      leadTimeDays:
        record.canonical.leadTimeDays,
      minimumOrderQuantity:
        record.canonical.minimumOrderQuantity,
      packSize:
        record.canonical.packSize,
      preferred:
        record.canonical.preferred,
    });
  });
}

export async function orchestrateCsvPurchaseOrder(
  context:
    CsvTrustedImportContext,
  record:
    CsvAcceptedRecord<{
      supplierExternalId: string | null;
      externalReference: string | null;
      status: string;
      orderedAt: string | null;
      expectedAt: string | null;
      receivedAt: string | null;
      currency: string | null;
    }>,
  persistence:
    CsvResourcePersistencePort,
): Promise<CsvResourceOrchestrationResult> {
  return safely(async () => {
    requireCsvStoreScopedContext(
      context,
    );

    const supplierId =
      await resolveOptionalCsvBinding(
        persistence,
        context,
        "supplier",
        record.canonical.supplierExternalId,
      );

    return persistence.persistPurchaseOrder({
      context,
      externalId:
        record.externalId,
      externalParentId:
        record.externalParentId,
      adapterVersion:
        record.adapterVersion,
      supplierId,
      externalReference:
        record.canonical.externalReference,
      status:
        record.canonical.status,
      orderedAt:
        record.canonical.orderedAt,
      expectedAt:
        record.canonical.expectedAt,
      receivedAt:
        record.canonical.receivedAt,
      currency:
        record.canonical.currency,
    });
  });
}

export async function orchestrateCsvPurchaseOrderItem(
  context:
    CsvTrustedImportContext,
  record:
    CsvAcceptedRecord<{
      purchaseOrderExternalId: string;
      variantExternalId: string;
      destinationLocationExternalId:
        string | null;
      orderedQuantity: number;
      receivedQuantity: number | null;
      unitCostAmount: string | null;
      currency: string | null;
    }>,
  persistence:
    CsvResourcePersistencePort,
): Promise<CsvResourceOrchestrationResult> {
  return safely(async () => {
    requireCsvStoreScopedContext(
      context,
    );

    const purchaseOrderId =
      await resolveCsvBinding(
        persistence,
        context,
        "purchase_order",
        record.canonical.purchaseOrderExternalId,
      );

    const variantId =
      await resolveCsvBinding(
        persistence,
        context,
        "product_variant",
        record.canonical.variantExternalId,
      );

    const destinationLocationId =
      await resolveOptionalCsvBinding(
        persistence,
        context,
        "location",
        record.canonical.destinationLocationExternalId,
      );

    return persistence.persistPurchaseOrderItem({
      context,
      externalId:
        record.externalId,
      externalParentId:
        record.externalParentId,
      adapterVersion:
        record.adapterVersion,
      purchaseOrderId,
      variantId,
      destinationLocationId,
      orderedQuantity:
        record.canonical.orderedQuantity,
      receivedQuantity:
        record.canonical.receivedQuantity,
      unitCostAmount:
        record.canonical.unitCostAmount,
      currency:
        record.canonical.currency,
    });
  });
}
