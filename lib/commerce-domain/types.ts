/**
 * StoreAgent canonical commerce domain.
 *
 * M0 rule:
 * - Provider-independent.
 * - No Shopify SDK types.
 * - No React / Next.js dependencies.
 * - No AI SDK types.
 * - Unknown commercial data remains null/unknown, never silently zero.
 * - Persisted monetary values are represented as decimal strings,
 *   not JavaScript floating-point numbers.
 */

// -----------------------------------------------------------------------------
// Primitive/value types
// -----------------------------------------------------------------------------

export type UUID = string;

export type ISODate = string;
export type ISODateTime = string;

/**
 * ISO-4217 currency code such as USD, AED, GBP.
 *
 * Runtime validation will be introduced at external boundaries later.
 */
export type CurrencyCode = string;

/**
 * Exact persisted decimal representation.
 *
 * Examples:
 * "10"
 * "10.50"
 * "1250.0000"
 *
 * Do not convert persisted commercial truth to JS number merely for storage.
 */
export type DecimalString = string;

/**
 * Integer inventory quantities.
 *
 * Fractional inventory is intentionally not part of V1.
 */
export type UnitQuantity = number;

export type Percentage = number;

export type JsonPrimitive = string | number | boolean | null;

export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };

// -----------------------------------------------------------------------------
// Shared enums / vocabularies
// -----------------------------------------------------------------------------

export type OrganizationMemberRole =
  | "owner"
  | "admin"
  | "analyst"
  | "operator";

export type StoreStatus = "active" | "inactive" | "archived";

export type LocationStatus = "active" | "inactive" | "archived";

export type ProductStatus = "active" | "draft" | "archived";

export type ProductVariantStatus = "active" | "inactive" | "archived";

export type ProviderType =
  | "csv"
  | "shopify"
  | "woocommerce"
  | "square"
  | "lightspeed"
  | "other";

export type ProviderResourceType =
  | "store"
  | "location"
  | "product"
  | "product_variant"
  | "order"
  | "order_item"
  | "return_refund"
  | "supplier"
  | "purchase_order"
  | "purchase_order_item";

export type OrderStatus =
  | "pending"
  | "open"
  | "completed"
  | "cancelled"
  | "refunded"
  | "partially_refunded"
  | "unknown";

export type PurchaseOrderStatus =
  | "draft"
  | "submitted"
  | "confirmed"
  | "partially_received"
  | "received"
  | "cancelled"
  | "unknown";

export type InventoryActionType =
  | "REORDER"
  | "REDUCE"
  | "PROMOTE"
  | "WATCH";

export type InventoryHealthState =
  | InventoryActionType
  | "HEALTHY";

export type InventoryActionPriority =
  | "critical"
  | "high"
  | "medium"
  | "low";

export type InventoryActionStatus =
  | "new"
  | "accepted"
  | "accepted_with_edit"
  | "dismissed"
  | "completed"
  | "expired"
  | "superseded";

export type ActionEventType =
  | "created"
  | "accepted"
  | "accepted_with_edit"
  | "dismissed"
  | "completed"
  | "expired"
  | "superseded";

export type ConfidenceLevel = "high" | "medium" | "low";

export type DataQualitySeverity =
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "info";

export type DataQualityIssueStatus =
  | "open"
  | "resolved"
  | "ignored"
  | "superseded";

export type IntegrationStatus =
  | "pending"
  | "active"
  | "degraded"
  | "disconnected"
  | "revoked"
  | "error";

export type SyncRunStatus =
  | "queued"
  | "running"
  | "completed"
  | "completed_with_errors"
  | "failed"
  | "cancelled";

export type ForecastRunStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed";

export type ForecastDataSufficiency =
  | "sufficient"
  | "limited"
  | "insufficient";

export type NotificationCadence =
  | "immediate"
  | "daily"
  | "weekly"
  | "disabled";

// -----------------------------------------------------------------------------
// Tenancy
// -----------------------------------------------------------------------------

