import "server-only";

import {
  createSkuDailyMetricRecomputeExecutor,
  type ClaimedMetricRecompute,
  type MetricRecomputeCompletion,
  type MetricRecomputeQueue,
  type MetricRecomputeRpcClient,
} from "@/lib/persistence/metric-recompute-queue";

/**
 * Explicit approval phrase required for the M5.6E.4 single-grain canary
 * recompute runner. Production workers never set this.
 */
export const M56E4_CANARY_APPROVAL_PHRASE =
  "M5_6E4_CANARY_APPROVED" as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface M56E4ExpectedGrain {
  storeId: string;
  locationId: string;
  variantId: string;
  metricDate: string;
}

export interface M56E4SingleGrainCanaryInput {
  /**
   * Must equal {@link M56E4_CANARY_APPROVAL_PHRASE}.
   */
  approval: string;

  /**
   * Allow-listed canary organization. Rejected when null/blank/non-uuid
   * or when it does not match the claimed grain.
   */
  expectedOrganizationId: string;

  /**
   * Required allow-listed grain. Claimed store/location/variant/date must match.
   */
  expectedGrain: M56E4ExpectedGrain;

  /**
   * Required owner id recorded at claim time.
   */
  expectedOwnerId: string;

  /**
   * Required claim token recorded at claim time.
   */
  expectedClaimToken: string;

  /**
   * Required claimed_generation recorded at claim time.
   */
  expectedClaimedGeneration: number;

  /**
   * Claim returned by org-scoped claim RPC for the canary org only.
   */
  claim: ClaimedMetricRecompute;

  queue: MetricRecomputeQueue;

  /**
   * RPC client used for the frozen M5.5 recompute executor.
   */
  client: MetricRecomputeRpcClient;

  leaseSeconds?: number;
  itemDeadlineMs?: number;
}

export interface M56E4SingleGrainCanaryResult {
  startedAttemptCount: number;
  completion: MetricRecomputeCompletion;
}

function requireUuid(
  label: string,
  value: string | null | undefined,
): string {
  if (value === null || value === undefined) {
    throw new Error(`${label} is required.`);
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    throw new Error(`${label} is required.`);
  }

  if (!UUID_RE.test(trimmed)) {
    throw new Error(`${label} must be a uuid.`);
  }

  return trimmed;
}

function requireNonEmpty(
  label: string,
  value: string | null | undefined,
): string {
  if (value === null || value === undefined || value.trim().length === 0) {
    throw new Error(`${label} is required.`);
  }

  return value.trim();
}

function requireMetricDate(
  label: string,
  value: string,
): string {
  const trimmed = requireNonEmpty(label, value);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error(`${label} must be YYYY-MM-DD.`);
  }

  return trimmed;
}

/**
 * Runs start → frozen recomputeSkuDailyMetric → complete for exactly one
 * claimed canary grain. Rejects missing approval, null/mismatched org/grain/
 * owner/token, or fenced start. Does not call HTTP worker routes.
 */
export async function runM56E4SingleGrainCanaryRecompute(
  input: M56E4SingleGrainCanaryInput,
): Promise<M56E4SingleGrainCanaryResult> {
  if (input.approval !== M56E4_CANARY_APPROVAL_PHRASE) {
    throw new Error(
      "M5.6E.4 canary recompute requires explicit approval.",
    );
  }

  const expectedOrganizationId =
    requireUuid(
      "expectedOrganizationId",
      input.expectedOrganizationId,
    );
  const expectedStoreId =
    requireUuid("expectedGrain.storeId", input.expectedGrain.storeId);
  const expectedLocationId =
    requireUuid("expectedGrain.locationId", input.expectedGrain.locationId);
  const expectedVariantId =
    requireUuid("expectedGrain.variantId", input.expectedGrain.variantId);
  const expectedMetricDate =
    requireMetricDate("expectedGrain.metricDate", input.expectedGrain.metricDate);
  const expectedOwnerId =
    requireNonEmpty("expectedOwnerId", input.expectedOwnerId);
  const expectedClaimToken =
    requireNonEmpty("expectedClaimToken", input.expectedClaimToken);

  if (
    !Number.isInteger(input.expectedClaimedGeneration) ||
    input.expectedClaimedGeneration < 1
  ) {
    throw new Error(
      "expectedClaimedGeneration must be an integer >= 1.",
    );
  }

  const claimOrg =
    requireUuid(
      "claim.organizationId",
      input.claim.organizationId,
    );
  const claimStore =
    requireUuid("claim.storeId", input.claim.storeId);
  const claimLocation =
    requireUuid("claim.locationId", input.claim.locationId);
  const claimVariant =
    requireUuid("claim.variantId", input.claim.variantId);
  const claimMetricDate =
    requireMetricDate("claim.metricDate", input.claim.metricDate);
  const claimOwner =
    requireNonEmpty("claim.ownerId", input.claim.ownerId);
  const claimToken =
    requireNonEmpty("claim.claimToken", input.claim.claimToken);

  if (claimOrg !== expectedOrganizationId) {
    throw new Error(
      "claimed organization does not match expected canary organization.",
    );
  }

  if (
    claimStore !== expectedStoreId ||
    claimLocation !== expectedLocationId ||
    claimVariant !== expectedVariantId ||
    claimMetricDate !== expectedMetricDate
  ) {
    throw new Error(
      "claimed grain does not match expected canary grain.",
    );
  }

  if (claimOwner !== expectedOwnerId) {
    throw new Error(
      "claim owner does not match expected canary owner.",
    );
  }

  if (claimToken !== expectedClaimToken) {
    throw new Error(
      "claim token does not match expected canary claim token.",
    );
  }

  if (
    input.claim.claimedGeneration !==
    input.expectedClaimedGeneration
  ) {
    throw new Error(
      "claim generation does not match expected canary generation.",
    );
  }

  const leaseSeconds =
    input.leaseSeconds ?? 120;
  const itemDeadlineMs =
    input.itemDeadlineMs ?? 40_000;

  const started =
    await input.queue.start(
      input.claim,
      leaseSeconds,
    );

  if (started === null) {
    throw new Error(
      "canary start was fenced; refusing recompute.",
    );
  }

  const execute =
    createSkuDailyMetricRecomputeExecutor(
      input.client,
    );
  const executed =
    await execute(
      input.claim,
      itemDeadlineMs,
    );

  if (!executed.ok) {
    throw new Error(
      `canary recompute failed: ${executed.failure.code}`,
    );
  }

  const completion =
    await input.queue.complete(
      input.claim,
    );

  return {
    startedAttemptCount: started.attemptCount,
    completion,
  };
}
