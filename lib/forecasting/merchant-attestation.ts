import "server-only";

import type { AuthenticatedIdentity } from "@/lib/auth/types";

import type {
  ForecastCoverageLevel,
  ForecastCoverageStream,
  ForecastPromotionEvidenceState,
} from "@/lib/forecasting/evidence";

import {
  createForecastEvidencePersistence,
  ForecastEvidenceDeniedError,
  type ForecastEvidencePersistencePort,
  type InvalidateCoverageEvidenceResult,
  type PersistCoverageEvidenceResult,
  type PersistPromotionEvidenceResult,
} from "@/lib/persistence/forecast-evidence";

import type { TenantContext } from "@/lib/tenancy/types";

/**
 * M6 P2b.2c.1 — server-only authenticated merchant attestation boundary.
 *
 * Actor, org, and store come only from a verified session-bound TenantContext.
 * Trust and closure_id are stamped by persistence/RPCs — never by callers.
 * Complete coverage is merchant-attested day/stream closure confirmation only;
 * it is not provider verification and never follows from sync/CSV success.
 */

const FORBIDDEN_COMMAND_KEYS = new Set([
  "trust",
  "organizationId",
  "storeId",
  "actorUserId",
  "userId",
  "role",
  "integrationId",
  "provider",
  "closureId",
  "closure",
  "source",
  "syncRunStatus",
  "syncRunId",
  "trustedCompleteDates",
  "discountAmount",
  "assertDayStreamClosed",
]);

/**
 * Optional grain narrowing. Callers must already authorize the location/variant
 * against the same store as TenantContext.storeId before passing this object.
 * Raw client location/variant without authorizedStoreId is rejected.
 */
export interface MerchantAttestationNarrowing {
  readonly authorizedStoreId: string;
  readonly locationId?: string | null;
  readonly variantId?: string | null;
}

export interface MerchantPromotionAttestationCommand {
  readonly localDate: string;
  readonly state: ForecastPromotionEvidenceState;
  readonly observedAt: string;
  readonly idempotencyKey: string;
  readonly version?: number;
  readonly supersedesEvidenceId?: string | null;
  readonly narrowing?: MerchantAttestationNarrowing;
}

export interface MerchantCoverageAttestationCommand {
  readonly localDate: string;
  readonly stream: ForecastCoverageStream;
  /**
   * Separate per-stream claim. `complete` requires confirmDayStreamClosed.
   */
  readonly coverage: ForecastCoverageLevel;
  readonly observedAt: string;
  readonly asOf: string;
  readonly idempotencyKey: string;
  readonly version?: number;
  readonly supersedesEvidenceId?: string | null;
  /**
   * Explicit merchant confirmation that this day/stream is closed.
   * Required for coverage=complete. Must be the literal true when set.
   * Does not accept a client-supplied closure id.
   */
  readonly confirmDayStreamClosed?: true;
  readonly narrowing?: MerchantAttestationNarrowing;
}

export interface MerchantInvalidateCoverageCommand {
  readonly evidenceId: string;
  readonly invalidatedAt: string;
  readonly lateEventObservedAt: string;
}

export type MerchantForecastAttestationPort = {
  attestPromotion(
    command: MerchantPromotionAttestationCommand,
  ): Promise<PersistPromotionEvidenceResult>;

  attestCoverage(
    command: MerchantCoverageAttestationCommand,
  ): Promise<PersistCoverageEvidenceResult>;

  invalidateCoverage(
    command: MerchantInvalidateCoverageCommand,
  ): Promise<InvalidateCoverageEvidenceResult>;
};

function rejectForbiddenCommandKeys(
  command: object,
  label: string,
): void {
  for (const key of Object.keys(command)) {
    if (FORBIDDEN_COMMAND_KEYS.has(key)) {
      throw new ForecastEvidenceDeniedError(
        `${label} must not include client-supplied "${key}".`,
      );
    }
  }
}

function assertIdentity(value: string, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ForecastEvidenceDeniedError(`${field} is required.`);
  }

  return value.trim();
}

/**
 * Bind verified session identity to an already-resolved TenantContext.
 * Actor is taken only from this binding — never from command input.
 */
