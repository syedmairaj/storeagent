/**
 * M7-PB1.h.2 — pure metric freshness fence (LOCAL read-model only).
 *
 * Validates observed M5 freshness axes against the PB1.h.1a contract.
 * Does NOT open DB connections, take locks, persist, or prove create-time
 * transaction serialization (§1.6 remains BLOCKED / UNPROVEN).
 *
 * Authority: docs/M7_PB1_H1_PRODUCTION_EVIDENCE_FENCING_CONTRACT.md
 */

import { SKU_DAILY_METRIC_ALGORITHM_VERSION } from "@/lib/metrics/sku-daily-metric-record";

import {
  buildMetricSourceWatermark,
  type M7DecisionGrain,
  type Pb1TrustedTenantScope,
} from "./metric-decision-binding";

export const M7_PB1_METRIC_FRESHNESS_FENCE_VERSION_V1 =
  "m7-pb1-metric-freshness-fence-v1" as const;

/** Inclusive day span: metric_date − 89 through metric_date (90 calendar dates). */
export const PB1_METRIC_SALES_SOURCE_WINDOW_DAYS = 90 as const;

export const PB1_METRIC_RECOMPUTE_OPEN_STATUSES = Object.freeze([
  "queued",
  "claimed",
  "running",
  "retry_wait",
  "failed",
] as const);

export type Pb1MetricRecomputeOpenStatus =
  (typeof PB1_METRIC_RECOMPUTE_OPEN_STATUSES)[number];

export type Pb1MetricRecomputeRequestStatus =
  | Pb1MetricRecomputeOpenStatus
  | "succeeded"
  | "cancelled";

export type Pb1MetricFreshnessFenceFailureCode =
  | "FENCE_ATTESTATION_INVALID"
  | "FOREIGN_TENANT_REJECTED"
  | "FOREIGN_STORE_REJECTED"
  | "GRAIN_MISMATCH"
  | "UNSUPPORTED_METRIC_ALGORITHM"
  | "METRIC_DATE_NOT_CURRENT"
  | "METRIC_WATERMARK_MISMATCH"
  | "PENDING_RECOMPUTE"
  | "METRIC_SOURCE_WINDOW_DIRTY"
  | "SA008"
  | "STALE_SOURCE_TOKEN"
  | "RECOMPUTE_REQUEST_EVIDENCE_UNPROVEN"
  | "SOURCE_EVENT_EVIDENCE_UNPROVEN"
  | "SOURCE_TOKEN_EVIDENCE_UNPROVEN"
  | "METRIC_EVIDENCE_UNPROVEN";

export type Pb1MetricSourceEventProjection = {
  organizationId: string;
  storeId: string;
  locationId: string;
  variantId: string;
  sourceDate: string;
  algorithmVersion: string;
  /**
   * null = unconsumed. Non-null timestamps are treated as consumed.
   */
  consumedAt: string | null;
  /**
   * Optional class label for diagnostics. Window membership does not
   * require it — M5.6A events are grain+date only.
   */
  sourceClass?:
    | "sales"
    | "inventory"
    | "purchase_order"
    | "attestation"
    | "planning"
    | "other";
};

export type Pb1MetricRecomputeRequestEvidence =
  | {
      /**
       * Caller did not supply a first-request / generation observation.
       * Fail closed — cannot claim generation cleanliness.
       */
      kind: "unproven";
    }
  | {
      /**
       * Caller observed no request row for this grain+algorithm.
       * Read-model generation axis may pass; first-insert race remains
       * transactionSafety=unproven (never clears TX proof).
       */
      kind: "observed_absent";
    }
  | {
      kind: "observed";
      dirtyGeneration: number;
      claimedGeneration: number;
      appliedGeneration: number;
      status: Pb1MetricRecomputeRequestStatus;
    };

export type Pb1MetricSourceEventEvidence =
  | { kind: "unproven" }
  | {
      kind: "observed";
      events: readonly Pb1MetricSourceEventProjection[];
    };

export type Pb1MetricSourceTokenEvidence =
  | { kind: "unproven" }
  | {
      kind: "observed";
      /** Token bound into candidate evidence / prior observation. */
      boundToken: string;
      /** Fresh re-snapshot token under the caller's read. */
      currentToken: string;
    };

