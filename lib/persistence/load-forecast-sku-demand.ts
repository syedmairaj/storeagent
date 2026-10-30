import "server-only";

import type { OrderStatus } from "@/lib/commerce-domain/types";

import {
  buildForecastSkuDemandInput,
  type CommerceForecastInventorySnapshot,
  type CommerceForecastOrder,
  type CommerceForecastOrderItem,
  type CommerceForecastReturnRefund,
} from "@/lib/forecasting/commerce-facts";

import type {
  CommerceDayCoverageEvidence,
  CommerceDayPromotionEvidence,
  ForecastCoverageLevel,
  ForecastCoverageStream,
  ForecastEvidenceTrust,
  ForecastPromotionEvidenceState,
} from "@/lib/forecasting/evidence";

import {
  DEFAULT_FORECAST_LOOKBACK_DAYS_V1,
  forecastSkuDemand,
  type ForecastSkuDemandResult,
} from "@/lib/forecasting/orchestrate";

import type { ForecastGrain } from "@/lib/forecasting/series";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import type { TenantContext } from "@/lib/tenancy/types";

/**
 * M6 P2c.2 — gated server-only forecast loader.
 *
 * One RPC: forecast_sku_demand_source_snapshot.
 * Never separate PostgREST table reads. Never trustedCompleteDates.
 * pendingCorrection fence runs before commerce-facts completeness.
 *
 * sourceToken proves included-row identity for the snapshot statement only.
 * It does NOT prove freshness after the RPC returns.
 */

const RPC_NAME = "forecast_sku_demand_source_snapshot";

const FORBIDDEN_INPUT_KEYS = new Set([
  "trustedCompleteDates",
  "organizationId",
  "storeId",
  "sourceToken",
  "timeZone",
  "orders",
  "orderItems",
  "returnRefunds",
  "inventorySnapshots",
  "promotionEvidence",
  "coverageEvidence",
  "pendingCorrections",
  "trust",
  "closureId",
]);

const ORDER_STATUSES = new Set<OrderStatus>([
  "pending",
  "open",
  "completed",
  "cancelled",
  "refunded",
  "partially_refunded",
  "unknown",
]);

const PROMO_STATES = new Set<ForecastPromotionEvidenceState>([
  "none",
  "promotion",
]);

const COVERAGE_LEVELS = new Set<ForecastCoverageLevel>([
  "complete",
  "partial",
]);

const COVERAGE_STREAMS = new Set<ForecastCoverageStream>([
  "orders",
  "returns",
]);

const TRUST_LABELS = new Set<ForecastEvidenceTrust>([
  "trusted_provider",
  "verified_merchant_attestation",
]);

const FRESHNESS_LIMITATION =
  "sourceToken proves the identity of rows included in the snapshot RPC statement only; it does not prove currency after the transaction commits.";

export type ForecastSkuDemandLoaderClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{
    data: unknown;
    error: { code?: string; message: string } | null;
  }>;
};

/**
 * Grain ids come only from trusted TenantContext + server-selected
 * location/variant. Callers must not supply organizationId/storeId.
 */
export interface LoadForecastSkuDemandInput {
  tenant: TenantContext;
  locationId: string;
  variantId: string;
  forecastAsOf: string;
  lookbackDays?: number;
  leadTimeDays?: number | null;
  reviewPeriodDays?: number | null;
}

export interface ForecastSnapshotProvenance {
  rpc: typeof RPC_NAME;
  sourceToken: string;
  timeZone: string;
  forecastAsOf: string;
  lookbackDays: number;
  inputStartDate: string;
  inputEndDate: string;
  pendingCorrectionCount: number;
  pendingCorrectionFenceApplied: true;
  trustedCompleteDatesUsed: false;
  /**
   * Explicit: token is snapshot identity, not post-RPC freshness.
   */
  sourceTokenFreshness: typeof FRESHNESS_LIMITATION;
}

export interface LoadForecastSkuDemandResult {
  grain: ForecastGrain;
  forecast: ForecastSkuDemandResult;
  provenance: ForecastSnapshotProvenance;
}

export class ForecastSkuDemandLoaderDeniedError extends Error {
  readonly code = "FORECAST_SKU_DEMAND_LOADER_DENIED";

  constructor(message: string) {
    super(message);
    this.name = "ForecastSkuDemandLoaderDeniedError";
  }
}

