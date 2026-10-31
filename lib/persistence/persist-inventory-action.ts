import "server-only";

import { createHash } from "node:crypto";

import type {
  ConfidenceLevel,
  InventoryActionEvidence,
  InventoryActionPriority,
  InventoryActionType,
  UnitQuantity,
} from "@/lib/commerce-domain/types";

import {
  DECISION_ALGORITHM_VERSIONS_V1,
} from "@/lib/decision-engine/reproducibility";

import type {
  DecisionAlgorithmVersions,
} from "@/lib/decision-engine/types";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import type { TenantContext } from "@/lib/tenancy/types";

/**
 * M7.2c — server-only dormant inventory-action persistence adapter.
 *
 * Contract: docs/M7_2A_IMMUTABLE_DECISION_PERSISTENCE_CONTRACT.md
 * RPC: public.persist_inventory_action_recommendation
 *
 * Dormant harness-only operation. No production source-of-create.
 * One RPC call. No direct inventory_actions DML.
 * Never imports or consumes M7.1 fixture evaluation outputs.
 * Hash authority mirrors SQL inventory_action_derive_hashes (SHA-256).
 */

const RPC_NAME = "persist_inventory_action_recommendation";

export const M7_PERSISTENCE_CONTRACT_HARNESS_SOURCE_CLASS_V1 =
  "m7_persistence_contract_harness_v1" as const;

export const INVENTORY_DECISION_ALGORITHM_VERSION_V1 =
  "inventory-decision-v1" as const;

const FORBIDDEN_INPUT_KEYS = new Set([
  "organizationId",
  "storeId",
  "decisionBodyHash",
  "evidenceProvenanceFingerprint",
  "inventoryActionId",
  "fixtureAttestation",
  "evidenceScope",
  "forecastRunId",
  "forecastEligibility",
  "forecastExpectedDemandUnits",
  "claimsMerchantFacing",
  "claimsProductionForecastApproval",
  "claimsM7ProductionEligibility",
  "algorithmApproved",
  "isScoredMerchantDecision",
  "trustedCompleteDates",
  "m7Eligible",
  "published",
]);

const ACTION_TYPES = new Set<InventoryActionType>([
  "REORDER",
  "REDUCE",
  "PROMOTE",
  "WATCH",
]);

const PRIORITIES = new Set<InventoryActionPriority>([
  "critical",
  "high",
  "medium",
  "low",
]);

const CONFIDENCES = new Set<ConfidenceLevel>([
  "high",
  "medium",
  "low",
]);

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SHA256_RE = /^[a-f0-9]{64}$/;

export type InventoryActionPersistDisposition = "created" | "replayed";

export type InventoryActionPersistClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{
    data: unknown;
    error: { code?: string; message: string } | null;
  }>;
};

export interface InventoryActionGrain {
  organizationId: string;
  storeId: string;
  locationId: string;
  variantId: string;
}

/**
 * Dormant harness persist request. Grain comes only from trusted
 * TenantContext + explicit non-null location/variant.
 */
export interface PersistInventoryActionRecommendationInput {
  tenant: TenantContext;
  locationId: string;
  variantId: string;

  decisionAsOfDate: string;
  pinnedTimeZone: string;

  actionType: InventoryActionType;
  compatibleSecondaryActionTypes?: readonly InventoryActionType[];
  priority: InventoryActionPriority;
  recommendedQuantity: UnitQuantity | null;
  recommendedActionDate?: string | null;
  confidence: ConfidenceLevel;

  evidenceSnapshot: InventoryActionEvidence;
  incomingStateKnown: boolean;

  /**
   * Must be m7_persistence_contract_harness_v1.
   * Reserved / fixture classes are rejected.
   */
  evidenceSourceClass: typeof M7_PERSISTENCE_CONTRACT_HARNESS_SOURCE_CLASS_V1;

  metricDate: string;
  metricAlgorithmVersion: string;
  metricSourceWatermark: string;

  algorithmVersion?: typeof INVENTORY_DECISION_ALGORITHM_VERSION_V1;
  configurationVersion: string;
  algorithmVersions?: DecisionAlgorithmVersions;
  decisionReproducibilityFingerprint: string;
}