export type Pb1MetricFreshnessFenceMetricProjection = {
  organizationId: string;
  storeId: string;
  locationId: string;
  variantId: string;
  metricDate: string;
  algorithmVersion: string;
  updatedAt: string;
};

export type Pb1MetricFreshnessFenceRequest = {
  fenceVersion: typeof M7_PB1_METRIC_FRESHNESS_FENCE_VERSION_V1;
  trustedScope: Pick<Pb1TrustedTenantScope, "organizationId" | "storeId">;
  grain: M7DecisionGrain;
  /**
   * Exactly one observed metric row projection. Missing → fail closed.
   */
  metric: Pb1MetricFreshnessFenceMetricProjection | null | undefined;
  storeLocalAsOfDate: string;
  /**
   * Optional bound watermark from a prior observation. When supplied,
   * must equal buildMetricSourceWatermark(metric).
   */
  expectedMetricSourceWatermark?: string | null;
  recomputeRequest: Pb1MetricRecomputeRequestEvidence;
  unconsumedSourceEvents: Pb1MetricSourceEventEvidence;
  sourceToken: Pb1MetricSourceTokenEvidence;
};

export type Pb1MetricFreshnessFenceRejection = {
  ok: false;
  fenceVersion: typeof M7_PB1_METRIC_FRESHNESS_FENCE_VERSION_V1;
  code: Pb1MetricFreshnessFenceFailureCode;
  detail: string;
  /**
   * Observed read-model evidence did not satisfy the fence.
   */
  observedEvidenceValidity: "invalid";
  /**
   * Pure helpers never prove create-TX serialization / phantom safety.
   */
  transactionSafety: "unproven";
  productionCreateEligible: false;
  commercialActionsEligible: false;
};

export type Pb1MetricFreshnessFenceSuccess = {
  ok: true;
  fenceVersion: typeof M7_PB1_METRIC_FRESHNESS_FENCE_VERSION_V1;
  grain: M7DecisionGrain;
  metricDate: string;
  algorithmVersion: typeof SKU_DAILY_METRIC_ALGORITHM_VERSION;
  metricSourceWatermark: string;
  salesWindow: {
    windowStartDate: string;
    windowEndDate: string;
    relevantUnconsumedEventCount: number;
  };
  generations: {
    requestPresence: "observed_absent" | "observed_present";
    dirtyGeneration: number | null;
    claimedGeneration: number | null;
    appliedGeneration: number | null;
    status: Pb1MetricRecomputeRequestStatus | null;
  };
  sourceTokenMatched: true;
  observedEvidenceValidity: "valid";
  /**
   * Always unproven for PB1.h.2 — §1.6 create TX + first-request race
   * remain outside this helper.
   */
  transactionSafety: "unproven";
  productionCreateEligible: false;
  commercialActionsEligible: false;
  notes: readonly [
    "LOCAL_READ_MODEL_FRESHNESS_ONLY",
    "NOT_create_transaction_serialization_proof",
    "NOT_production_decision_create",
    "NOT_m7_3_approvable",
  ];
};

export type Pb1MetricFreshnessFenceResult =
  | Pb1MetricFreshnessFenceRejection
  | Pb1MetricFreshnessFenceSuccess;

/**
 * Pure, deterministic metric freshness fence over caller-supplied evidence.
 */