export class ForecastSkuDemandLoaderValidationError extends Error {
  readonly code = "FORECAST_SKU_DEMAND_LOADER_VALIDATION";

  constructor(message: string) {
    super(message);
    this.name = "ForecastSkuDemandLoaderValidationError";
  }
}

export class ForecastSkuDemandLoaderTimeoutError extends Error {
  readonly code = "FORECAST_SKU_DEMAND_LOADER_TIMEOUT";
  readonly sqlstate: string;

  constructor(message: string, sqlstate: string) {
    super(message);
    this.name = "ForecastSkuDemandLoaderTimeoutError";
    this.sqlstate = sqlstate;
  }
}

export class ForecastSkuDemandLoaderUnavailableError extends Error {
  readonly code = "FORECAST_SKU_DEMAND_LOADER_UNAVAILABLE";

  constructor(message: string) {
    super(message);
    this.name = "ForecastSkuDemandLoaderUnavailableError";
  }
}

export class ForecastSkuDemandLoaderError extends Error {
  readonly code = "FORECAST_SKU_DEMAND_LOADER";

  constructor(message: string) {
    super(message);
    this.name = "ForecastSkuDemandLoaderError";
  }
}

interface SnapshotPendingCorrection {
  eventId: number;
  organizationId: string;
  storeId: string;
  stream: ForecastCoverageStream;
  localDate: string;
  locationId: string | null;
  variantId: string | null;
  businessAt: string;
  arrivedAt: string;
  sourceTable: string;
  sourceOp: string;
}

interface SnapshotCoverageRow extends CommerceDayCoverageEvidence {
  pendingCorrection: boolean;
  closureId: string | null;
}

interface ParsedSnapshot {
  timeZone: string;
  forecastAsOf: string;
  lookbackDays: number;
  inputStartDate: string;
  inputEndDate: string;
  sourceToken: string;
  orders: CommerceForecastOrder[];
  orderItems: CommerceForecastOrderItem[];
  returnRefunds: CommerceForecastReturnRefund[];
  inventorySnapshots: CommerceForecastInventorySnapshot[];
  promotionEvidence: CommerceDayPromotionEvidence[];
  coverageEvidence: SnapshotCoverageRow[];
  pendingCorrections: SnapshotPendingCorrection[];
}

export async function loadForecastSkuDemand(
  input: LoadForecastSkuDemandInput,
  client?: ForecastSkuDemandLoaderClient,
): Promise<LoadForecastSkuDemandResult> {
  rejectForbiddenInputKeys(input);
  const grain = resolveGrain(input);
  const lookbackDays = resolveLookback(input.lookbackDays);
  const forecastAsOf = assertForecastDate(
    input.forecastAsOf,
    "forecastAsOf",
  );

  // Resolve the client after input validation so denied/invalid inputs
  // fail closed without requiring env/admin credentials.
  const rpcClient = client ?? createSupabaseAdminClient();

  const raw = await callSnapshotRpc(rpcClient, {
    organizationId: grain.organizationId,
    storeId: grain.storeId,
    locationId: grain.locationId,
    variantId: grain.variantId,
    forecastAsOf,
    lookbackDays,
  });

  const snapshot = parseSnapshotPayload(raw, grain, lookbackDays, forecastAsOf);
  const fencedCoverage = applyPendingCorrectionFence(
    snapshot.coverageEvidence,
    snapshot.pendingCorrections,
  );

  const demandInput = buildForecastSkuDemandInput({
    grain,
    forecastAsOf: snapshot.forecastAsOf,
    timeZone: snapshot.timeZone,
    lookbackDays: snapshot.lookbackDays,
    orders: snapshot.orders,
    orderItems: snapshot.orderItems,
    returnRefunds: snapshot.returnRefunds,
    inventorySnapshots: snapshot.inventorySnapshots,
    promotionEvidence: snapshot.promotionEvidence,
    coverageEvidence: fencedCoverage,
    leadTimeDays:
      input.leadTimeDays === undefined ? null : input.leadTimeDays,
    reviewPeriodDays:
      input.reviewPeriodDays === undefined
        ? null
        : input.reviewPeriodDays,
  });

  const forecast = forecastSkuDemand(demandInput);

  return {
    grain,
    forecast,
    provenance: {
      rpc: RPC_NAME,
      sourceToken: snapshot.sourceToken,
      timeZone: snapshot.timeZone,
      forecastAsOf: snapshot.forecastAsOf,
      lookbackDays: snapshot.lookbackDays,
      inputStartDate: snapshot.inputStartDate,
      inputEndDate: snapshot.inputEndDate,
      pendingCorrectionCount: snapshot.pendingCorrections.length,
      pendingCorrectionFenceApplied: true,
      trustedCompleteDatesUsed: false,
      sourceTokenFreshness: FRESHNESS_LIMITATION,
    },
  };
}

