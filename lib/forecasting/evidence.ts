import {
  assertForecastDate,
  type ForecastGrain,
} from "./series";

import type { PromotionState } from "./types";

/**
 * Pure M6 forecast evidence contracts and resolvers.
 *
 * Provider-independent: no CSV/Shopify/DB.
 *
 * External verification boundary:
 * `trust` is an assertion from an upstream verifier (integration sync that
 * already authenticated the provider, or an explicitly verified merchant
 * attestation workflow). This module does not verify provenance, signatures,
 * or CSV authenticity. Setting `trusted_provider` /
 * `verified_merchant_attestation` on unverified or raw CSV claims is a
 * caller/contract violation outside this pure layer — unknown labels are
 * rejected here; accepted labels are trusted only because the caller already
 * verified them externally.
 *
 * Missing, conflicting, stale, partial, or untrusted evidence resolves
 * fail-closed (promotion unknown / coverage incomplete / throw on bad trust).
 */

export const FORECAST_EVIDENCE_TRUST = [
  "trusted_provider",
  "verified_merchant_attestation",
] as const;

export type ForecastEvidenceTrust =
  (typeof FORECAST_EVIDENCE_TRUST)[number];

export type ForecastPromotionEvidenceState = "none" | "promotion";

export type ForecastCoverageStream = "orders" | "returns";

export type ForecastCoverageLevel = "complete" | "partial";

export interface CommerceDayPromotionEvidence {
  evidenceId: string;
  organizationId: string;
  storeId: string;
  /**
   * null = store-wide. Non-null narrows to that location.
   */
  locationId: string | null;
  /**
   * null = all variants in the chosen location/store scope.
   * Non-null narrows to that variant.
   */
  variantId: string | null;
  localDate: string;
  state: ForecastPromotionEvidenceState;
  trust: ForecastEvidenceTrust;
  source: string;
  observedAt: string;
  version: number;
  invalidatedAt: string | null;
  supersedesEvidenceId: string | null;
}

export interface CommerceDayCoverageEvidence {
  evidenceId: string;
  organizationId: string;
  storeId: string;
  locationId: string | null;
  variantId: string | null;
  localDate: string;
  stream: ForecastCoverageStream;
  coverage: ForecastCoverageLevel;
  trust: ForecastEvidenceTrust;
  source: string;
  /**
   * Watermark: commerce events for this local day observed after asOf
   * invalidate the coverage claim (late correction).
   */
  asOf: string;
  observedAt: string;
  version: number;
  invalidatedAt: string | null;
  supersedesEvidenceId: string | null;
}

export interface ResolvePromotionStateArgs {
  grain: ForecastGrain;
  localDate: string;
  evidence: readonly CommerceDayPromotionEvidence[];
}

export interface CommerceDayEventWatermark {
  organizationId: string;
  storeId: string;
  locationId: string | null;
  variantId: string;
  localDate: string;
  observedAt: string;
  stream: ForecastCoverageStream;
}

export interface ResolveDayCoverageArgs {
  grain: ForecastGrain;
  localDate: string;
  evidence: readonly CommerceDayCoverageEvidence[];
  /**
   * Commerce events already attributed to this grain/day.
   * Any event with observedAt > active coverage asOf invalidates that stream.
   */
  dayEvents?: readonly CommerceDayEventWatermark[];
}

const TRUSTED = new Set<string>(FORECAST_EVIDENCE_TRUST);