export interface InventoryActionPersistPayload {
  organizationId: string;
  storeId: string;
  locationId: string;
  variantId: string;
  decisionAsOfDate: string;
  pinnedTimeZone: string;
  actionType: InventoryActionType;
  compatibleSecondaryActionTypes: InventoryActionType[];
  priority: InventoryActionPriority;
  status: "new";
  recommendedQuantity: number | null;
  recommendedActionDate: string | null;
  confidence: ConfidenceLevel;
  evidenceSnapshot: InventoryActionEvidence;
  incomingStateKnown: boolean;
  evidenceSourceClass: typeof M7_PERSISTENCE_CONTRACT_HARNESS_SOURCE_CLASS_V1;
  metricDate: string;
  metricAlgorithmVersion: string;
  metricSourceWatermark: string;
  forecastRunId: null;
  algorithmVersion: typeof INVENTORY_DECISION_ALGORITHM_VERSION_V1;
  configurationVersion: string;
  algorithmVersions: DecisionAlgorithmVersions;
  decisionReproducibilityFingerprint: string;
  evidenceProvenanceFingerprint: string;
  decisionBodyHash: string;
  claimsMerchantFacing: false;
  claimsProductionForecastApproval: false;
  claimsM7ProductionEligibility: false;
  algorithmApproved: false;
  isScoredMerchantDecision: false;
}

export interface PersistInventoryActionRecommendationResult {
  disposition: InventoryActionPersistDisposition;
  inventoryActionId: string;
  decisionBodyHash: string;
  evidenceProvenanceFingerprint: string;
  claimsMerchantFacing: false;
  claimsProductionForecastApproval: false;
  claimsM7ProductionEligibility: false;
  algorithmApproved: false;
  isScoredMerchantDecision: false;
  grain: InventoryActionGrain;
  payload: InventoryActionPersistPayload;
}

export class InventoryActionPersistDeniedError extends Error {
  readonly code = "INVENTORY_ACTION_PERSIST_DENIED";

  constructor(message: string) {
    super(message);
    this.name = "InventoryActionPersistDeniedError";
  }
}

export class InventoryActionPersistValidationError extends Error {
  readonly code = "INVENTORY_ACTION_PERSIST_VALIDATION";

  constructor(message: string) {
    super(message);
    this.name = "InventoryActionPersistValidationError";
  }
}

export class InventoryActionPersistConflictError extends Error {
  readonly code = "INVENTORY_ACTION_PERSIST_IDEMPOTENCY_BODY_CONFLICT";

  constructor(message: string) {
    super(message);
    this.name = "InventoryActionPersistConflictError";
  }
}

export class InventoryActionPersistTimeoutError extends Error {
  readonly code = "INVENTORY_ACTION_PERSIST_TIMEOUT";
  readonly sqlstate: string;

  constructor(message: string, sqlstate: string) {
    super(message);
    this.name = "InventoryActionPersistTimeoutError";
    this.sqlstate = sqlstate;
  }
}

export class InventoryActionPersistUnavailableError extends Error {
  readonly code = "INVENTORY_ACTION_PERSIST_UNAVAILABLE";

  constructor(message: string) {
    super(message);
    this.name = "InventoryActionPersistUnavailableError";
  }
}

export class InventoryActionPersistError extends Error {
  readonly code = "INVENTORY_ACTION_PERSIST";

  constructor(message: string) {
    super(message);
    this.name = "InventoryActionPersistError";
  }
}

/**
 * Persist one dormant harness inventory-action recommendation via the
 * service_role RPC. Not a production writer.
 */
export async function persistInventoryActionRecommendation(
  input: PersistInventoryActionRecommendationInput,
  client?: InventoryActionPersistClient,
): Promise<PersistInventoryActionRecommendationResult> {
  rejectForbiddenInputKeys(input);

  const grain = resolveTrustedGrain(input);
  const payload = buildInventoryActionPersistPayload({
    grain,
    input,
  });

  const rpcClient =
    client ??
    (createSupabaseAdminClient() as unknown as InventoryActionPersistClient);

  const raw = await callPersistRpc(rpcClient, {
    organizationId: grain.organizationId,
    storeId: grain.storeId,
    locationId: grain.locationId,
    variantId: grain.variantId,
    payload,
  });

  return parsePersistResponse(raw, { grain, payload });
}

/**
 * Builds the exact RPC JSON body, deriving hashes server-side to match
 * public.inventory_action_derive_hashes.
 */
