import type {
  BacktestPointInTimeFact,
  ForecastBacktestHarnessInput,
} from "./backtest-harness";

import {
  assertForecastDate,
  type ForecastGrain,
} from "./series";

import type {
  InventoryAvailabilityState,
  PromotionState,
} from "./types";

/**
 * M6 P4b — pure TypeScript historical evidence integrity gate.
 *
 * Only controlled point-in-time fixtures with verifiable historical
 * availability may be normalized into P4a harness facts. Live canonical
 * commerce, P2c snapshot payloads, and correction-outbox-only sources are
 * rejected as UNSUPPORTED_HISTORICAL_REPLAY.
 *
 * Does not change frozen P1/P4a forecast or metric mathematics.
 * Does not invent trustedCompleteDates or silent zero actuals.
 */

export const FORECAST_HISTORICAL_EVIDENCE_INTEGRITY_VERSION_V1 =
  "forecast-historical-evidence-integrity-v1" as const;

export type HistoricalEvidenceSourceClass =
  | "controlled_pit_fixture"
  | "unsupported_live_canonical"
  | "partial_append_only";

/**
 * What a revision claims to represent.
 * Realized outcomes cannot be known before their business date.
 * Scheduled promotions may be announced earlier but never become sales.
 */
export type HistoricalEvidenceClaimKind =
  | "realized_sale"
  | "realized_return"
  | "realized_inventory"
  | "scheduled_promotion"
  | "day_outcome"
  | "coverage_claim"
  | "correction_outbox_notification"
  | "live_snapshot_payload";

export type HistoricalEvidenceIntegrityDisposition =
  | "accepted"
  | "UNSUPPORTED_HISTORICAL_REPLAY"
  | "INVALID_HISTORY";

export type HistoricalEvidenceIntegrityReasonCode =
  | "UNSUPPORTED_LIVE_CANONICAL"
  | "UNSUPPORTED_PARTIAL_APPEND_ONLY"
  | "UNSUPPORTED_CORRECTION_OUTBOX_ONLY"
  | "UNSUPPORTED_LIVE_SNAPSHOT"
  | "MISSING_KNOWN_AS_OF"
  | "MISSING_BUSINESS_DATE"
  | "MISSING_SOURCE_IDENTITY"
  | "MISSING_HISTORICAL_TIMEZONE"
  | "MISSING_DUAL_TIMESTAMPS"
  | "KNOWN_AS_OF_BEFORE_OBSERVATION"
  | "SCHEDULED_PROMOTION_AS_REALIZED_SALE"
  | "CONFLICTING_REVISIONS"
  | "MISSING_HISTORICAL_VERSION"
  | "INVALID_TIMEZONE_HISTORY"
  | "INVALID_DAY_OUTCOME_FIELDS"
  | "TRUSTED_COMPLETE_DATES_FORBIDDEN"
  | "GRAIN_MISMATCH"
  | "INVALID_HISTORY";

export interface HistoricalTimezoneEra {
  /**
   * Inclusive store-local date from which this IANA timezone applies.
   */
  effectiveFrom: string;
  timeZone: string;
}

/**
 * One candidate revision offered as historical evidence.
 */
export interface HistoricalEvidenceCandidateRevision {
  sourceIdentity: string;
  claimKind: HistoricalEvidenceClaimKind;
  organizationId: string;
  storeId: string;
  locationId: string;
  variantId: string;
  /**
   * Store-local business day this revision describes.
   */
  businessDate: string;
  /**
   * Store-local date when this revision became knowable.
   * Required for controlled fixtures (dual timestamp with businessDate).
   */
  knownAsOf?: string;
  /**
   * Optional arrival/observation instant provenance (ISO). Presence alone
   * does not authorize live replay; used to reject known-before-arrival claims.
   */
  observedOrArrivedAt?: string;
  unitsSold?: number;
  availability?: InventoryAvailabilityState;
  promotionState?: PromotionState;
  dataComplete?: boolean;
  /**
   * Explicit prior revision this corrects. When set, that prior must exist.
   */
  supersedesSourceIdentity?: string | null;
}