function rejectForbiddenInputKeys(input: object): void {
  for (const key of Object.keys(input)) {
    if (FORBIDDEN_INPUT_KEYS.has(key)) {
      throw new ForecastSkuDemandLoaderDeniedError(
        `loadForecastSkuDemand must not include client-supplied "${key}".`,
      );
    }
  }
}

function resolveGrain(input: LoadForecastSkuDemandInput): ForecastGrain {
  const tenant = input.tenant;

  if (tenant === null || typeof tenant !== "object") {
    throw new ForecastSkuDemandLoaderDeniedError(
      "loadForecastSkuDemand requires a trusted TenantContext.",
    );
  }

  const organizationId = assertIdentity(
    tenant.organizationId,
    "tenant.organizationId",
  );
  const userId = assertIdentity(tenant.userId, "tenant.userId");
  void userId;

  if (tenant.storeId === null || tenant.storeId === undefined) {
    throw new ForecastSkuDemandLoaderDeniedError(
      "loadForecastSkuDemand requires an authorized store on TenantContext.",
    );
  }

  const storeId = assertIdentity(tenant.storeId, "tenant.storeId");
  const locationId = assertIdentity(input.locationId, "locationId");
  const variantId = assertIdentity(input.variantId, "variantId");

  return {
    organizationId,
    storeId,
    locationId,
    variantId,
  };
}

function resolveLookback(value: number | undefined): number {
  const lookback =
    value === undefined ? DEFAULT_FORECAST_LOOKBACK_DAYS_V1 : value;

  if (
    !Number.isInteger(lookback) ||
    lookback < 1 ||
    lookback > 365
  ) {
    throw new ForecastSkuDemandLoaderValidationError(
      "lookbackDays must be an integer from 1 to 365.",
    );
  }

  return lookback;
}

function assertIdentity(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ForecastSkuDemandLoaderDeniedError(`${field} is required.`);
  }

  return value.trim();
}

function assertForecastDate(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ForecastSkuDemandLoaderValidationError(
      `${field} must be a YYYY-MM-DD store-local date.`,
    );
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new ForecastSkuDemandLoaderValidationError(
      `${field} must be a valid calendar date.`,
    );
  }

  return value;
}