export function buildInventoryActionPersistPayload(args: {
  grain: InventoryActionGrain;
  input: Omit<
    PersistInventoryActionRecommendationInput,
    "tenant" | "locationId" | "variantId"
  > & {
    tenant?: TenantContext;
    locationId?: string;
    variantId?: string;
  };
}): InventoryActionPersistPayload {
  const { grain, input } = args;

  assertHarnessSourceClass(input.evidenceSourceClass);
  assertIsoDate(input.decisionAsOfDate, "decisionAsOfDate");
  assertIsoDate(input.metricDate, "metricDate");
  assertNonBlank(input.pinnedTimeZone, "pinnedTimeZone");
  assertNonBlank(input.metricAlgorithmVersion, "metricAlgorithmVersion");
  assertNonBlank(input.metricSourceWatermark, "metricSourceWatermark");
  assertNonBlank(input.configurationVersion, "configurationVersion");
  assertNonBlank(
    input.decisionReproducibilityFingerprint,
    "decisionReproducibilityFingerprint",
  );

  const algorithmVersion =
    input.algorithmVersion ?? INVENTORY_DECISION_ALGORITHM_VERSION_V1;
  if (algorithmVersion !== INVENTORY_DECISION_ALGORITHM_VERSION_V1) {
    throw new InventoryActionPersistValidationError(
      "algorithmVersion must be inventory-decision-v1.",
    );
  }

  const rawActionType = (input as { actionType?: unknown }).actionType;
  if (rawActionType === "HEALTHY" || rawActionType === null) {
    throw new InventoryActionPersistValidationError(
      "HEALTHY is not an InventoryAction and cannot be persisted.",
    );
  }

  if (!ACTION_TYPES.has(input.actionType)) {
    throw new InventoryActionPersistValidationError(
      `actionType "${String(input.actionType)}" is not persistable.`,
    );
  }

  if (!PRIORITIES.has(input.priority)) {
    throw new InventoryActionPersistValidationError(
      "priority must be critical|high|medium|low.",
    );
  }

  if (!CONFIDENCES.has(input.confidence)) {
    throw new InventoryActionPersistValidationError(
      "confidence must be high|medium|low.",
    );
  }

  if (typeof input.incomingStateKnown !== "boolean") {
    throw new InventoryActionPersistValidationError(
      "incomingStateKnown must be boolean.",
    );
  }

  const secondary = normalizeSecondaryActions(
    input.actionType,
    input.compatibleSecondaryActionTypes,
  );

  const recommendedQuantity = normalizeRecommendedQuantity(
    input.actionType,
    input.recommendedQuantity,
  );

  const recommendedActionDate = normalizeOptionalDate(
    input.recommendedActionDate,
    "recommendedActionDate",
  );

  const evidenceSnapshot = normalizeEvidenceSnapshot(
    input.evidenceSnapshot,
    input.actionType,
    input.incomingStateKnown,
  );

  const algorithmVersions = {
    ...(input.algorithmVersions ?? DECISION_ALGORITHM_VERSIONS_V1),
  };

  const withoutHashes = {
    organizationId: grain.organizationId,
    storeId: grain.storeId,
    locationId: grain.locationId,
    variantId: grain.variantId,
    decisionAsOfDate: input.decisionAsOfDate.trim(),
    pinnedTimeZone: input.pinnedTimeZone.trim(),
    actionType: input.actionType,
    compatibleSecondaryActionTypes: secondary,
    priority: input.priority,
    status: "new" as const,
    recommendedQuantity,
    recommendedActionDate,
    confidence: input.confidence,
    evidenceSnapshot,
    incomingStateKnown: input.incomingStateKnown,
    evidenceSourceClass: M7_PERSISTENCE_CONTRACT_HARNESS_SOURCE_CLASS_V1,
    metricDate: input.metricDate.trim(),
    metricAlgorithmVersion: input.metricAlgorithmVersion.trim(),
    metricSourceWatermark: input.metricSourceWatermark.trim(),
    forecastRunId: null,
    algorithmVersion: INVENTORY_DECISION_ALGORITHM_VERSION_V1,
    configurationVersion: input.configurationVersion.trim(),
    algorithmVersions,
    decisionReproducibilityFingerprint:
      input.decisionReproducibilityFingerprint.trim(),
    claimsMerchantFacing: false as const,
    claimsProductionForecastApproval: false as const,
    claimsM7ProductionEligibility: false as const,
    algorithmApproved: false as const,
    isScoredMerchantDecision: false as const,
  };

  const hashes = deriveInventoryActionPersistHashes(withoutHashes);

  return {
    ...withoutHashes,
    evidenceProvenanceFingerprint: hashes.evidenceProvenanceFingerprint,
    decisionBodyHash: hashes.decisionBodyHash,
  };
}