function assertIdentity(value: string, field: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} is required.`);
  }
}

function assertInstant(value: string, field: string): void {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new Error(`${field} must be a valid UTC instant.`);
  }
}

function assertTrust(trust: string): trust is ForecastEvidenceTrust {
  return TRUSTED.has(trust);
}

function assertVersion(version: number): void {
  if (!Number.isInteger(version) || version < 1) {
    throw new Error("evidence version must be an integer >= 1.");
  }
}

function scopeApplies(
  evidence: {
    locationId: string | null;
    variantId: string | null;
  },
  grain: ForecastGrain,
): boolean {
  if (
    evidence.locationId !== null &&
    evidence.locationId !== grain.locationId
  ) {
    return false;
  }

  if (
    evidence.variantId !== null &&
    evidence.variantId !== grain.variantId
  ) {
    return false;
  }

  return true;
}

function specificityScore(evidence: {
  locationId: string | null;
  variantId: string | null;
}): number {
  return (
    (evidence.locationId === null ? 0 : 1) +
    (evidence.variantId === null ? 0 : 1)
  );
}

function samePromotionEvidence(
  left: CommerceDayPromotionEvidence,
  right: CommerceDayPromotionEvidence,
): boolean {
  return (
    left.organizationId === right.organizationId &&
    left.storeId === right.storeId &&
    left.locationId === right.locationId &&
    left.variantId === right.variantId &&
    left.localDate === right.localDate &&
    left.state === right.state &&
    left.trust === right.trust &&
    left.source === right.source &&
    left.observedAt === right.observedAt &&
    left.version === right.version &&
    left.invalidatedAt === right.invalidatedAt &&
    left.supersedesEvidenceId === right.supersedesEvidenceId
  );
}

function sameCoverageEvidence(
  left: CommerceDayCoverageEvidence,
  right: CommerceDayCoverageEvidence,
): boolean {
  return (
    left.organizationId === right.organizationId &&
    left.storeId === right.storeId &&
    left.locationId === right.locationId &&
    left.variantId === right.variantId &&
    left.localDate === right.localDate &&
    left.stream === right.stream &&
    left.coverage === right.coverage &&
    left.trust === right.trust &&
    left.source === right.source &&
    left.asOf === right.asOf &&
    left.observedAt === right.observedAt &&
    left.version === right.version &&
    left.invalidatedAt === right.invalidatedAt &&
    left.supersedesEvidenceId === right.supersedesEvidenceId
  );
}

function canonicalizeById<T extends { evidenceId: string }>(
  rows: readonly T[],
  sameEvidence: (left: T, right: T) => boolean,
  conflictMessage: string,
): T[] {
  const byId = new Map<string, T>();

  for (const row of rows) {
    assertIdentity(row.evidenceId, "evidenceId");

    const existing = byId.get(row.evidenceId);

    if (existing === undefined) {
      byId.set(row.evidenceId, row);
      continue;
    }

    if (!sameEvidence(existing, row)) {
      throw new Error(conflictMessage);
    }
  }

  return [...byId.values()].sort((left, right) =>
    left.evidenceId.localeCompare(right.evidenceId),
  );
}

function dropSupersededAndInvalidated<
  T extends {
    evidenceId: string;
    invalidatedAt: string | null;
    supersedesEvidenceId: string | null;
    version: number;
    observedAt: string;
  },
>(rows: readonly T[]): T[] {
  const superseded = new Set<string>();

  for (const row of rows) {
    if (row.supersedesEvidenceId !== null) {
      superseded.add(row.supersedesEvidenceId);
    }
  }

  return rows.filter(
    (row) =>
      row.invalidatedAt === null && !superseded.has(row.evidenceId),
  );
}

function validatePromotionRow(row: CommerceDayPromotionEvidence): void {
  assertIdentity(row.organizationId, "organizationId");
  assertIdentity(row.storeId, "storeId");
  assertForecastDate(row.localDate, "localDate");
  assertIdentity(row.source, "source");
  assertInstant(row.observedAt, "observedAt");
  assertVersion(row.version);

  if (row.state !== "none" && row.state !== "promotion") {
    throw new Error("promotion evidence state must be none or promotion.");
  }

  if (!assertTrust(row.trust)) {
    throw new Error("promotion evidence trust is not accepted.");
  }

  if (row.invalidatedAt !== null) {
    assertInstant(row.invalidatedAt, "invalidatedAt");
  }

  if (
    row.supersedesEvidenceId !== null &&
    row.supersedesEvidenceId.trim().length === 0
  ) {
    throw new Error("supersedesEvidenceId must be non-empty when set.");
  }
}

function validateCoverageRow(row: CommerceDayCoverageEvidence): void {
  assertIdentity(row.organizationId, "organizationId");
  assertIdentity(row.storeId, "storeId");
  assertForecastDate(row.localDate, "localDate");
  assertIdentity(row.source, "source");
  assertInstant(row.asOf, "asOf");
  assertInstant(row.observedAt, "observedAt");
  assertVersion(row.version);

  if (row.stream !== "orders" && row.stream !== "returns") {
    throw new Error("coverage stream must be orders or returns.");
  }

  if (row.coverage !== "complete" && row.coverage !== "partial") {
    throw new Error("coverage level must be complete or partial.");
  }

  if (!assertTrust(row.trust)) {
    throw new Error("coverage evidence trust is not accepted.");
  }

  if (row.invalidatedAt !== null) {
    assertInstant(row.invalidatedAt, "invalidatedAt");
  }

  if (
    row.supersedesEvidenceId !== null &&
    row.supersedesEvidenceId.trim().length === 0
  ) {
    throw new Error("supersedesEvidenceId must be non-empty when set.");
  }
}

/**
 * Resolves promotionState for one grain/day.
 * Absence, conflict, stale/superseded-only, or untrusted-only → unknown.
 * Cross-tenant / out-of-scope rows are ignored (do not apply).
 */
export function resolvePromotionState(
  input: ResolvePromotionStateArgs,
): PromotionState {
  assertIdentity(input.grain.organizationId, "organizationId");
  assertIdentity(input.grain.storeId, "storeId");
  assertIdentity(input.grain.locationId, "locationId");
  assertIdentity(input.grain.variantId, "variantId");
  assertForecastDate(input.localDate, "localDate");

  const canonical = canonicalizeById(
    input.evidence,
    samePromotionEvidence,
    "duplicate promotion evidence identity has conflicting payload.",
  );

  for (const row of canonical) {
    validatePromotionRow(row);
  }

  const active = dropSupersededAndInvalidated(canonical).filter(
    (row) =>
      row.organizationId === input.grain.organizationId &&
      row.storeId === input.grain.storeId &&
      row.localDate === input.localDate &&
      scopeApplies(row, input.grain),
  );

  if (active.length === 0) {
    return "unknown";
  }

  // Prefer most specific applicable rows. If top specificity conflicts, unknown.
  const maxSpecificity = Math.max(
    ...active.map((row) => specificityScore(row)),
  );
  const top = active.filter(
    (row) => specificityScore(row) === maxSpecificity,
  );

  const states = new Set(top.map((row) => row.state));

  if (states.size !== 1) {
    return "unknown";
  }

  // Broader evidence must not conflict with the chosen specific state.
  const chosen = top[0]!.state;

  for (const row of active) {
    if (row.state !== chosen) {
      return "unknown";
    }
  }

  return chosen;
}

function streamIsComplete(
  stream: ForecastCoverageStream,
  input: ResolveDayCoverageArgs,
  active: readonly CommerceDayCoverageEvidence[],
): boolean {
  const forStream = active.filter((row) => row.stream === stream);

  if (forStream.length === 0) {
    return false;
  }

  const maxSpecificity = Math.max(
    ...forStream.map((row) => specificityScore(row)),
  );
  const top = forStream.filter(
    (row) => specificityScore(row) === maxSpecificity,
  );

  if (top.some((row) => row.coverage === "partial")) {
    return false;
  }

  if (top.some((row) => row.coverage !== "complete")) {
    return false;
  }

  // Conflicting watermarks / sources at same specificity: require agreement
  // that every top row is complete (already) and use the earliest asOf so
  // any late event against the strictest watermark fails closed.
  const asOf = top
    .map((row) => row.asOf)
    .sort((left, right) => left.localeCompare(right))[0]!;

  const asOfMs = Date.parse(asOf);

  const late = (input.dayEvents ?? []).some((event) => {
    if (
      event.organizationId !== input.grain.organizationId ||
      event.storeId !== input.grain.storeId ||
      event.variantId !== input.grain.variantId ||
      (event.locationId !== null &&
        event.locationId !== input.grain.locationId) ||
      event.localDate !== input.localDate ||
      event.stream !== stream
    ) {
      return false;
    }

    const eventMs = Date.parse(event.observedAt);

    if (Number.isNaN(eventMs)) {
      throw new Error(
        "commerce day event observedAt must be a valid UTC instant.",
      );
    }

    return eventMs > asOfMs;
  });

  if (late) {
    return false;
  }

  // Broader incomplete/partial must not silently be ignored when it
  // applies and conflicts with a complete claim.
  for (const row of forStream) {
    if (row.coverage === "partial") {
      return false;
    }
  }

  return true;
}

/**
 * True only when trusted complete coverage exists for both orders and
 * returns streams for the grain/day, with no late corrections past asOf.
 */
export function resolveDayDataComplete(
  input: ResolveDayCoverageArgs,
): boolean {
  assertIdentity(input.grain.organizationId, "organizationId");
  assertIdentity(input.grain.storeId, "storeId");
  assertIdentity(input.grain.locationId, "locationId");
  assertIdentity(input.grain.variantId, "variantId");
  assertForecastDate(input.localDate, "localDate");

  const canonical = canonicalizeById(
    input.evidence,
    sameCoverageEvidence,
    "duplicate coverage evidence identity has conflicting payload.",
  );

  for (const row of canonical) {
    validateCoverageRow(row);
  }

  const active = dropSupersededAndInvalidated(canonical).filter(
    (row) =>
      row.organizationId === input.grain.organizationId &&
      row.storeId === input.grain.storeId &&
      row.localDate === input.localDate &&
      scopeApplies(row, input.grain),
  );

  if (active.length === 0) {
    return false;
  }

  return (
    streamIsComplete("orders", input, active) &&
    streamIsComplete("returns", input, active)
  );
}

/**
 * Whether any coverage claim targets this grain/day (including partial,
 * invalidated, superseded, or untrusted rows). Used by the commerce adapter
 * so trustedCompleteDates cannot override an attempted coverage path.
 * Untrusted labels are rejected when resolveDayDataComplete runs.
 */
export function hasApplicableCoverageEvidence(
  grain: ForecastGrain,
  localDate: string,
  evidence: readonly CommerceDayCoverageEvidence[],
): boolean {
  assertForecastDate(localDate, "localDate");

  return evidence.some(
    (row) =>
      row.organizationId === grain.organizationId &&
      row.storeId === grain.storeId &&
      row.localDate === localDate &&
      scopeApplies(row, grain),
  );
}
