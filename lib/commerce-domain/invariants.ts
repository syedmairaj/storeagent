import type {
  Product,
  ProductVariant,
  SupplierProduct,
  UnitQuantity,
} from "./types";

export function belongsToSameOrganization(
  leftOrganizationId: string,
  rightOrganizationId: string,
): boolean {
  return leftOrganizationId === rightOrganizationId;
}

export function belongsToSameStore(
  leftStoreId: string,
  rightStoreId: string,
): boolean {
  return leftStoreId === rightStoreId;
}

export function isVariantConsistentWithProduct(
  variant: Pick<ProductVariant, "organizationId" | "storeId" | "productId">,
  product: Pick<Product, "id" | "organizationId" | "storeId">,
): boolean {
  return (
    variant.productId === product.id &&
    belongsToSameOrganization(
      variant.organizationId,
      product.organizationId,
    ) &&
    belongsToSameStore(variant.storeId, product.storeId)
  );
}

export function isValidPositiveQuantity(
  quantity: UnitQuantity | null,
): boolean {
  return quantity !== null && Number.isInteger(quantity) && quantity > 0;
}

export function isValidNonNegativeQuantity(
  quantity: UnitQuantity | null,
): boolean {
  return quantity !== null && Number.isInteger(quantity) && quantity >= 0;
}

export function hasValidSupplierConstraints(
  supplierProduct: Pick<
    SupplierProduct,
    "minimumOrderQuantity" | "packSize" | "leadTimeDays"
  >,
): boolean {
  const { minimumOrderQuantity, packSize, leadTimeDays } = supplierProduct;

  const validMoq =
    minimumOrderQuantity === null ||
    isValidPositiveQuantity(minimumOrderQuantity);

  const validPackSize =
    packSize === null || isValidPositiveQuantity(packSize);

  const validLeadTime =
    leadTimeDays === null ||
    (Number.isInteger(leadTimeDays) && leadTimeDays >= 0);

  return validMoq && validPackSize && validLeadTime;
}