/**
 * Mirrors public.inventory_action_derive_hashes exactly.
 */
export function deriveInventoryActionPersistHashes(payload: {
  organizationId: string;
  storeId: string;
  locationId: string;
  variantId: string;
  decisionAsOfDate: string;
  pinnedTimeZone: string;
  actionType: string;
  compatibleSecondaryActionTypes: readonly string[];
  priority: string;
  recommendedQuantity: number | null;
  recommendedActionDate: string | null;
  confidence: string;
  evidenceSnapshot: InventoryActionEvidence;
  incomingStateKnown: boolean;
  evidenceSourceClass: string;
  metricDate: string;
  metricAlgorithmVersion: string;
  metricSourceWatermark: string;
  algorithmVersion: string;
  configurationVersion: string;
  algorithmVersions: DecisionAlgorithmVersions | Record<string, string>;
  decisionReproducibilityFingerprint: string;
}): {
  evidenceProvenanceFingerprint: string;
  decisionBodyHash: string;
} {
  const evidenceSnapshot = payload.evidenceSnapshot;
  const secondary = [...payload.compatibleSecondaryActionTypes];

  const provenance = {
    decisionAsOfDate: payload.decisionAsOfDate,
    evidenceSnapshot,
    evidenceSourceClass: payload.evidenceSourceClass,
    forecastRunId: null,
    incomingStateKnown: payload.incomingStateKnown,
    locationId: payload.locationId,
    metricAlgorithmVersion: payload.metricAlgorithmVersion,
    metricDate: payload.metricDate,
    metricSourceWatermark: payload.metricSourceWatermark,
    organizationId: payload.organizationId,
    pinnedTimeZone: payload.pinnedTimeZone,
    storeId: payload.storeId,
    variantId: payload.variantId,
  };

  const evidenceProvenanceFingerprint = sha256Hex(
    stableSerialize(provenance),
  );

  const body = {
    actionType: payload.actionType,
    algorithmApproved: false,
    algorithmVersion: payload.algorithmVersion,
    algorithmVersions: payload.algorithmVersions,
    claimsM7ProductionEligibility: false,
    claimsMerchantFacing: false,
    claimsProductionForecastApproval: false,
    compatibleSecondaryActionTypes: secondary,
    confidence: payload.confidence,
    configurationVersion: payload.configurationVersion,
    decisionAsOfDate: payload.decisionAsOfDate,
    decisionReproducibilityFingerprint:
      payload.decisionReproducibilityFingerprint,
    evidenceProvenanceFingerprint,
    evidenceSnapshot,
    evidenceSourceClass: payload.evidenceSourceClass,
    forecastRunId: null,
    incomingStateKnown: payload.incomingStateKnown,
    isScoredMerchantDecision: false,
    locationId: payload.locationId,
    metricAlgorithmVersion: payload.metricAlgorithmVersion,
    metricDate: payload.metricDate,
    metricSourceWatermark: payload.metricSourceWatermark,
    organizationId: payload.organizationId,
    pinnedTimeZone: payload.pinnedTimeZone,
    priority: payload.priority,
    recommendedActionDate: payload.recommendedActionDate,
    recommendedQuantity: payload.recommendedQuantity,
    status: "new",
    storeId: payload.storeId,
    variantId: payload.variantId,
  };

  const decisionBodyHash = sha256Hex(stableSerialize(body));

  return {
    evidenceProvenanceFingerprint,
    decisionBodyHash,
  };
}