async function callSnapshotRpc(
  client: ForecastSkuDemandLoaderClient,
  args: {
    organizationId: string;
    storeId: string;
    locationId: string;
    variantId: string;
    forecastAsOf: string;
    lookbackDays: number;
  },
): Promise<unknown> {
  let result: {
    data: unknown;
    error: { code?: string; message: string } | null;
  };

  try {
    result = await client.rpc(RPC_NAME, {
      p_organization_id: args.organizationId,
      p_store_id: args.storeId,
      p_location_id: args.locationId,
      p_variant_id: args.variantId,
      p_forecast_as_of: args.forecastAsOf,
      p_lookback_days: args.lookbackDays,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw mapRpcFailure(message, undefined);
  }

  if (result.error !== null) {
    throw mapRpcFailure(result.error.message, result.error.code);
  }

  return result.data;
}

function mapRpcFailure(message: string, code: string | undefined): never {
  const normalized = message.toLowerCase();
  const sqlstate = (code ?? "").toUpperCase();

  if (
    sqlstate === "55P03" ||
    sqlstate === "57014" ||
    normalized.includes("lock timeout") ||
    normalized.includes("statement timeout") ||
    normalized.includes("canceling statement due to statement timeout")
  ) {
    throw new ForecastSkuDemandLoaderTimeoutError(
      `forecast snapshot timed out (${sqlstate || "timeout"}).`,
      sqlstate ||
        (normalized.includes("lock") ? "55P03" : "57014"),
    );
  }

  if (
    normalized.includes("could not find the function") ||
    normalized.includes("function public.forecast_sku_demand_source_snapshot") ||
    normalized.includes("does not exist") ||
    normalized.includes("requires correction outbox and fence helpers") ||
    sqlstate === "42883"
  ) {
    throw new ForecastSkuDemandLoaderUnavailableError(
      "forecast snapshot RPC or correction outbox capability is unavailable.",
    );
  }

  if (
    normalized.includes("permission denied") ||
    normalized.includes("not authorized") ||
    sqlstate === "42501"
  ) {
    throw new ForecastSkuDemandLoaderDeniedError(
      "forecast snapshot RPC execution was denied.",
    );
  }

  if (
    normalized.includes("scope error") ||
    normalized.includes("lookbackdays must be an integer") ||
    normalized.includes("requires organization, store, location")
  ) {
    throw new ForecastSkuDemandLoaderValidationError(message);
  }

  throw new ForecastSkuDemandLoaderError(
    `forecast snapshot RPC failed: ${message}`,
  );
}

function parseSnapshotPayload(
  raw: unknown,
  grain: ForecastGrain,
  expectedLookback: number,
  expectedAsOf: string,
): ParsedSnapshot {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ForecastSkuDemandLoaderValidationError(
      "forecast snapshot returned a malformed payload.",
    );
  }

  const payload = raw as Record<string, unknown>;

  if (Object.prototype.hasOwnProperty.call(payload, "trustedCompleteDates")) {
    throw new ForecastSkuDemandLoaderValidationError(
      "forecast snapshot must not include trustedCompleteDates.",
    );
  }

  if (payload.ok === false) {
    throw new ForecastSkuDemandLoaderValidationError(
      `forecast snapshot scope error: ${String(payload.error ?? "unknown")}`,
    );
  }

  if (payload.ok !== true && payload.ok !== undefined) {
    throw new ForecastSkuDemandLoaderValidationError(
      "forecast snapshot ok flag is invalid.",
    );
  }

  const timeZone = assertIdentity(payload.timeZone, "timeZone");
  assertIanaTimeZone(timeZone);

  const forecastAsOf = assertForecastDate(payload.forecastAsOf, "forecastAsOf");
  if (forecastAsOf !== expectedAsOf) {
    throw new ForecastSkuDemandLoaderValidationError(
      "forecast snapshot forecastAsOf does not match requested scope.",
    );
  }

  const lookbackDays = payload.lookbackDays;
  if (
    typeof lookbackDays !== "number" ||
    !Number.isInteger(lookbackDays) ||
    lookbackDays !== expectedLookback
  ) {
    throw new ForecastSkuDemandLoaderValidationError(
      "forecast snapshot lookbackDays does not match requested scope.",
    );
  }

  const inputStartDate = assertForecastDate(
    payload.inputStartDate,
    "inputStartDate",
  );
  const inputEndDate = assertForecastDate(
    payload.inputEndDate,
    "inputEndDate",
  );

  if (inputEndDate !== forecastAsOf) {
    throw new ForecastSkuDemandLoaderValidationError(
      "forecast snapshot inputEndDate must equal forecastAsOf.",
    );
  }

  const sourceToken = assertIdentity(payload.sourceToken, "sourceToken");
  if (!/^[a-f0-9]{32}$/i.test(sourceToken)) {
    throw new ForecastSkuDemandLoaderValidationError(
      "forecast snapshot sourceToken must be an md5 hex digest.",
    );
  }

  const orders = parseOrders(payload.orders, grain);
  const orderItems = parseOrderItems(payload.orderItems, grain);
  const returnRefunds = parseReturnRefunds(payload.returnRefunds, grain);
  const inventorySnapshots = parseInventory(
    payload.inventorySnapshots,
    grain,
  );
  const promotionEvidence = parsePromotionEvidence(
    payload.promotionEvidence,
    grain,
  );
  const coverageEvidence = parseCoverageEvidence(
    payload.coverageEvidence,
    grain,
  );
  const pendingCorrections = parsePendingCorrections(
    payload.pendingCorrections,
    grain,
  );

  return {
    timeZone,
    forecastAsOf,
    lookbackDays,
    inputStartDate,
    inputEndDate,
    sourceToken,
    orders,
    orderItems,
    returnRefunds,
    inventorySnapshots,
    promotionEvidence,
    coverageEvidence,
    pendingCorrections,
  };
}

function assertIanaTimeZone(timeZone: string): void {
  if (
    timeZone !== "UTC" &&
    timeZone !== "Etc/UTC" &&
    !Intl.supportedValuesOf("timeZone").includes(timeZone)
  ) {
    throw new ForecastSkuDemandLoaderValidationError(
      "forecast snapshot timeZone must be a recognized IANA timezone.",
    );
  }
}

function requireArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ForecastSkuDemandLoaderValidationError(
      `forecast snapshot ${field} must be an array.`,
    );
  }

  return value;
}

