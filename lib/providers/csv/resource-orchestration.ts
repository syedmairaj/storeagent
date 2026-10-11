import type { ProviderResourceType } from "@/lib/commerce-domain/types";

import type { ProviderNormalizationIssue } from "@/lib/providers/types";

import type { CsvTrustedImportContext } from "@/lib/providers/csv/trusted-context";

export type CsvPersistenceDisposition = "imported" | "updated" | "skipped";

export interface CsvPersistedResource {
  canonicalEntityId: string;
  disposition: CsvPersistenceDisposition;
}

export interface CsvBindingLookup {
  organizationId: string;
  integrationId: string;
  provider: "csv";
  resourceType: ProviderResourceType;
  externalId: string;
}

export interface CsvResolvedBinding {
  canonicalEntityId: string;
}

export interface CsvResourcePersistencePort {
  resolveBinding(lookup: CsvBindingLookup): Promise<CsvResolvedBinding | null>;

  persistProduct(input: {
    context: CsvTrustedImportContext;
    externalId: string;
    externalParentId: string | null;
    adapterVersion: string;
    title: string;
    brand: string | null;
    category: string | null;
    status: string;
  }): Promise<CsvPersistedResource>;

  persistProductVariant(input: {
    context: CsvTrustedImportContext;
    externalId: string;
    externalParentId: string | null;
    adapterVersion: string;
    productId: string;
    sku: string;
    barcode: string | null;
    title: string | null;
    status: string;
    costAmount: string | null;
    sellingPriceAmount: string | null;
    currency: string | null;
  }): Promise<CsvPersistedResource>;

  appendInventorySnapshot(input: {
    context: CsvTrustedImportContext;
    variantId: string;
    locationId: string;
    observedAt: string;
    onHandQuantity: number | null;
    availableQuantity: number | null;
    committedQuantity: number | null;
    incomingQuantity: number | null;
  }): Promise<CsvPersistedResource>;

  persistOrder(input: {
    context: CsvTrustedImportContext;
    externalId: string;
    externalParentId: string | null;
    adapterVersion: string;
    externalReference: string | null;
    status: string;
    orderedAt: string;
    currency: string;
    grossAmount: string | null;
    discountAmount: string | null;
    netAmount: string | null;
  }): Promise<CsvPersistedResource>;

  persistOrderItem(input: {
    context: CsvTrustedImportContext;
    externalId: string;
    externalParentId: string | null;
    adapterVersion: string;
    orderId: string;
    variantId: string;
    locationId: string | null;
    quantity: number;
    unitPriceAmount: string | null;
    discountAmount: string | null;
    unitCostAmount: string | null;
    currency: string | null;
  }): Promise<CsvPersistedResource>;

  persistSupplier(input: {
    context: CsvTrustedImportContext;
    externalId: string;
    externalParentId: string | null;
    adapterVersion: string;
    name: string;
    defaultLeadTimeDays: number | null;
    currency: string | null;
    email: string | null;
    phone: string | null;
  }): Promise<CsvPersistedResource>;

  persistSupplierProduct(input: {
    context: CsvTrustedImportContext;
    supplierId: string;
    variantId: string;
    supplierSku: string | null;
    unitCostAmount: string | null;
    currency: string | null;
    leadTimeDays: number | null;
    minimumOrderQuantity: number | null;
    packSize: number | null;
    preferred: boolean;
  }): Promise<CsvPersistedResource>;

  persistPurchaseOrder(input: {
    context: CsvTrustedImportContext;
    externalId: string;
    externalParentId: string | null;
    adapterVersion: string;
    supplierId: string | null;
    externalReference: string | null;
    status: string;
    orderedAt: string | null;
    expectedAt: string | null;
    receivedAt: string | null;
    currency: string | null;
  }): Promise<CsvPersistedResource>;

  persistPurchaseOrderItem(input: {
    context: CsvTrustedImportContext;
    externalId: string;
    externalParentId: string | null;
    adapterVersion: string;
    purchaseOrderId: string;
    variantId: string;
    destinationLocationId: string | null;
    orderedQuantity: number;
    receivedQuantity: number | null;
    unitCostAmount: string | null;
    currency: string | null;
  }): Promise<CsvPersistedResource>;
}

export interface CsvAcceptedRecord<TCanonical> {
  disposition: "accepted";
  provider: "csv";
  resourceType: ProviderResourceType;
  externalId: string;
  externalParentId: string | null;
  adapterVersion: string;
  canonical: TCanonical;
  issues: readonly [];
}

export interface CsvRelationshipFailure {
  disposition: "quarantined";
  reasonCode: "RELATIONSHIP_UNRESOLVED";
  issues: readonly ProviderNormalizationIssue[];
}

export interface CsvOperationalFailure {
  disposition: "failed";
  errorCode: string;
}

export type CsvResourceOrchestrationResult =
  CsvPersistedResource | CsvRelationshipFailure | CsvOperationalFailure;