function resolveTrustedGrain(
  input: PersistInventoryActionRecommendationInput,
): InventoryActionGrain {
  const { tenant, locationId, variantId } = input;

  if (
    tenant === null ||
    typeof tenant !== "object" ||
    typeof tenant.organizationId !== "string" ||
    tenant.organizationId.trim().length === 0 ||
    typeof tenant.userId !== "string" ||
    tenant.userId.trim().length === 0
  ) {
    throw new InventoryActionPersistDeniedError(
      "persistInventoryActionRecommendation requires a trusted TenantContext.",
    );
  }

  if (
    typeof tenant.storeId !== "string" ||
    tenant.storeId.trim().length === 0
  ) {
    throw new InventoryActionPersistDeniedError(
      "persistInventoryActionRecommendation requires an authorized store on TenantContext.",
    );
  }

  if (
    typeof locationId !== "string" ||
    locationId.trim().length === 0 ||
    typeof variantId !== "string" ||
    variantId.trim().length === 0
  ) {
    throw new InventoryActionPersistValidationError(
      "locationId and variantId are required and must be non-null.",
    );
  }

  return {
    organizationId: tenant.organizationId.trim(),
    storeId: tenant.storeId.trim(),
    locationId: locationId.trim(),
    variantId: variantId.trim(),
  };
}

function assertHarnessSourceClass(value: unknown): void {
  if (value === "controlled_fixture_only") {
    throw new InventoryActionPersistValidationError(
      "FIXTURE_EVIDENCE_REJECTED: controlled_fixture_only is not persistable.",
    );
  }

  if (value === "m5_sku_daily_metric_bound_v1") {
    throw new InventoryActionPersistValidationError(
      "PRODUCTION_SOURCE_OF_CREATE_UNAVAILABLE: reserved M5 source class is dormant.",
    );
  }

  if (value !== M7_PERSISTENCE_CONTRACT_HARNESS_SOURCE_CLASS_V1) {
    throw new InventoryActionPersistValidationError(
      "evidenceSourceClass must be m7_persistence_contract_harness_v1.",
    );
  }
}

function normalizeSecondaryActions(
  primary: InventoryActionType,
  secondary: readonly InventoryActionType[] | undefined,
): InventoryActionType[] {
  const values = secondary === undefined ? [] : [...secondary];

  for (const action of values) {
    if (!ACTION_TYPES.has(action)) {
      throw new InventoryActionPersistValidationError(
        `compatible secondary action "${String(action)}" is invalid.`,
      );
    }
    if (action === primary) {
      throw new InventoryActionPersistValidationError(
        "compatible secondary actions must not duplicate the primary action.",
      );
    }
  }

  return values;
}

function normalizeRecommendedQuantity(
  actionType: InventoryActionType,
  quantity: UnitQuantity | null,
): number | null {
  if (actionType === "REORDER") {
    if (
      typeof quantity !== "number" ||
      !Number.isInteger(quantity) ||
      quantity <= 0
    ) {
      throw new InventoryActionPersistValidationError(
        "REORDER requires a positive integer recommendedQuantity.",
      );
    }
    return quantity;
  }

  if (quantity !== null) {
    throw new InventoryActionPersistValidationError(
      `${actionType} requires recommendedQuantity null.`,
    );
  }

  return null;
}

function normalizeOptionalDate(
  value: string | null | undefined,
  field: string,
): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  assertIsoDate(value, field);
  return value.trim();
}

