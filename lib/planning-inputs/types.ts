/**
 * Merchant Planning Inputs V1 — organization-default planning assumptions.
 *
 * Reuses InventoryPlanningSettings field names and null≠0 semantics.
 * These are merchant assumptions, not verified supplier/SKU facts.
 * Does not store derived unit thresholds (M5) or unlock commercial actions.
 */

export type MerchantPlanningInputs = {
  leadTimeDays: number | null;
  safetyStockDays: number | null;
  reviewPeriodDays: number | null;
};

export type MerchantPlanningInputsRecord = MerchantPlanningInputs & {
  organizationId: string;
  updatedAt: string | null;
  updatedByUserId: string | null;
};

export const EMPTY_MERCHANT_PLANNING_INPUTS: MerchantPlanningInputs = {
  leadTimeDays: null,
  safetyStockDays: null,
  reviewPeriodDays: null,
};