export interface Organization {
  id: UUID;

  name: string;

  countryCode: string | null;
  defaultCurrency: CurrencyCode;
  timezone: string;

  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface OrganizationMember {
  id: UUID;

  organizationId: UUID;
  userId: UUID;

  role: OrganizationMemberRole;

  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

// -----------------------------------------------------------------------------
// Commerce structure
// -----------------------------------------------------------------------------

export interface Store {
  id: UUID;
  organizationId: UUID;

  name: string;
  status: StoreStatus;

  currency: CurrencyCode;
  timezone: string;

  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Location {
  id: UUID;
  organizationId: UUID;
  storeId: UUID;

  name: string;
  status: LocationStatus;

  code: string | null;

  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Product {
  id: UUID;
  organizationId: UUID;
  storeId: UUID;

  title: string;

  brand: string | null;
  category: string | null;

  status: ProductStatus;

  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface ProductVariant {
  id: UUID;
  organizationId: UUID;
  storeId: UUID;
  productId: UUID;

  sku: string;
  barcode: string | null;
  title: string | null;

  status: ProductVariantStatus;

  costAmount: DecimalString | null;
  sellingPriceAmount: DecimalString | null;
  currency: CurrencyCode | null;

  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

// -----------------------------------------------------------------------------
// Provider bindings
// -----------------------------------------------------------------------------

export interface ProviderBinding {
  id: UUID;
  organizationId: UUID;

  integrationId: UUID;

  provider: ProviderType;
  resourceType: ProviderResourceType;

  canonicalEntityId: UUID;

  externalId: string;
  externalParentId: string | null;

  sourceMetadata: JsonValue | null;

  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

// -----------------------------------------------------------------------------
// Inventory
// -----------------------------------------------------------------------------

export interface InventorySnapshot {
  id: UUID;
  organizationId: UUID;
  storeId: UUID;
  locationId: UUID;
  variantId: UUID;

  observedAt: ISODateTime;

  onHandQuantity: UnitQuantity | null;
  availableQuantity: UnitQuantity | null;
  committedQuantity: UnitQuantity | null;
  incomingQuantity: UnitQuantity | null;

  source: ProviderType;

  createdAt: ISODateTime;
}

// -----------------------------------------------------------------------------
// Orders / demand
// -----------------------------------------------------------------------------

export interface Order {
  id: UUID;
  organizationId: UUID;
  storeId: UUID;

  externalReference: string | null;

  status: OrderStatus;

  orderedAt: ISODateTime;

  currency: CurrencyCode;

  grossAmount: DecimalString | null;
  discountAmount: DecimalString | null;
  netAmount: DecimalString | null;

  source: ProviderType;

  createdAt: ISODateTime;
}

export interface OrderItem {
  id: UUID;
  organizationId: UUID;
  storeId: UUID;

  orderId: UUID;
  variantId: UUID;

  locationId: UUID | null;

  quantity: UnitQuantity;

  unitPriceAmount: DecimalString | null;
  discountAmount: DecimalString | null;
  unitCostAmount: DecimalString | null;

  currency: CurrencyCode | null;

  createdAt: ISODateTime;
}

export interface ReturnRefund {
  id: UUID;
  organizationId: UUID;
  storeId: UUID;

  orderId: UUID;
  orderItemId: UUID | null;
  variantId: UUID;

  locationId: UUID | null;

  returnedQuantity: UnitQuantity | null;
  refundedAmount: DecimalString | null;
  currency: CurrencyCode | null;

  reason: string | null;

  occurredAt: ISODateTime;

  createdAt: ISODateTime;
}

// -----------------------------------------------------------------------------
// Suppliers
// -----------------------------------------------------------------------------

export interface Supplier {
  id: UUID;
  organizationId: UUID;

  name: string;

  defaultLeadTimeDays: number | null;
  currency: CurrencyCode | null;

  email: string | null;
  phone: string | null;

  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface SupplierProduct {
  id: UUID;
  organizationId: UUID;

  supplierId: UUID;
  variantId: UUID;

  supplierSku: string | null;

  unitCostAmount: DecimalString | null;
  currency: CurrencyCode | null;

  leadTimeDays: number | null;

  minimumOrderQuantity: UnitQuantity | null;
  packSize: UnitQuantity | null;

  preferred: boolean;

  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

// -----------------------------------------------------------------------------
// Purchase orders / incoming inventory
// -----------------------------------------------------------------------------

export interface PurchaseOrder {
  id: UUID;
  organizationId: UUID;
  storeId: UUID;

  supplierId: UUID | null;

  externalReference: string | null;

  status: PurchaseOrderStatus;

  orderedAt: ISODateTime | null;
  expectedAt: ISODateTime | null;
  receivedAt: ISODateTime | null;

  currency: CurrencyCode | null;

  source: ProviderType;

  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface PurchaseOrderItem {
  id: UUID;
  organizationId: UUID;
  storeId: UUID;

  purchaseOrderId: UUID;
  variantId: UUID;

  destinationLocationId: UUID | null;

  orderedQuantity: UnitQuantity;
  receivedQuantity: UnitQuantity | null;

  unitCostAmount: DecimalString | null;
  currency: CurrencyCode | null;

  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

// -----------------------------------------------------------------------------
// Derived metrics
// -----------------------------------------------------------------------------

export interface SkuDailyMetric {
  id: UUID;
  organizationId: UUID;
  storeId: UUID;
  locationId: UUID | null;
  variantId: UUID;

  metricDate: ISODate;

  unitsSold: UnitQuantity;
  returnedUnits: UnitQuantity;
  netUnitsSold: number;

  availableQuantity: UnitQuantity | null;
  incomingQuantity: UnitQuantity | null;

  salesVelocity7d: number | null;
  salesVelocity14d: number | null;
  salesVelocity30d: number | null;
  salesVelocity90d: number | null;

  daysOfStock: number | null;
  sellThroughRate: Percentage | null;
  inventoryAgeDays: number | null;

  demandTrend: "rising" | "stable" | "falling" | "unknown";

  algorithmVersion: string;

  createdAt: ISODateTime;
}

// -----------------------------------------------------------------------------
// Forecasting
// -----------------------------------------------------------------------------

export interface ForecastRun {
  id: UUID;
  organizationId: UUID;
  storeId: UUID;

  status: ForecastRunStatus;

  algorithmName: string;
  algorithmVersion: string;

  inputWindowStart: ISODate;
  inputWindowEnd: ISODate;

  horizonDays: number;

  parameters: JsonValue | null;
  evaluationMetadata: JsonValue | null;

  startedAt: ISODateTime;
  completedAt: ISODateTime | null;

  createdAt: ISODateTime;
}

export interface SkuForecast {
  id: UUID;
  organizationId: UUID;
  storeId: UUID;
  locationId: UUID | null;
  variantId: UUID;

  forecastRunId: UUID;

  horizonStart: ISODate;
  horizonEnd: ISODate;

  expectedDemandUnits: number | null;

  lowerDemandUnits: number | null;
  upperDemandUnits: number | null;

  confidence: ConfidenceLevel;
  dataSufficiency: ForecastDataSufficiency;

  qualityMetadata: JsonValue | null;

  createdAt: ISODateTime;
}

// -----------------------------------------------------------------------------
// Inventory actions
// -----------------------------------------------------------------------------

export interface InventoryActionEvidence {
  availableQuantity: UnitQuantity | null;
  incomingQuantity: UnitQuantity | null;

  demandVelocity: number | null;

  daysOfStock: number | null;

  leadTimeDays: number | null;

  safetyStockUnits: number | null;
  reorderPointUnits: number | null;
  targetStockUnits: number | null;

  inventoryAgeDays: number | null;

  forecastExpectedDemandUnits: number | null;

  dataQualityScore: number | null;

  reasonCodes: string[];
}

export interface InventoryAction {
  id: UUID;
  organizationId: UUID;
  storeId: UUID;
  locationId: UUID | null;
  variantId: UUID;

  actionType: InventoryActionType;
  priority: InventoryActionPriority;
  status: InventoryActionStatus;

  recommendedQuantity: UnitQuantity | null;
  recommendedActionDate: ISODate | null;

  confidence: ConfidenceLevel;
  confidenceReasonCodes: string[];

  estimatedStockoutDate: ISODate | null;

  estimatedCashAtRiskAmount: DecimalString | null;
  estimatedRevenueAtRiskAmount: DecimalString | null;
  currency: CurrencyCode | null;

  evidenceSnapshot: InventoryActionEvidence;

  forecastRunId: UUID | null;

  algorithmVersion: string;

  createdAt: ISODateTime;
  expiresAt: ISODateTime | null;

  supersededByActionId: UUID | null;
}

export interface ActionEvent {
  id: UUID;
  organizationId: UUID;
  storeId: UUID;

  inventoryActionId: UUID;
  variantId: UUID;

  eventType: ActionEventType;

  /**
   * Merchant-edited quantity, if this event represents
   * ACCEPTED_WITH_EDIT.
   *
   * Never overwrite InventoryAction.recommendedQuantity.
   */
  editedQuantity: UnitQuantity | null;

  note: string | null;

  actorUserId: UUID | null;

  occurredAt: ISODateTime;
  createdAt: ISODateTime;
}

// -----------------------------------------------------------------------------
// Data quality
// -----------------------------------------------------------------------------

export interface DataQualityIssue {
  id: UUID;
  organizationId: UUID;
  storeId: UUID | null;

  locationId: UUID | null;
  variantId: UUID | null;

  issueCode: string;

  severity: DataQualitySeverity;
  status: DataQualityIssueStatus;

  message: string;
  remediationHint: string | null;

  sourceContext: JsonValue | null;

  detectedAt: ISODateTime;
  resolvedAt: ISODateTime | null;

  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

// -----------------------------------------------------------------------------
// Integrations / synchronization
// -----------------------------------------------------------------------------

export interface Integration {
  id: UUID;
  organizationId: UUID;
  storeId: UUID | null;

  provider: ProviderType;

  status: IntegrationStatus;

  displayName: string | null;

  /**
   * Non-secret provider configuration only.
   *
   * Credentials/tokens belong in secure credential storage.
   */
  configuration: JsonValue | null;

  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface SyncRunCounts {
  discovered: number;
  imported: number;
  updated: number;
  skipped: number;
  quarantined: number;
  failed: number;
}

export interface SyncRun {
  id: UUID;
  organizationId: UUID;
  storeId: UUID | null;

  integrationId: UUID;

  idempotencyKey: string;

  status: SyncRunStatus;

  cursorBefore: string | null;
  cursorAfter: string | null;

  counts: SyncRunCounts;

  errorSummary: JsonValue | null;
  reconciliationMetadata: JsonValue | null;

  startedAt: ISODateTime;
  finishedAt: ISODateTime | null;

  createdAt: ISODateTime;
}

// -----------------------------------------------------------------------------
// Notifications
// -----------------------------------------------------------------------------

export interface NotificationPreference {
  id: UUID;
  organizationId: UUID;
  userId: UUID;

  weeklyBrief: boolean;
  stockoutAlerts: boolean;
  inventoryActionAlerts: boolean;

  cadence: NotificationCadence;

  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

// -----------------------------------------------------------------------------
// Billing / entitlements
// -----------------------------------------------------------------------------

export interface BillingEntitlement {
  id: UUID;
  organizationId: UUID;

  planCode: string;

  maxStores: number;
  maxSkus: number;
  maxLocations: number;

  analysisFrequency: "weekly" | "daily" | "custom";

  features: string[];

  active: boolean;

  validFrom: ISODateTime;
  validUntil: ISODateTime | null;

  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}