function requireObject(
  value: unknown,
  field: string,
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ForecastSkuDemandLoaderValidationError(
      `forecast snapshot ${field} entry is malformed.`,
    );
  }

  return value as Record<string, unknown>;
}

function optionalNullableId(
  value: unknown,
  field: string,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return assertIdentity(value, field);
}

function assertInstant(value: unknown, field: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new ForecastSkuDemandLoaderValidationError(
      `${field} must be a valid UTC instant.`,
    );
  }

  return value;
}

function assertOrgStore(
  row: { organizationId: string; storeId: string },
  grain: ForecastGrain,
  label: string,
): void {
  if (
    row.organizationId !== grain.organizationId ||
    row.storeId !== grain.storeId
  ) {
    throw new ForecastSkuDemandLoaderValidationError(
      `${label} foreign organization/store grain is not allowed.`,
    );
  }
}

function parseOrders(
  value: unknown,
  grain: ForecastGrain,
): CommerceForecastOrder[] {
  return requireArray(value, "orders").map((entry, index) => {
    const row = requireObject(entry, `orders[${index}]`);
    const order: CommerceForecastOrder = {
      id: assertIdentity(row.id, `orders[${index}].id`),
      organizationId: assertIdentity(
        row.organizationId,
        `orders[${index}].organizationId`,
      ),
      storeId: assertIdentity(row.storeId, `orders[${index}].storeId`),
      status: parseOrderStatus(row.status, `orders[${index}].status`),
      orderedAt: assertInstant(row.orderedAt, `orders[${index}].orderedAt`),
    };
    assertOrgStore(order, grain, `orders[${index}]`);
    return order;
  });
}

function parseOrderStatus(value: unknown, field: string): OrderStatus {
  if (typeof value !== "string" || !ORDER_STATUSES.has(value as OrderStatus)) {
    throw new ForecastSkuDemandLoaderValidationError(
      `${field} is not a recognized order status.`,
    );
  }

  return value as OrderStatus;
}

function parseOrderItems(
  value: unknown,
  grain: ForecastGrain,
): CommerceForecastOrderItem[] {
  return requireArray(value, "orderItems").map((entry, index) => {
    const row = requireObject(entry, `orderItems[${index}]`);
    const item: CommerceForecastOrderItem = {
      id: assertIdentity(row.id, `orderItems[${index}].id`),
      organizationId: assertIdentity(
        row.organizationId,
        `orderItems[${index}].organizationId`,
      ),
      storeId: assertIdentity(
        row.storeId,
        `orderItems[${index}].storeId`,
      ),
      orderId: assertIdentity(
        row.orderId,
        `orderItems[${index}].orderId`,
      ),
      variantId: assertIdentity(
        row.variantId,
        `orderItems[${index}].variantId`,
      ),
      locationId: optionalNullableId(
        row.locationId,
        `orderItems[${index}].locationId`,
      ),
      quantity: parseNonNegativeNumber(
        row.quantity,
        `orderItems[${index}].quantity`,
      ),
    };
    assertOrgStore(item, grain, `orderItems[${index}]`);
    if (
      item.variantId !== grain.variantId ||
      item.locationId !== grain.locationId
    ) {
      throw new ForecastSkuDemandLoaderValidationError(
        `orderItems[${index}] foreign location/variant grain is not allowed.`,
      );
    }
    return item;
  });
}

function parseReturnRefunds(
  value: unknown,
  grain: ForecastGrain,
): CommerceForecastReturnRefund[] {
  return requireArray(value, "returnRefunds").map((entry, index) => {
    const row = requireObject(entry, `returnRefunds[${index}]`);
    const refund: CommerceForecastReturnRefund = {
      id: assertIdentity(row.id, `returnRefunds[${index}].id`),
      organizationId: assertIdentity(
        row.organizationId,
        `returnRefunds[${index}].organizationId`,
      ),
      storeId: assertIdentity(
        row.storeId,
        `returnRefunds[${index}].storeId`,
      ),
      variantId: assertIdentity(
        row.variantId,
        `returnRefunds[${index}].variantId`,
      ),
      locationId: optionalNullableId(
        row.locationId,
        `returnRefunds[${index}].locationId`,
      ),
      returnedQuantity:
        row.returnedQuantity === null || row.returnedQuantity === undefined
          ? null
          : parseNonNegativeNumber(
              row.returnedQuantity,
              `returnRefunds[${index}].returnedQuantity`,
            ),
      occurredAt: assertInstant(
        row.occurredAt,
        `returnRefunds[${index}].occurredAt`,
      ),
    };
    assertOrgStore(refund, grain, `returnRefunds[${index}]`);
    if (
      refund.variantId !== grain.variantId ||
      refund.locationId !== grain.locationId
    ) {
      throw new ForecastSkuDemandLoaderValidationError(
        `returnRefunds[${index}] foreign location/variant grain is not allowed.`,
      );
    }
    return refund;
  });
}