export function evaluatePb1MetricFreshnessFence(
  request: Pb1MetricFreshnessFenceRequest,
): Pb1MetricFreshnessFenceResult {
  if (request === null || typeof request !== "object") {
    return reject(
      "FENCE_ATTESTATION_INVALID",
      "PB1.h.2 metric freshness fence request is required.",
    );
  }

  if (request.fenceVersion !== M7_PB1_METRIC_FRESHNESS_FENCE_VERSION_V1) {
    return reject(
      "FENCE_ATTESTATION_INVALID",
      "fenceVersion must be m7-pb1-metric-freshness-fence-v1.",
    );
  }

  const scope = request.trustedScope;
  const grain = request.grain;
  if (
    scope === null ||
    typeof scope !== "object" ||
    grain === null ||
    typeof grain !== "object"
  ) {
    return reject(
      "FENCE_ATTESTATION_INVALID",
      "trustedScope and grain are required.",
    );
  }

  const scopeOrg = trimRequired(scope.organizationId);
  const scopeStore = trimRequired(scope.storeId);
  const grainOrg = trimRequired(grain.organizationId);
  const grainStore = trimRequired(grain.storeId);
  const grainLocation = trimRequired(grain.locationId);
  const grainVariant = trimRequired(grain.variantId);

  if (
    !scopeOrg ||
    !scopeStore ||
    !grainOrg ||
    !grainStore ||
    !grainLocation ||
    !grainVariant
  ) {
    return reject(
      "FENCE_ATTESTATION_INVALID",
      "trustedScope and grain identity fields are required.",
    );
  }

  if (request.metric === null || request.metric === undefined) {
    return reject(
      "METRIC_EVIDENCE_UNPROVEN",
      "Metric row evidence is missing; freshness fails closed.",
    );
  }

  const metric = request.metric;
  if (typeof metric !== "object") {
    return reject(
      "METRIC_EVIDENCE_UNPROVEN",
      "Metric row evidence is malformed; freshness fails closed.",
    );
  }

  if (scopeOrg !== metric.organizationId) {
    return reject(
      "FOREIGN_TENANT_REJECTED",
      "trustedScope.organizationId does not match metric organizationId.",
    );
  }

  if (scopeStore !== metric.storeId) {
    return reject(
      "FOREIGN_STORE_REJECTED",
      "trustedScope.storeId does not match metric storeId.",
    );
  }

  if (
    grainOrg !== metric.organizationId ||
    grainStore !== metric.storeId ||
    grainLocation !== metric.locationId ||
    grainVariant !== metric.variantId
  ) {
    return reject(
      "GRAIN_MISMATCH",
      "Requested grain does not match metric natural-key identity.",
    );
  }

  if (metric.algorithmVersion !== SKU_DAILY_METRIC_ALGORITHM_VERSION) {
    return reject(
      "UNSUPPORTED_METRIC_ALGORITHM",
      `algorithmVersion must be ${SKU_DAILY_METRIC_ALGORITHM_VERSION}.`,
    );
  }

  if (!isIsoCalendarDate(metric.metricDate)) {
    return reject(
      "FENCE_ATTESTATION_INVALID",
      "metric.metricDate must be a YYYY-MM-DD calendar date.",
    );
  }

  if (
    typeof request.storeLocalAsOfDate !== "string" ||
    !isIsoCalendarDate(request.storeLocalAsOfDate)
  ) {
    return reject(
      "FENCE_ATTESTATION_INVALID",
      "storeLocalAsOfDate must be a YYYY-MM-DD calendar date.",
    );
  }

  if (metric.metricDate !== request.storeLocalAsOfDate) {
    return reject(
      "METRIC_DATE_NOT_CURRENT",
      "metricDate must equal store-local current as-of date.",
    );
  }

  if (
    typeof metric.updatedAt !== "string" ||
    metric.updatedAt.trim().length === 0
  ) {
    return reject(
      "METRIC_EVIDENCE_UNPROVEN",
      "metric.updatedAt watermark is required.",
    );
  }

  const metricSourceWatermark = buildMetricSourceWatermark({
    metricDate: metric.metricDate,
    algorithmVersion: metric.algorithmVersion,
    updatedAt: metric.updatedAt,
  });

  if (
    request.expectedMetricSourceWatermark !== undefined &&
    request.expectedMetricSourceWatermark !== null
  ) {
    if (
      typeof request.expectedMetricSourceWatermark !== "string" ||
      request.expectedMetricSourceWatermark.trim().length === 0
    ) {
      return reject(
        "METRIC_WATERMARK_MISMATCH",
        "expectedMetricSourceWatermark is malformed.",
      );
    }
    if (request.expectedMetricSourceWatermark !== metricSourceWatermark) {
      return reject(
        "METRIC_WATERMARK_MISMATCH",
        "Observed metric watermark does not match expectedMetricSourceWatermark.",
      );
    }
  }

  const recompute = request.recomputeRequest;
  if (recompute === null || typeof recompute !== "object") {
    return reject(
      "RECOMPUTE_REQUEST_EVIDENCE_UNPROVEN",
      "Recompute-request evidence is required; missing first-request proof fails closed.",
    );
  }

  if (recompute.kind === "unproven") {
    return reject(
      "RECOMPUTE_REQUEST_EVIDENCE_UNPROVEN",
      "Recompute-request / first-request evidence is unproven; freshness fails closed.",
    );
  }

  let generations: Pb1MetricFreshnessFenceSuccess["generations"];

  if (recompute.kind === "observed_absent") {
    generations = {
      requestPresence: "observed_absent",
      dirtyGeneration: null,
      claimedGeneration: null,
      appliedGeneration: null,
      status: null,
    };
  } else if (recompute.kind === "observed") {
    if (
      !isNonNegativeInt(recompute.dirtyGeneration) ||
      !isNonNegativeInt(recompute.claimedGeneration) ||
      !isNonNegativeInt(recompute.appliedGeneration)
    ) {
      return reject(
        "RECOMPUTE_REQUEST_EVIDENCE_UNPROVEN",
        "Recompute generations must be non-negative integers.",
      );
    }

    if (!isRecomputeStatus(recompute.status)) {
      return reject(
        "RECOMPUTE_REQUEST_EVIDENCE_UNPROVEN",
        "Recompute request status is unrecognized.",
      );
    }

    if (
      recompute.dirtyGeneration !== recompute.appliedGeneration ||
      isOpenRecomputeStatus(recompute.status)
    ) {
      return reject(
        "PENDING_RECOMPUTE",
        "Open or dirty recompute request rejects metric freshness (generation axis).",
      );
    }

    generations = {
      requestPresence: "observed_present",
      dirtyGeneration: recompute.dirtyGeneration,
      claimedGeneration: recompute.claimedGeneration,
      appliedGeneration: recompute.appliedGeneration,
      status: recompute.status,
    };
  } else {
    return reject(
      "RECOMPUTE_REQUEST_EVIDENCE_UNPROVEN",
      "Recompute-request evidence kind is unrecognized.",
    );
  }

  const eventsEvidence = request.unconsumedSourceEvents;
  if (eventsEvidence === null || typeof eventsEvidence !== "object") {
    return reject(
      "SOURCE_EVENT_EVIDENCE_UNPROVEN",
      "Source-event window evidence is required; freshness fails closed.",
    );
  }

  if (eventsEvidence.kind === "unproven") {
    return reject(
      "SOURCE_EVENT_EVIDENCE_UNPROVEN",
      "Source-event window evidence is unproven; freshness fails closed.",
    );
  }

  if (eventsEvidence.kind !== "observed" || !Array.isArray(eventsEvidence.events)) {
    return reject(
      "SOURCE_EVENT_EVIDENCE_UNPROVEN",
      "Source-event evidence must be an observed event array.",
    );
  }

  const windowStartDate = shiftIsoCalendarDate(
    metric.metricDate,
    -(PB1_METRIC_SALES_SOURCE_WINDOW_DAYS - 1),
  );
  const windowEndDate = metric.metricDate;

  let relevantUnconsumedEventCount = 0;
  for (const event of eventsEvidence.events) {
    if (event === null || typeof event !== "object") {
      return reject(
        "SOURCE_EVENT_EVIDENCE_UNPROVEN",
        "Source-event projection is malformed.",
      );
    }

    if (!isIsoCalendarDate(event.sourceDate)) {
      return reject(
        "SOURCE_EVENT_EVIDENCE_UNPROVEN",
        "sourceDate must be a YYYY-MM-DD calendar date.",
      );
    }

    if (
      event.organizationId !== metric.organizationId ||
      event.storeId !== metric.storeId ||
      event.locationId !== metric.locationId ||
      event.variantId !== metric.variantId ||
      event.algorithmVersion !== metric.algorithmVersion
    ) {
      // Unrelated grain/algorithm — ignore for this fence.
      continue;
    }

    if (event.consumedAt !== null) {
      continue;
    }

    if (
      isSourceDateInMetricSalesWindow(event.sourceDate, metric.metricDate)
    ) {
      relevantUnconsumedEventCount += 1;
    }
  }

  if (relevantUnconsumedEventCount > 0) {
    return reject(
      "METRIC_SOURCE_WINDOW_DIRTY",
      "Unconsumed in-window source events reject metric freshness (90-day sales window).",
    );
  }

  const tokenEvidence = request.sourceToken;
  if (tokenEvidence === null || typeof tokenEvidence !== "object") {
    return reject(
      "SOURCE_TOKEN_EVIDENCE_UNPROVEN",
      "SA008 source-token evidence is required; freshness fails closed.",
    );
  }

  if (tokenEvidence.kind === "unproven") {
    return reject(
      "SOURCE_TOKEN_EVIDENCE_UNPROVEN",
      "SA008 source-token evidence is unproven; freshness fails closed.",
    );
  }

  if (tokenEvidence.kind !== "observed") {
    return reject(
      "SOURCE_TOKEN_EVIDENCE_UNPROVEN",
      "SA008 source-token evidence kind is unrecognized.",
    );
  }

  const boundToken = trimRequired(tokenEvidence.boundToken);
  const currentToken = trimRequired(tokenEvidence.currentToken);
  if (!boundToken || !currentToken) {
    return reject(
      "SOURCE_TOKEN_EVIDENCE_UNPROVEN",
      "boundToken and currentToken are required for SA008 compare.",
    );
  }

  if (boundToken !== currentToken) {
    return reject(
      "SA008",
      "Observed source token diverges from bound token (STALE_SOURCE_TOKEN).",
    );
  }

  return Object.freeze({
    ok: true as const,
    fenceVersion: M7_PB1_METRIC_FRESHNESS_FENCE_VERSION_V1,
    grain: Object.freeze({
      organizationId: grainOrg,
      storeId: grainStore,
      locationId: grainLocation,
      variantId: grainVariant,
    }),
    metricDate: metric.metricDate,
    algorithmVersion: SKU_DAILY_METRIC_ALGORITHM_VERSION,
    metricSourceWatermark,
    salesWindow: Object.freeze({
      windowStartDate,
      windowEndDate,
      relevantUnconsumedEventCount: 0,
    }),
    generations: Object.freeze(generations),
    sourceTokenMatched: true as const,
    observedEvidenceValidity: "valid" as const,
    transactionSafety: "unproven" as const,
    productionCreateEligible: false as const,
    commercialActionsEligible: false as const,
    notes: Object.freeze([
      "LOCAL_READ_MODEL_FRESHNESS_ONLY",
      "NOT_create_transaction_serialization_proof",
      "NOT_production_decision_create",
      "NOT_m7_3_approvable",
    ] as const),
  });
}