function normalizeEvidenceSnapshot(
  evidence: InventoryActionEvidence,
  actionType: InventoryActionType,
  incomingStateKnown: boolean,
): InventoryActionEvidence {
  if (evidence === null || typeof evidence !== "object") {
    throw new InventoryActionPersistValidationError(
      "evidenceSnapshot is required.",
    );
  }

  const requiredKeys: Array<keyof InventoryActionEvidence> = [
    "availableQuantity",
    "incomingQuantity",
    "demandVelocity",
    "daysOfStock",
    "leadTimeDays",
    "safetyStockUnits",
    "reorderPointUnits",
    "targetStockUnits",
    "inventoryAgeDays",
    "forecastExpectedDemandUnits",
    "dataQualityScore",
    "reasonCodes",
  ];

  for (const key of requiredKeys) {
    if (!Object.prototype.hasOwnProperty.call(evidence, key)) {
      throw new InventoryActionPersistValidationError(
        `evidenceSnapshot missing required key "${key}".`,
      );
    }
  }

  if (!Array.isArray(evidence.reasonCodes)) {
    throw new InventoryActionPersistValidationError(
      "evidenceSnapshot.reasonCodes must be an array.",
    );
  }

  if (actionType === "WATCH" && evidence.reasonCodes.length < 1) {
    throw new InventoryActionPersistValidationError(
      "WATCH requires at least one evidence reason code.",
    );
  }

  if (
    !incomingStateKnown &&
    evidence.incomingQuantity !== null
  ) {
    throw new InventoryActionPersistValidationError(
      "incomingStateKnown=false requires evidenceSnapshot.incomingQuantity null.",
    );
  }

  // Preserve canonical InventoryActionEvidence shape with explicit nulls.
  return {
    availableQuantity: assertNullableNumber(
      evidence.availableQuantity,
      "availableQuantity",
      true,
    ),
    incomingQuantity: assertNullableNumber(
      evidence.incomingQuantity,
      "incomingQuantity",
      true,
    ),
    demandVelocity: assertNullableNumber(
      evidence.demandVelocity,
      "demandVelocity",
      false,
    ),
    daysOfStock: assertNullableNumber(
      evidence.daysOfStock,
      "daysOfStock",
      false,
    ),
    leadTimeDays: assertNullableNumber(
      evidence.leadTimeDays,
      "leadTimeDays",
      false,
    ),
    safetyStockUnits: assertNullableNumber(
      evidence.safetyStockUnits,
      "safetyStockUnits",
      false,
    ),
    reorderPointUnits: assertNullableNumber(
      evidence.reorderPointUnits,
      "reorderPointUnits",
      false,
    ),
    targetStockUnits: assertNullableNumber(
      evidence.targetStockUnits,
      "targetStockUnits",
      false,
    ),
    inventoryAgeDays: assertNullableNumber(
      evidence.inventoryAgeDays,
      "inventoryAgeDays",
      false,
    ),
    forecastExpectedDemandUnits: assertNullableNumber(
      evidence.forecastExpectedDemandUnits,
      "forecastExpectedDemandUnits",
      false,
    ),
    dataQualityScore: assertNullableNumber(
      evidence.dataQualityScore,
      "dataQualityScore",
      false,
    ),
    reasonCodes: evidence.reasonCodes.map((code) => {
      if (typeof code !== "string" || code.trim().length === 0) {
        throw new InventoryActionPersistValidationError(
          "evidenceSnapshot.reasonCodes must be non-blank strings.",
        );
      }
      return code;
    }),
  };
}

function assertNullableNumber(
  value: unknown,
  field: string,
  integerOnly: boolean,
): number | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new InventoryActionPersistValidationError(
      `evidenceSnapshot.${field} must be a finite number or null.`,
    );
  }
  if (integerOnly && !Number.isInteger(value)) {
    throw new InventoryActionPersistValidationError(
      `evidenceSnapshot.${field} must be an integer or null.`,
    );
  }
  if (integerOnly && value < 0) {
    throw new InventoryActionPersistValidationError(
      `evidenceSnapshot.${field} must be non-negative when known.`,
    );
  }
  return value;
}

function assertIsoDate(value: string, field: string): void {
  if (typeof value !== "string" || !ISO_DATE_RE.test(value.trim())) {
    throw new InventoryActionPersistValidationError(
      `${field} must be an ISO date (YYYY-MM-DD).`,
    );
  }
}

function assertNonBlank(value: string, field: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InventoryActionPersistValidationError(
      `${field} is required.`,
    );
  }
}

function rejectForbiddenInputKeys(input: object): void {
  for (const key of Object.keys(input)) {
    if (FORBIDDEN_INPUT_KEYS.has(key)) {
      throw new InventoryActionPersistDeniedError(
        `persistInventoryActionRecommendation must not include client-supplied "${key}".`,
      );
    }
  }
}