function parseInventory(
  value: unknown,
  grain: ForecastGrain,
): CommerceForecastInventorySnapshot[] {
  return requireArray(value, "inventorySnapshots").map((entry, index) => {
    const row = requireObject(entry, `inventorySnapshots[${index}]`);
    const snapshot: CommerceForecastInventorySnapshot = {
      id: assertIdentity(row.id, `inventorySnapshots[${index}].id`),
      organizationId: assertIdentity(
        row.organizationId,
        `inventorySnapshots[${index}].organizationId`,
      ),
      storeId: assertIdentity(
        row.storeId,
        `inventorySnapshots[${index}].storeId`,
      ),
      locationId: assertIdentity(
        row.locationId,
        `inventorySnapshots[${index}].locationId`,
      ),
      variantId: assertIdentity(
        row.variantId,
        `inventorySnapshots[${index}].variantId`,
      ),
      observedAt: assertInstant(
        row.observedAt,
        `inventorySnapshots[${index}].observedAt`,
      ),
      availableQuantity:
        row.availableQuantity === null ||
        row.availableQuantity === undefined
          ? null
          : parseNonNegativeNumber(
              row.availableQuantity,
              `inventorySnapshots[${index}].availableQuantity`,
            ),
    };
    assertOrgStore(snapshot, grain, `inventorySnapshots[${index}]`);
    if (
      snapshot.variantId !== grain.variantId ||
      snapshot.locationId !== grain.locationId
    ) {
      throw new ForecastSkuDemandLoaderValidationError(
        `inventorySnapshots[${index}] foreign location/variant grain is not allowed.`,
      );
    }
    return snapshot;
  });
}

function parsePromotionEvidence(
  value: unknown,
  grain: ForecastGrain,
): CommerceDayPromotionEvidence[] {
  return requireArray(value, "promotionEvidence").map((entry, index) => {
    const row = requireObject(entry, `promotionEvidence[${index}]`);
    const evidence: CommerceDayPromotionEvidence = {
      evidenceId: assertIdentity(
        row.evidenceId,
        `promotionEvidence[${index}].evidenceId`,
      ),
      organizationId: assertIdentity(
        row.organizationId,
        `promotionEvidence[${index}].organizationId`,
      ),
      storeId: assertIdentity(
        row.storeId,
        `promotionEvidence[${index}].storeId`,
      ),
      locationId: optionalNullableId(
        row.locationId,
        `promotionEvidence[${index}].locationId`,
      ),
      variantId: optionalNullableId(
        row.variantId,
        `promotionEvidence[${index}].variantId`,
      ),
      localDate: assertForecastDate(
        row.localDate,
        `promotionEvidence[${index}].localDate`,
      ),
      state: parsePromoState(row.state, `promotionEvidence[${index}].state`),
      trust: parseTrust(row.trust, `promotionEvidence[${index}].trust`),
      source: assertIdentity(
        row.source,
        `promotionEvidence[${index}].source`,
      ),
      observedAt: assertInstant(
        row.observedAt,
        `promotionEvidence[${index}].observedAt`,
      ),
      version: parsePositiveInt(
        row.version,
        `promotionEvidence[${index}].version`,
      ),
      invalidatedAt:
        row.invalidatedAt === null || row.invalidatedAt === undefined
          ? null
          : assertInstant(
              row.invalidatedAt,
              `promotionEvidence[${index}].invalidatedAt`,
            ),
      supersedesEvidenceId: optionalNullableId(
        row.supersedesEvidenceId,
        `promotionEvidence[${index}].supersedesEvidenceId`,
      ),
    };
    assertOrgStore(evidence, grain, `promotionEvidence[${index}]`);
    assertEvidenceScope(
      evidence.locationId,
      evidence.variantId,
      grain,
      `promotionEvidence[${index}]`,
    );
    return evidence;
  });
}