export interface HistoricalEvidenceIntegrityInput {
  sourceClass: HistoricalEvidenceSourceClass;
  grain: ForecastGrain;
  revisions: readonly HistoricalEvidenceCandidateRevision[];
  /**
   * Single pinned IANA timezone for the fixture window.
   * Required unless timezoneHistory covers every revision.
   */
  pinnedTimeZone?: string;
  timezoneHistory?: readonly HistoricalTimezoneEra[];
  /**
   * Forbidden synthetic completeness. Any non-empty value fails closed.
   */
  trustedCompleteDates?: readonly string[];
}

export interface HistoricalEvidenceIntegrityAccepted {
  disposition: "accepted";
  algorithmVersion: typeof FORECAST_HISTORICAL_EVIDENCE_INTEGRITY_VERSION_V1;
  sourceClass: "controlled_pit_fixture";
  reasonCodes: readonly HistoricalEvidenceIntegrityReasonCode[];
  grain: ForecastGrain;
  pinnedTimeZone: string;
  facts: readonly BacktestPointInTimeFact[];
  claimsProductionApproval: false;
  claimsM7NumericEligibility: false;
}

export interface HistoricalEvidenceIntegrityRejected {
  disposition:
    | "UNSUPPORTED_HISTORICAL_REPLAY"
    | "INVALID_HISTORY";
  algorithmVersion: typeof FORECAST_HISTORICAL_EVIDENCE_INTEGRITY_VERSION_V1;
  sourceClass: HistoricalEvidenceSourceClass;
  reasonCodes: readonly HistoricalEvidenceIntegrityReasonCode[];
  grain: ForecastGrain;
  facts: readonly [];
  claimsProductionApproval: false;
  claimsM7NumericEligibility: false;
}

export type HistoricalEvidenceIntegrityResult =
  | HistoricalEvidenceIntegrityAccepted
  | HistoricalEvidenceIntegrityRejected;

const REALIZED_OUTCOME_KINDS = new Set<HistoricalEvidenceClaimKind>([
  "realized_sale",
  "realized_return",
  "realized_inventory",
  "day_outcome",
  "coverage_claim",
]);

const LIVE_CLAIM_KINDS = new Set<HistoricalEvidenceClaimKind>([
  "correction_outbox_notification",
  "live_snapshot_payload",
]);