async function callPersistRpc(
  client: InventoryActionPersistClient,
  args: {
    organizationId: string;
    storeId: string;
    locationId: string;
    variantId: string;
    payload: InventoryActionPersistPayload;
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
      p_payload: args.payload,
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
    normalized.includes("decision_idempotency_body_conflict") ||
    normalized.includes("idempotency_body_conflict")
  ) {
    throw new InventoryActionPersistConflictError(
      "inventory action persist rejected same-key payload with a conflicting body.",
    );
  }

  if (
    sqlstate === "55P03" ||
    sqlstate === "57014" ||
    normalized.includes("lock timeout") ||
    normalized.includes("statement timeout") ||
    normalized.includes("canceling statement due to statement timeout")
  ) {
    throw new InventoryActionPersistTimeoutError(
      `inventory action persist timed out (${sqlstate || "timeout"}).`,
      sqlstate ||
        (normalized.includes("lock") ? "55P03" : "57014"),
    );
  }

  if (
    normalized.includes("could not find the function") ||
    (normalized.includes("persist_inventory_action_recommendation") &&
      normalized.includes("does not exist")) ||
    sqlstate === "42883"
  ) {
    throw new InventoryActionPersistUnavailableError(
      "inventory action persist RPC is unavailable.",
    );
  }

  if (
    normalized.includes("permission denied") ||
    normalized.includes("not authorized") ||
    sqlstate === "42501"
  ) {
    throw new InventoryActionPersistDeniedError(
      "inventory action persist RPC execution was denied.",
    );
  }

  if (
    normalized.includes("decision_persistence_scope_error") ||
    normalized.includes("decision_persistence_invalid_payload") ||
    normalized.includes("fixture_evidence_rejected") ||
    normalized.includes("production_trust_claim_rejected") ||
    normalized.includes("production_source_of_create_unavailable") ||
    normalized.includes("forecast_run_forbidden") ||
    normalized.includes("decision_body_hash_mismatch")
  ) {
    throw new InventoryActionPersistValidationError(message);
  }

  throw new InventoryActionPersistError(
    `inventory action persist RPC failed: ${message}`,
  );
}

function parsePersistResponse(
  raw: unknown,
  context: {
    grain: InventoryActionGrain;
    payload: InventoryActionPersistPayload;
  },
): PersistInventoryActionRecommendationResult {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new InventoryActionPersistValidationError(
      "inventory action persist returned a malformed payload.",
    );
  }

  const response = raw as Record<string, unknown>;

  if (response.ok !== true) {
    throw new InventoryActionPersistValidationError(
      "inventory action persist response ok flag must be true.",
    );
  }

  if (
    response.claimsMerchantFacing !== false ||
    response.claimsProductionForecastApproval !== false ||
    response.claimsM7ProductionEligibility !== false ||
    response.algorithmApproved !== false ||
    response.isScoredMerchantDecision !== false
  ) {
    throw new InventoryActionPersistValidationError(
      "inventory action persist must not claim merchant/production/M7/algorithm eligibility.",
    );
  }

  const disposition = response.disposition;
  if (disposition !== "created" && disposition !== "replayed") {
    throw new InventoryActionPersistValidationError(
      `unexpected inventory action persist disposition "${String(disposition)}".`,
    );
  }

  const inventoryActionId = assertUuid(
    response.inventoryActionId,
    "inventoryActionId",
  );

  const decisionBodyHash = assertSha256(
    response.decisionBodyHash,
    "decisionBodyHash",
  );
  const evidenceProvenanceFingerprint = assertSha256(
    response.evidenceProvenanceFingerprint,
    "evidenceProvenanceFingerprint",
  );

  if (decisionBodyHash !== context.payload.decisionBodyHash) {
    throw new InventoryActionPersistValidationError(
      "inventory action persist response decisionBodyHash does not match request payload.",
    );
  }

  if (
    evidenceProvenanceFingerprint !==
    context.payload.evidenceProvenanceFingerprint
  ) {
    throw new InventoryActionPersistValidationError(
      "inventory action persist response evidenceProvenanceFingerprint does not match request payload.",
    );
  }

  return {
    disposition,
    inventoryActionId,
    decisionBodyHash,
    evidenceProvenanceFingerprint,
    claimsMerchantFacing: false,
    claimsProductionForecastApproval: false,
    claimsM7ProductionEligibility: false,
    algorithmApproved: false,
    isScoredMerchantDecision: false,
    grain: context.grain,
    payload: context.payload,
  };
}

function assertUuid(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InventoryActionPersistValidationError(
      `${field} is required.`,
    );
  }
  const text = value.trim();
  if (!UUID_RE.test(text)) {
    throw new InventoryActionPersistValidationError(
      `${field} must be a UUID.`,
    );
  }
  return text;
}

function assertSha256(value: unknown, field: string): string {
  if (typeof value !== "string" || !SHA256_RE.test(value)) {
    throw new InventoryActionPersistValidationError(
      `${field} must be a sha256 hex digest.`,
    );
  }
  return value;
}

function stableSerialize(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([a], [b]) => a.localeCompare(b),
    );
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`)
      .join(",")}}`;
  }
  throw new InventoryActionPersistValidationError(
    "Unsupported inventory action persist fingerprint value.",
  );
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}