function parseCoverageEvidence(
  value: unknown,
  grain: ForecastGrain,
): SnapshotCoverageRow[] {
  return requireArray(value, "coverageEvidence").map((entry, index) => {
    const row = requireObject(entry, `coverageEvidence[${index}]`);
    const evidence: SnapshotCoverageRow = {
      evidenceId: assertIdentity(
        row.evidenceId,
        `coverageEvidence[${index}].evidenceId`,
      ),
      organizationId: assertIdentity(
        row.organizationId,
        `coverageEvidence[${index}].organizationId`,
      ),
      storeId: assertIdentity(
        row.storeId,
        `coverageEvidence[${index}].storeId`,
      ),
      locationId: optionalNullableId(
        row.locationId,
        `coverageEvidence[${index}].locationId`,
      ),
      variantId: optionalNullableId(
        row.variantId,
        `coverageEvidence[${index}].variantId`,
      ),
      localDate: assertForecastDate(
        row.localDate,
        `coverageEvidence[${index}].localDate`,
      ),
      stream: parseStream(row.stream, `coverageEvidence[${index}].stream`),
      coverage: parseCoverageLevel(
        row.coverage,
        `coverageEvidence[${index}].coverage`,
      ),
      trust: parseTrust(row.trust, `coverageEvidence[${index}].trust`),
      source: assertIdentity(
        row.source,
        `coverageEvidence[${index}].source`,
      ),
      asOf: assertInstant(row.asOf, `coverageEvidence[${index}].asOf`),
      observedAt: assertInstant(
        row.observedAt,
        `coverageEvidence[${index}].observedAt`,
      ),
      version: parsePositiveInt(
        row.version,
        `coverageEvidence[${index}].version`,
      ),
      invalidatedAt:
        row.invalidatedAt === null || row.invalidatedAt === undefined
          ? null
          : assertInstant(
              row.invalidatedAt,
              `coverageEvidence[${index}].invalidatedAt`,
            ),
      supersedesEvidenceId: optionalNullableId(
        row.supersedesEvidenceId,
        `coverageEvidence[${index}].supersedesEvidenceId`,
      ),
      closureId: optionalNullableId(
        row.closureId,
        `coverageEvidence[${index}].closureId`,
      ),
      pendingCorrection: parseBoolean(
        row.pendingCorrection,
        `coverageEvidence[${index}].pendingCorrection`,
      ),
    };
    assertOrgStore(evidence, grain, `coverageEvidence[${index}]`);
    assertEvidenceScope(
      evidence.locationId,
      evidence.variantId,
      grain,
      `coverageEvidence[${index}]`,
    );
    return evidence;
  });
}

function parsePendingCorrections(
  value: unknown,
  grain: ForecastGrain,
): SnapshotPendingCorrection[] {
  return requireArray(value, "pendingCorrections").map((entry, index) => {
    const row = requireObject(entry, `pendingCorrections[${index}]`);
    const eventId = row.eventId;
    if (
      typeof eventId !== "number" ||
      !Number.isInteger(eventId) ||
      eventId < 1
    ) {
      throw new ForecastSkuDemandLoaderValidationError(
        `pendingCorrections[${index}].eventId must be a positive integer.`,
      );
    }

    const pending: SnapshotPendingCorrection = {
      eventId,
      organizationId: assertIdentity(
        row.organizationId,
        `pendingCorrections[${index}].organizationId`,
      ),
      storeId: assertIdentity(
        row.storeId,
        `pendingCorrections[${index}].storeId`,
      ),
      stream: parseStream(
        row.stream,
        `pendingCorrections[${index}].stream`,
      ),
      localDate: assertForecastDate(
        row.localDate,
        `pendingCorrections[${index}].localDate`,
      ),
      locationId: optionalNullableId(
        row.locationId,
        `pendingCorrections[${index}].locationId`,
      ),
      variantId: optionalNullableId(
        row.variantId,
        `pendingCorrections[${index}].variantId`,
      ),
      businessAt: assertInstant(
        row.businessAt,
        `pendingCorrections[${index}].businessAt`,
      ),
      arrivedAt: assertInstant(
        row.arrivedAt,
        `pendingCorrections[${index}].arrivedAt`,
      ),
      sourceTable: assertIdentity(
        row.sourceTable,
        `pendingCorrections[${index}].sourceTable`,
      ),
      sourceOp: assertIdentity(
        row.sourceOp,
        `pendingCorrections[${index}].sourceOp`,
      ),
    };
    assertOrgStore(pending, grain, `pendingCorrections[${index}]`);
    return pending;
  });
}