function assertIdentity(value: string, field: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} is required.`);
  }
}

function uniqueReasons(
  reasons: readonly HistoricalEvidenceIntegrityReasonCode[],
): HistoricalEvidenceIntegrityReasonCode[] {
  return [...new Set(reasons)];
}

function reject(
  input: HistoricalEvidenceIntegrityInput,
  disposition: "UNSUPPORTED_HISTORICAL_REPLAY" | "INVALID_HISTORY",
  reasonCodes: readonly HistoricalEvidenceIntegrityReasonCode[],
): HistoricalEvidenceIntegrityRejected {
  return {
    disposition,
    algorithmVersion: FORECAST_HISTORICAL_EVIDENCE_INTEGRITY_VERSION_V1,
    sourceClass: input.sourceClass,
    reasonCodes: uniqueReasons(reasonCodes),
    grain: input.grain,
    facts: [],
    claimsProductionApproval: false,
    claimsM7NumericEligibility: false,
  };
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
  throw new Error("Unsupported integrity value.");
}

function dayOutcomePayload(revision: HistoricalEvidenceCandidateRevision): {
  unitsSold: number;
  availability: InventoryAvailabilityState;
  promotionState: PromotionState;
  dataComplete: boolean;
} | null {
  if (
    revision.unitsSold === undefined ||
    revision.availability === undefined ||
    revision.promotionState === undefined ||
    revision.dataComplete === undefined
  ) {
    return null;
  }
  if (
    !Number.isFinite(revision.unitsSold) ||
    revision.unitsSold < 0
  ) {
    return null;
  }
  return {
    unitsSold: revision.unitsSold,
    availability: revision.availability,
    promotionState: revision.promotionState,
    dataComplete: revision.dataComplete,
  };
}

function resolvePinnedTimeZone(
  input: HistoricalEvidenceIntegrityInput,
):
  | { ok: true; timeZone: string }
  | { ok: false; reasons: HistoricalEvidenceIntegrityReasonCode[] } {
  const pinned = input.pinnedTimeZone?.trim() ?? "";
  const history = input.timezoneHistory ?? [];

  if (pinned.length > 0) {
    if (history.length > 0) {
      const mismatch = history.some(
        (era) => era.timeZone.trim() !== pinned,
      );
      if (mismatch) {
        // Fixture must not claim a single pin while history disagrees.
        // Historical TZ *changes* require an explicit multi-era history
        // without a conflicting pin — V1 rejects the ambiguous mix.
        return {
          ok: false,
          reasons: ["INVALID_TIMEZONE_HISTORY", "INVALID_HISTORY"],
        };
      }
    }
    return { ok: true, timeZone: pinned };
  }

  if (history.length === 0) {
    return {
      ok: false,
      reasons: ["MISSING_HISTORICAL_TIMEZONE", "INVALID_HISTORY"],
    };
  }

  const sorted = [...history].sort((a, b) =>
    a.effectiveFrom.localeCompare(b.effectiveFrom),
  );

  for (const era of sorted) {
    try {
      assertForecastDate(era.effectiveFrom, "timezoneHistory.effectiveFrom");
    } catch {
      return {
        ok: false,
        reasons: ["INVALID_TIMEZONE_HISTORY", "INVALID_HISTORY"],
      };
    }
    if (typeof era.timeZone !== "string" || era.timeZone.trim().length === 0) {
      return {
        ok: false,
        reasons: ["INVALID_TIMEZONE_HISTORY", "INVALID_HISTORY"],
      };
    }
  }

  // V1: a changing timezone history without a pin is recorded but not
  // safe for live attribution replay — accept only if every era shares
  // one timezone (pin-equivalent). True TZ changes stay unsupported.
  const zones = new Set(sorted.map((era) => era.timeZone.trim()));
  if (zones.size !== 1) {
    return {
      ok: false,
      reasons: [
        "UNSUPPORTED_LIVE_CANONICAL",
        "INVALID_TIMEZONE_HISTORY",
      ],
    };
  }

  return { ok: true, timeZone: sorted[0]!.timeZone.trim() };
}

function materializeKnownAsOfForHarness(
  revision: HistoricalEvidenceCandidateRevision,
  knownAsOf: string,
): string {
  // Scheduled promotions may be announced before the business day, but a
  // P4a day fact cannot be knowable before that calendar day exists.
  // Materialize knowledge on max(knownAsOf, businessDate) so plans do not
  // become pre-observed day outcomes, while still applying promo state.
  if (revision.claimKind === "scheduled_promotion") {
    return knownAsOf < revision.businessDate
      ? revision.businessDate
      : knownAsOf;
  }
  return knownAsOf;
}

/**
 * Validate and normalize historical evidence for P4a consumption.
 */
export function validateHistoricalEvidenceIntegrity(
  input: HistoricalEvidenceIntegrityInput,
): HistoricalEvidenceIntegrityResult {
  assertIdentity(input.grain.organizationId, "grain.organizationId");
  assertIdentity(input.grain.storeId, "grain.storeId");
  assertIdentity(input.grain.locationId, "grain.locationId");
  assertIdentity(input.grain.variantId, "grain.variantId");

  if (
    input.trustedCompleteDates !== undefined &&
    input.trustedCompleteDates.length > 0
  ) {
    return reject(input, "INVALID_HISTORY", [
      "TRUSTED_COMPLETE_DATES_FORBIDDEN",
      "INVALID_HISTORY",
    ]);
  }

  if (input.sourceClass === "unsupported_live_canonical") {
    return reject(input, "UNSUPPORTED_HISTORICAL_REPLAY", [
      "UNSUPPORTED_LIVE_CANONICAL",
    ]);
  }

  if (input.sourceClass === "partial_append_only") {
    return reject(input, "UNSUPPORTED_HISTORICAL_REPLAY", [
      "UNSUPPORTED_PARTIAL_APPEND_ONLY",
    ]);
  }

  if (input.sourceClass !== "controlled_pit_fixture") {
    return reject(input, "UNSUPPORTED_HISTORICAL_REPLAY", [
      "UNSUPPORTED_LIVE_CANONICAL",
    ]);
  }

  const liveKind = input.revisions.find((row) =>
    LIVE_CLAIM_KINDS.has(row.claimKind),
  );
  if (liveKind !== undefined) {
    const reason =
      liveKind.claimKind === "live_snapshot_payload"
        ? "UNSUPPORTED_LIVE_SNAPSHOT"
        : "UNSUPPORTED_CORRECTION_OUTBOX_ONLY";
    return reject(input, "UNSUPPORTED_HISTORICAL_REPLAY", [reason]);
  }

  // Coverage notifications without day-outcome bodies cannot rebuild demand.
  if (
    input.revisions.length > 0 &&
    input.revisions.every((row) => row.claimKind === "coverage_claim")
  ) {
    return reject(input, "UNSUPPORTED_HISTORICAL_REPLAY", [
      "UNSUPPORTED_CORRECTION_OUTBOX_ONLY",
    ]);
  }

  const tz = resolvePinnedTimeZone(input);
  if (!tz.ok) {
    const unsupported = tz.reasons.includes("UNSUPPORTED_LIVE_CANONICAL");
    return reject(
      input,
      unsupported ? "UNSUPPORTED_HISTORICAL_REPLAY" : "INVALID_HISTORY",
      tz.reasons,
    );
  }

  const reasons: HistoricalEvidenceIntegrityReasonCode[] = [];
  const harnessFacts: BacktestPointInTimeFact[] = [];
  // key: date|knownAsOf → payload serialization for conflict detection
  const revisionKeys = new Map<string, string>();

  const allSourceIds = new Set(
    input.revisions
      .map((row) => row.sourceIdentity)
      .filter(
        (id): id is string =>
          typeof id === "string" && id.trim().length > 0,
      ),
  );

  for (const revision of input.revisions) {
    if (
      revision.organizationId !== input.grain.organizationId ||
      revision.storeId !== input.grain.storeId ||
      revision.locationId !== input.grain.locationId ||
      revision.variantId !== input.grain.variantId
    ) {
      reasons.push("GRAIN_MISMATCH");
      continue;
    }

    if (
      typeof revision.sourceIdentity !== "string" ||
      revision.sourceIdentity.trim().length === 0
    ) {
      reasons.push("MISSING_SOURCE_IDENTITY");
      continue;
    }

    if (
      typeof revision.businessDate !== "string" ||
      revision.businessDate.trim().length === 0
    ) {
      reasons.push("MISSING_BUSINESS_DATE");
      continue;
    }

    try {
      assertForecastDate(revision.businessDate, "businessDate");
    } catch {
      reasons.push("INVALID_HISTORY");
      continue;
    }

    if (
      typeof revision.knownAsOf !== "string" ||
      revision.knownAsOf.trim().length === 0
    ) {
      reasons.push("MISSING_KNOWN_AS_OF", "MISSING_DUAL_TIMESTAMPS");
      continue;
    }

    try {
      assertForecastDate(revision.knownAsOf, "knownAsOf");
    } catch {
      reasons.push("INVALID_HISTORY");
      continue;
    }

    // Realized outcomes / day facts cannot be known before the business day.
    if (
      REALIZED_OUTCOME_KINDS.has(revision.claimKind) &&
      revision.knownAsOf < revision.businessDate
    ) {
      reasons.push("KNOWN_AS_OF_BEFORE_OBSERVATION");
      continue;
    }

    // A scheduled promotion must not silently carry realized sales units
    // as if the future sale were already observed before the day.
    if (revision.claimKind === "scheduled_promotion") {
      if (
        revision.knownAsOf < revision.businessDate &&
        revision.unitsSold !== undefined &&
        revision.unitsSold > 0 &&
        revision.dataComplete === true
      ) {
        reasons.push("SCHEDULED_PROMOTION_AS_REALIZED_SALE");
        continue;
      }
    }

    if (
      revision.supersedesSourceIdentity != null &&
      revision.supersedesSourceIdentity.trim().length > 0 &&
      !allSourceIds.has(revision.supersedesSourceIdentity)
    ) {
      reasons.push("MISSING_HISTORICAL_VERSION");
      continue;
    }

    const payload = dayOutcomePayload(revision);
    if (revision.claimKind === "scheduled_promotion" && payload === null) {
      // Schedule-only row without day outcome fields: record as a day fact
      // with unknown demand unless promo state is provided.
      if (revision.promotionState === undefined) {
        reasons.push("INVALID_DAY_OUTCOME_FIELDS");
        continue;
      }
      const knownAsOf = materializeKnownAsOfForHarness(
        revision,
        revision.knownAsOf,
      );
      const fact: BacktestPointInTimeFact = {
        organizationId: revision.organizationId,
        storeId: revision.storeId,
        locationId: revision.locationId,
        variantId: revision.variantId,
        date: revision.businessDate,
        unitsSold: 0,
        availability: "unknown",
        promotionState: revision.promotionState,
        dataComplete: false,
        knownAsOf,
      };
      const key = `${fact.date}|${fact.knownAsOf}`;
      const serialized = stableSerialize({
        unitsSold: fact.unitsSold,
        availability: fact.availability,
        promotionState: fact.promotionState,
        dataComplete: fact.dataComplete,
      });
      const prior = revisionKeys.get(key);
      if (prior !== undefined && prior !== serialized) {
        reasons.push("CONFLICTING_REVISIONS");
        continue;
      }
      revisionKeys.set(key, serialized);
      if (prior === undefined) {
        harnessFacts.push(fact);
      }
      continue;
    }

    if (payload === null) {
      reasons.push("INVALID_DAY_OUTCOME_FIELDS");
      continue;
    }

    // Incomplete / censored / unknown availability must retain fail-closed
    // fields — do not coerce into clean zero baseline here.
    const knownAsOf = materializeKnownAsOfForHarness(
      revision,
      revision.knownAsOf,
    );

    const fact: BacktestPointInTimeFact = {
      organizationId: revision.organizationId,
      storeId: revision.storeId,
      locationId: revision.locationId,
      variantId: revision.variantId,
      date: revision.businessDate,
      unitsSold: payload.unitsSold,
      availability: payload.availability,
      promotionState: payload.promotionState,
      dataComplete: payload.dataComplete,
      knownAsOf,
    };

    const key = `${fact.date}|${fact.knownAsOf}`;
    const serialized = stableSerialize({
      unitsSold: fact.unitsSold,
      availability: fact.availability,
      promotionState: fact.promotionState,
      dataComplete: fact.dataComplete,
    });
    const prior = revisionKeys.get(key);
    if (prior !== undefined && prior !== serialized) {
      reasons.push("CONFLICTING_REVISIONS");
      continue;
    }
    revisionKeys.set(key, serialized);
    if (prior === undefined) {
      harnessFacts.push(fact);
    }
  }

  if (reasons.length > 0) {
    const unsupported = reasons.some(
      (code) =>
        code === "UNSUPPORTED_LIVE_CANONICAL" ||
        code === "UNSUPPORTED_PARTIAL_APPEND_ONLY" ||
        code === "UNSUPPORTED_CORRECTION_OUTBOX_ONLY" ||
        code === "UNSUPPORTED_LIVE_SNAPSHOT",
    );
    return reject(
      input,
      unsupported ? "UNSUPPORTED_HISTORICAL_REPLAY" : "INVALID_HISTORY",
      [...reasons, "INVALID_HISTORY"],
    );
  }

  if (harnessFacts.length === 0) {
    return reject(input, "INVALID_HISTORY", [
      "INVALID_DAY_OUTCOME_FIELDS",
      "INVALID_HISTORY",
    ]);
  }

  harnessFacts.sort((left, right) => {
    const byDate = left.date.localeCompare(right.date);
    if (byDate !== 0) {
      return byDate;
    }
    return left.knownAsOf.localeCompare(right.knownAsOf);
  });

  return {
    disposition: "accepted",
    algorithmVersion: FORECAST_HISTORICAL_EVIDENCE_INTEGRITY_VERSION_V1,
    sourceClass: "controlled_pit_fixture",
    reasonCodes: [],
    grain: input.grain,
    pinnedTimeZone: tz.timeZone,
    facts: harnessFacts,
    claimsProductionApproval: false,
    claimsM7NumericEligibility: false,
  };
}

/**
 * Thin bridge: accepted integrity output → P4a harness input.
 * Does not alter harness mathematics.
 */
export function toForecastBacktestHarnessInput(
  accepted: HistoricalEvidenceIntegrityAccepted,
  originStart: string,
  originEnd: string,
  lookbackDays?: number,
): ForecastBacktestHarnessInput {
  if (accepted.disposition !== "accepted") {
    throw new Error(
      "toForecastBacktestHarnessInput requires an accepted integrity result.",
    );
  }

  return {
    grain: accepted.grain,
    originStart,
    originEnd,
    facts: accepted.facts,
    lookbackDays,
  };
}

/**
 * Classify a declared source for callers that have not yet built revisions.
 */
export function classifyHistoricalEvidenceSource(input: {
  sourceClass: HistoricalEvidenceSourceClass;
  claimKinds?: readonly HistoricalEvidenceClaimKind[];
}): {
  sourceClass: HistoricalEvidenceSourceClass;
  allowedForHarness: boolean;
  disposition:
    | "accepted_candidate"
    | "UNSUPPORTED_HISTORICAL_REPLAY";
  reasonCodes: readonly HistoricalEvidenceIntegrityReasonCode[];
} {
  if (input.sourceClass === "controlled_pit_fixture") {
    const kinds = input.claimKinds ?? [];
    if (kinds.some((kind) => LIVE_CLAIM_KINDS.has(kind))) {
      const reason = kinds.includes("live_snapshot_payload")
        ? "UNSUPPORTED_LIVE_SNAPSHOT"
        : "UNSUPPORTED_CORRECTION_OUTBOX_ONLY";
      return {
        sourceClass: input.sourceClass,
        allowedForHarness: false,
        disposition: "UNSUPPORTED_HISTORICAL_REPLAY",
        reasonCodes: [reason],
      };
    }
    return {
      sourceClass: "controlled_pit_fixture",
      allowedForHarness: true,
      disposition: "accepted_candidate",
      reasonCodes: [],
    };
  }

  if (input.sourceClass === "partial_append_only") {
    return {
      sourceClass: "partial_append_only",
      allowedForHarness: false,
      disposition: "UNSUPPORTED_HISTORICAL_REPLAY",
      reasonCodes: ["UNSUPPORTED_PARTIAL_APPEND_ONLY"],
    };
  }

  return {
    sourceClass: "unsupported_live_canonical",
    allowedForHarness: false,
    disposition: "UNSUPPORTED_HISTORICAL_REPLAY",
    reasonCodes: ["UNSUPPORTED_LIVE_CANONICAL"],
  };
}