/**
 * Inclusive M5.6C relevance window: source_date ∈ [metric_date − 89, metric_date].
 */
export function isSourceDateInMetricSalesWindow(
  sourceDate: string,
  metricDate: string,
): boolean {
  if (!isIsoCalendarDate(sourceDate) || !isIsoCalendarDate(metricDate)) {
    return false;
  }
  const windowStart = shiftIsoCalendarDate(
    metricDate,
    -(PB1_METRIC_SALES_SOURCE_WINDOW_DAYS - 1),
  );
  return sourceDate >= windowStart && sourceDate <= metricDate;
}

/**
 * Calendar shift in UTC date space for YYYY-MM-DD store-local dates.
 * Matches M5 aggregate window arithmetic (no timezone conversion).
 */
export function shiftIsoCalendarDate(isoDate: string, dayDelta: number): string {
  if (!isIsoCalendarDate(isoDate)) {
    throw new Error("isoDate must be a YYYY-MM-DD calendar date.");
  }
  if (!Number.isInteger(dayDelta)) {
    throw new Error("dayDelta must be an integer.");
  }

  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day! + dayDelta));
  const monthText = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dayText = String(date.getUTCDate()).padStart(2, "0");
  return `${date.getUTCFullYear()}-${monthText}-${dayText}`;
}

function reject(
  code: Pb1MetricFreshnessFenceFailureCode,
  detail: string,
): Pb1MetricFreshnessFenceRejection {
  return Object.freeze({
    ok: false as const,
    fenceVersion: M7_PB1_METRIC_FRESHNESS_FENCE_VERSION_V1,
    code,
    detail,
    observedEvidenceValidity: "invalid" as const,
    transactionSafety: "unproven" as const,
    productionCreateEligible: false as const,
    commercialActionsEligible: false as const,
  });
}

function trimRequired(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isIsoCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month! - 1 &&
    date.getUTCDate() === day
  );
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isOpenRecomputeStatus(
  status: string,
): status is Pb1MetricRecomputeOpenStatus {
  return (PB1_METRIC_RECOMPUTE_OPEN_STATUSES as readonly string[]).includes(
    status,
  );
}

function isRecomputeStatus(
  status: unknown,
): status is Pb1MetricRecomputeRequestStatus {
  return (
    status === "queued" ||
    status === "claimed" ||
    status === "running" ||
    status === "retry_wait" ||
    status === "failed" ||
    status === "succeeded" ||
    status === "cancelled"
  );
}