function assertEvidenceScope(
  locationId: string | null,
  variantId: string | null,
  grain: ForecastGrain,
  label: string,
): void {
  if (locationId !== null && locationId !== grain.locationId) {
    throw new ForecastSkuDemandLoaderValidationError(
      `${label} foreign location scope is not allowed.`,
    );
  }

  if (variantId !== null && variantId !== grain.variantId) {
    throw new ForecastSkuDemandLoaderValidationError(
      `${label} foreign variant scope is not allowed.`,
    );
  }
}

function parsePromoState(
  value: unknown,
  field: string,
): ForecastPromotionEvidenceState {
  if (
    typeof value !== "string" ||
    !PROMO_STATES.has(value as ForecastPromotionEvidenceState)
  ) {
    throw new ForecastSkuDemandLoaderValidationError(
      `${field} is not a recognized promotion state.`,
    );
  }

  return value as ForecastPromotionEvidenceState;
}

function parseCoverageLevel(
  value: unknown,
  field: string,
): ForecastCoverageLevel {
  if (
    typeof value !== "string" ||
    !COVERAGE_LEVELS.has(value as ForecastCoverageLevel)
  ) {
    throw new ForecastSkuDemandLoaderValidationError(
      `${field} is not a recognized coverage level.`,
    );
  }

  return value as ForecastCoverageLevel;
}

function parseStream(
  value: unknown,
  field: string,
): ForecastCoverageStream {
  if (
    typeof value !== "string" ||
    !COVERAGE_STREAMS.has(value as ForecastCoverageStream)
  ) {
    throw new ForecastSkuDemandLoaderValidationError(
      `${field} is not a recognized coverage stream.`,
    );
  }

  return value as ForecastCoverageStream;
}

function parseTrust(
  value: unknown,
  field: string,
): ForecastEvidenceTrust {
  if (
    typeof value !== "string" ||
    !TRUST_LABELS.has(value as ForecastEvidenceTrust)
  ) {
    throw new ForecastSkuDemandLoaderValidationError(
      `${field} is not a recognized evidence trust label.`,
    );
  }

  return value as ForecastEvidenceTrust;
}

function parseBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new ForecastSkuDemandLoaderValidationError(
      `${field} must be a boolean.`,
    );
  }

  return value;
}

function parsePositiveInt(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new ForecastSkuDemandLoaderValidationError(
      `${field} must be an integer >= 1.`,
    );
  }

  return value;
}

function parseNonNegativeNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new ForecastSkuDemandLoaderValidationError(
      `${field} must be a finite number >= 0.`,
    );
  }

  return value;
}

/**
 * Fail closed: any pending orders/returns correction for a day/stream
 * (stamp or pendingCorrections list) coerces coverage to partial so
 * resolveDayDataComplete cannot treat the day as complete.
 */
function applyPendingCorrectionFence(
  coverage: readonly SnapshotCoverageRow[],
  pending: readonly SnapshotPendingCorrection[],
): CommerceDayCoverageEvidence[] {
  const pendingKeys = new Set<string>();

  for (const event of pending) {
    if (event.stream === "orders" || event.stream === "returns") {
      pendingKeys.add(`${event.localDate}|${event.stream}`);
    }
  }

  return coverage.map((row) => {
    const key = `${row.localDate}|${row.stream}`;
    const fenced =
      row.pendingCorrection === true || pendingKeys.has(key);

    const rest: CommerceDayCoverageEvidence = {
      evidenceId: row.evidenceId,
      organizationId: row.organizationId,
      storeId: row.storeId,
      locationId: row.locationId,
      variantId: row.variantId,
      localDate: row.localDate,
      stream: row.stream,
      coverage: row.coverage,
      trust: row.trust,
      source: row.source,
      asOf: row.asOf,
      observedAt: row.observedAt,
      version: row.version,
      invalidatedAt: row.invalidatedAt,
      supersedesEvidenceId: row.supersedesEvidenceId,
    };

    if (!fenced) {
      return rest;
    }

    return {
      ...rest,
      coverage: "partial",
    };
  });
}