export function bindMerchantAttestationTenant(
  identity: AuthenticatedIdentity,
  tenant: TenantContext,
): TenantContext & { storeId: string } {
  const sessionUserId = assertIdentity(identity.userId, "session.userId");
  const tenantUserId = assertIdentity(tenant.userId, "tenant.userId");

  if (sessionUserId !== tenantUserId) {
    throw new ForecastEvidenceDeniedError(
      "Authenticated session identity does not match TenantContext actor.",
    );
  }

  assertIdentity(tenant.organizationId, "organizationId");

  if (tenant.storeId === null) {
    throw new ForecastEvidenceDeniedError(
      "Merchant attestation requires an authorized store on TenantContext.",
    );
  }

  const storeId = assertIdentity(tenant.storeId, "storeId");

  if (tenant.role !== "owner" && tenant.role !== "admin") {
    throw new ForecastEvidenceDeniedError(
      `Merchant attestation requires owner or admin; received "${tenant.role}".`,
    );
  }

  return {
    userId: sessionUserId,
    organizationId: tenant.organizationId,
    role: tenant.role,
    storeId,
  };
}

function resolveNarrowing(
  tenantStoreId: string,
  narrowing: MerchantAttestationNarrowing | undefined,
  label: string,
): { locationId: string | null; variantId: string | null } {
  if (narrowing === undefined) {
    return { locationId: null, variantId: null };
  }

  rejectForbiddenCommandKeys(narrowing, `${label} narrowing`);

  const authorizedStoreId = assertIdentity(
    narrowing.authorizedStoreId,
    "authorizedStoreId",
  );

  if (authorizedStoreId !== tenantStoreId) {
    throw new ForecastEvidenceDeniedError(
      "Narrowing scope is not authorized for the TenantContext store.",
    );
  }

  const locationId =
    narrowing.locationId === undefined || narrowing.locationId === null
      ? null
      : assertIdentity(narrowing.locationId, "locationId");

  const variantId =
    narrowing.variantId === undefined || narrowing.variantId === null
      ? null
      : assertIdentity(narrowing.variantId, "variantId");

  if (locationId === null && variantId === null) {
    throw new ForecastEvidenceDeniedError(
      "Narrowing must explicitly include locationId and/or variantId.",
    );
  }

  return { locationId, variantId };
}

export function createMerchantForecastAttestation(
  identity: AuthenticatedIdentity,
  tenant: TenantContext,
  persistence: ForecastEvidencePersistencePort = createForecastEvidencePersistence(),
): MerchantForecastAttestationPort {
  const bound = bindMerchantAttestationTenant(identity, tenant);

  return {
    async attestPromotion(command) {
      rejectForbiddenCommandKeys(command, "Promotion attestation command");

      if (command.state !== "none" && command.state !== "promotion") {
        throw new ForecastEvidenceDeniedError(
          "promotion state must be none or promotion.",
        );
      }

      const grain = resolveNarrowing(
        bound.storeId,
        command.narrowing,
        "Promotion attestation",
      );

      return persistence.issueMerchantAttestationPromotion(bound, {
        localDate: command.localDate,
        state: command.state,
        observedAt: command.observedAt,
        idempotencyKey: command.idempotencyKey,
        version: command.version,
        supersedesEvidenceId: command.supersedesEvidenceId,
        locationId: grain.locationId,
        variantId: grain.variantId,
      });
    },

    async attestCoverage(command) {
      rejectForbiddenCommandKeys(command, "Coverage attestation command");

      if (command.stream !== "orders" && command.stream !== "returns") {
        throw new ForecastEvidenceDeniedError(
          "coverage stream must be orders or returns.",
        );
      }

      if (command.coverage !== "complete" && command.coverage !== "partial") {
        throw new ForecastEvidenceDeniedError(
          "coverage level must be complete or partial.",
        );
      }

      if (
        command.coverage === "complete" &&
        command.confirmDayStreamClosed !== true
      ) {
        throw new ForecastEvidenceDeniedError(
          "merchant coverage=complete requires explicit day/stream closure confirmation.",
        );
      }

      if (
        command.coverage === "partial" &&
        command.confirmDayStreamClosed === true
      ) {
        throw new ForecastEvidenceDeniedError(
          "partial coverage must not confirm day/stream closure.",
        );
      }

      const grain = resolveNarrowing(
        bound.storeId,
        command.narrowing,
        "Coverage attestation",
      );

      return persistence.issueMerchantAttestationCoverage(bound, {
        localDate: command.localDate,
        stream: command.stream,
        coverage: command.coverage,
        observedAt: command.observedAt,
        asOf: command.asOf,
        idempotencyKey: command.idempotencyKey,
        version: command.version,
        supersedesEvidenceId: command.supersedesEvidenceId,
        locationId: grain.locationId,
        variantId: grain.variantId,
        assertDayStreamClosed: command.confirmDayStreamClosed === true,
      });
    },

    async invalidateCoverage(command) {
      rejectForbiddenCommandKeys(command, "Coverage invalidation command");

      return persistence.invalidateCoverageWithMerchant(bound, {
        evidenceId: command.evidenceId,
        invalidatedAt: command.invalidatedAt,
        lateEventObservedAt: command.lateEventObservedAt,
      });
    },
  };
}
