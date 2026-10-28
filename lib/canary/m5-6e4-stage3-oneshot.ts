import "server-only";

import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

import {
  M56E4_CANARY_APPROVAL_PHRASE,
  runM56E4SingleGrainCanaryRecompute,
} from "@/lib/canary/m5-6e4-single-grain-recompute";

import {
  assertM56E4HostedServiceRoleKey,
  assertM56E4HostedSupabaseUrl,
  M56E4_HOSTED_SERVICE_ROLE_ENV,
  M56E4_HOSTED_URL_ENV,
  redactSecretMeta,
} from "@/lib/canary/m5-6e4-hosted-target";

import {
  createMetricRecomputeQueue,
  type ClaimedMetricRecompute,
  type MetricRecomputeRpcClient,
} from "@/lib/persistence/metric-recompute-queue";

/**
 * One-shot Stage 3 hosted entrypoint.
 *
 * - Pins Supabase URL to project qlsqminsfdntpqdkhxjx
 * - Reads credentials only from M56E4_HOSTED_* env (not .env.local)
 * - Verifies canary org + full grain + owner + token + generation
 * - Refuses expired / revoked leases for execute
 * - Preflight path is SELECT-only (no start/complete/recover/claim/recompute)
 * - Never calls HTTP worker routes or enables workers
 */

/** Must match tests/support/m5-6e4-canary-fixture.ts */
export const M56E4_STAGE3_CANARY_ORG =
  "e46e4000-0000-4000-8000-000000000001" as const;
export const M56E4_STAGE3_CANARY_STORE =
  "e46e4000-0000-4000-8000-000000000002" as const;
export const M56E4_STAGE3_CANARY_LOCATION =
  "e46e4000-0000-4000-8000-000000000003" as const;
export const M56E4_STAGE3_CANARY_VARIANT =
  "e46e4000-0000-4000-8000-000000000005" as const;
export const M56E4_STAGE3_CANARY_METRIC_DATE =
  "2026-06-15" as const;
export const M56E4_STAGE3_ALGORITHM =
  "m5-derived-metrics-v1" as const;

export const M56E4_HOSTED_CANARY_OWNER =
  "m56e4-hosted-canary" as const;

/** Extra phrase required for Stage 3 mutate path (beyond canary approval). */
export const M56E4_STAGE3_EXECUTE_APPROVAL_PHRASE =
  "STAGE3_EXECUTE_APPROVED" as const;

/** Vitest / overall preflight wall clock (hosted SELECT + verify). */
export const M56E4_STAGE3_PREFLIGHT_TIMEOUT_MS = 30_000;

/** Per-request network timeout for Supabase fetch. */
export const M56E4_STAGE3_NETWORK_TIMEOUT_MS = 10_000;

export type M56E4Stage3Mode = "preflight" | "execute";

export interface M56E4Stage3OneshotEnv {
  [key: string]: string | undefined;
}

export interface M56E4CanaryRequestRow {
  organization_id: string;
  store_id: string;
  location_id: string;
  variant_id: string;
  metric_date: string;
  algorithm_version: string;
  status: string;
  lease_owner_id: string | null;
  lease_claim_token: string | null;
  claimed_generation: number | null;
  attempt_count: number;
  lease_expires_at: string | null;
}

export interface M56E4Stage3PreflightResult {
  mode: M56E4Stage3Mode;
  supabaseUrl: string;
  serviceRole: { present: true; length: number };
  /**
   * Request row with lease_claim_token stripped — never return the raw token
   * from preflight APIs used for logging.
   */
  request: Omit<M56E4CanaryRequestRow, "lease_claim_token"> & {
    lease_claim_token: null;
  };
  claim: ClaimedMetricRecompute;
  leaseExpired: boolean;
  readyToExecute: boolean;
}

function requireEnv(
  env: M56E4Stage3OneshotEnv,
  name: string,
): string {
  const value = env[name];

  if (value === undefined || value.trim().length === 0) {
    throw new Error(`${name} is required.`);
  }

  return value.trim();
}

function parseMode(
  env: M56E4Stage3OneshotEnv,
): M56E4Stage3Mode {
  const raw = (env.M56E4_STAGE3_MODE ?? "preflight").trim();

  if (raw !== "preflight" && raw !== "execute") {
    throw new Error(
      'M56E4_STAGE3_MODE must be "preflight" or "execute".',
    );
  }

  return raw;
}

function parseGeneration(
  env: M56E4Stage3OneshotEnv,
): number {
  const raw = requireEnv(env, "M56E4_CLAIMED_GENERATION");
  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(
      "M56E4_CLAIMED_GENERATION must be an integer >= 1.",
    );
  }

  return parsed;
}

function parseNow(
  env: M56E4Stage3OneshotEnv,
): Date {
  const raw = env.M56E4_NOW_ISO?.trim();

  if (raw === undefined || raw.length === 0) {
    return new Date();
  }

  const parsed = new Date(raw);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error("M56E4_NOW_ISO must be a valid ISO timestamp.");
  }

  return parsed;
}

function parsePositiveInt(
  raw: string | undefined,
  fallback: number,
  label: string,
  minimum: number,
): number {
  if (raw === undefined || raw.trim().length === 0) {
    return fallback;
  }

  const parsed = Number(raw.trim());

  if (!Number.isInteger(parsed) || parsed < minimum) {
    throw new Error(`${label} must be an integer >= ${minimum}.`);
  }

  return parsed;
}

/**
 * Strip JWTs / long secrets from error text so timeouts and PostgREST
 * failures never echo service_role keys or claim tokens.
 */
export function sanitizeM56E4Stage3ErrorMessage(
  message: string,
): string {
  return message
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]*/g, "[redacted-jwt]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[redacted-uuid]")
    .replace(/service[-_]?role[^\s]*/gi, "[redacted-service-role]")
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, "[redacted-secret]");
}

export function throwSafeStage3Error(
  message: string,
): never {
  throw new Error(sanitizeM56E4Stage3ErrorMessage(message));
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new Error(
              `${label} timed out after ${timeoutMs}ms.`,
            ),
          );
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

export function createTimedFetch(
  timeoutMs: number,
  baseFetch: typeof fetch = fetch,
): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController();
    const upstream = init?.signal;

    const onAbort = () => {
      controller.abort();
    };

    if (upstream) {
      if (upstream.aborted) {
        controller.abort();
      } else {
        upstream.addEventListener("abort", onAbort, { once: true });
      }
    }

    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      return await baseFetch(input, {
        ...init,
        signal: controller.signal,
      });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === "AbortError" ||
          error.message.toLowerCase().includes("abort"))
      ) {
        throwSafeStage3Error(
          `hosted Supabase request timed out after ${timeoutMs}ms.`,
        );
      }

      throwSafeStage3Error(
        error instanceof Error
          ? error.message
          : "hosted Supabase request failed.",
      );
    } finally {
      clearTimeout(timer);
      upstream?.removeEventListener("abort", onAbort);
    }
  };
}

export function createM56E4HostedAdminClient(
  supabaseUrl: string,
  serviceRoleKey: string,
  networkTimeoutMs: number = M56E4_STAGE3_NETWORK_TIMEOUT_MS,
): SupabaseClient {
  return createClient(
    supabaseUrl,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        fetch: createTimedFetch(networkTimeoutMs),
      },
    },
  );
}

export type M56E4RequestSelectClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => M56E4RequestSelectFilter;
    };
  };
};

type M56E4RequestSelectFilter = {
  eq: (column: string, value: string) => M56E4RequestSelectFilter;
  maybeSingle: () => Promise<{
    data: M56E4CanaryRequestRow | null;
    error: { message: string } | null;
  }>;
};

export async function loadCanaryRequestRow(
  client: M56E4RequestSelectClient,
): Promise<M56E4CanaryRequestRow> {
  const { data, error } = await client
    .from("sku_daily_metric_recompute_requests")
    .select(
      [
        "organization_id",
        "store_id",
        "location_id",
        "variant_id",
        "metric_date",
        "algorithm_version",
        "status",
        "lease_owner_id",
        "lease_claim_token",
        "claimed_generation",
        "attempt_count",
        "lease_expires_at",
      ].join(","),
    )
    .eq("organization_id", M56E4_STAGE3_CANARY_ORG)
    .eq("store_id", M56E4_STAGE3_CANARY_STORE)
    .eq("location_id", M56E4_STAGE3_CANARY_LOCATION)
    .eq("variant_id", M56E4_STAGE3_CANARY_VARIANT)
    .eq("metric_date", M56E4_STAGE3_CANARY_METRIC_DATE)
    .eq("algorithm_version", M56E4_STAGE3_ALGORITHM)
    .maybeSingle();

  if (error) {
    throwSafeStage3Error(
      `canary request SELECT failed: ${error.message}`,
    );
  }

  if (data === null) {
    throw new Error(
      "canary recompute request row not found for expected grain.",
    );
  }

  return data;
}

function assertClaimTokenNotRevoked(
  env: M56E4Stage3OneshotEnv,
  claimToken: string,
): void {
  const raw = env.M56E4_REVOKED_CLAIM_TOKENS?.trim();

  if (raw === undefined || raw.length === 0) {
    return;
  }

  const revoked = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (revoked.includes(claimToken)) {
    throw new Error(
      "claim token is revoked; org-scoped recover and reclaim required before Stage 3.",
    );
  }
}

export function assertCanaryRequestMatchesExpectations(
  row: M56E4CanaryRequestRow,
  expected: {
    ownerId: string;
    claimToken: string;
    claimedGeneration: number;
    now: Date;
  },
): {
  claim: ClaimedMetricRecompute;
  leaseExpired: boolean;
} {
  if (row.organization_id !== M56E4_STAGE3_CANARY_ORG) {
    throw new Error(
      "request organization_id does not match canary org.",
    );
  }

  if (
    row.store_id !== M56E4_STAGE3_CANARY_STORE ||
    row.location_id !== M56E4_STAGE3_CANARY_LOCATION ||
    row.variant_id !== M56E4_STAGE3_CANARY_VARIANT ||
    row.metric_date !== M56E4_STAGE3_CANARY_METRIC_DATE
  ) {
    throw new Error(
      "request grain does not match expected canary grain.",
    );
  }

  if (row.algorithm_version !== M56E4_STAGE3_ALGORITHM) {
    throw new Error(
      "request algorithm_version does not match canary algorithm.",
    );
  }

  if (row.status !== "claimed") {
    throw new Error(
      `request status must be claimed (got ${row.status}).`,
    );
  }

  if (row.lease_owner_id !== expected.ownerId) {
    throw new Error(
      "request lease_owner_id does not match expected owner.",
    );
  }

  if (
    row.lease_claim_token === null ||
    row.lease_claim_token !== expected.claimToken
  ) {
    // Never echo either token value.
    throw new Error(
      "request lease_claim_token does not match expected claim token.",
    );
  }

  if (row.claimed_generation !== expected.claimedGeneration) {
    throw new Error(
      "request claimed_generation does not match expected generation.",
    );
  }

  if (
    row.lease_expires_at === null ||
    row.lease_expires_at.trim().length === 0
  ) {
    throw new Error("request lease_expires_at is required.");
  }

  const leaseExpiresAt = new Date(row.lease_expires_at);

  if (Number.isNaN(leaseExpiresAt.getTime())) {
    throw new Error("request lease_expires_at is not a valid timestamp.");
  }

  const leaseExpired = leaseExpiresAt.getTime() <= expected.now.getTime();

  const claim: ClaimedMetricRecompute = {
    organizationId: row.organization_id,
    storeId: row.store_id,
    locationId: row.location_id,
    variantId: row.variant_id,
    metricDate: row.metric_date,
    algorithmVersion: row.algorithm_version,
    ownerId: expected.ownerId,
    claimToken: expected.claimToken,
    claimedGeneration: expected.claimedGeneration,
    attemptCount: row.attempt_count,
    leaseExpiresAt: row.lease_expires_at,
  };

  return { claim, leaseExpired };
}

function redactRequestRow(
  row: M56E4CanaryRequestRow,
): M56E4Stage3PreflightResult["request"] {
  return {
    organization_id: row.organization_id,
    store_id: row.store_id,
    location_id: row.location_id,
    variant_id: row.variant_id,
    metric_date: row.metric_date,
    algorithm_version: row.algorithm_version,
    status: row.status,
    lease_owner_id: row.lease_owner_id,
    lease_claim_token: null,
    claimed_generation: row.claimed_generation,
    attempt_count: row.attempt_count,
    lease_expires_at: row.lease_expires_at,
  };
}

/**
 * Build credentials + expectations from env. Does not touch .env.local.
 * Intentionally ignores NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.
 */
export function resolveM56E4Stage3Credentials(
  env: M56E4Stage3OneshotEnv,
): {
  mode: M56E4Stage3Mode;
  supabaseUrl: string;
  serviceRoleKey: string;
  approval: string;
  ownerId: string;
  claimToken: string;
  claimedGeneration: number;
  now: Date;
  leaseSeconds: number;
  itemDeadlineMs: number;
  preflightTimeoutMs: number;
  networkTimeoutMs: number;
} {
  const supabaseUrl =
    assertM56E4HostedSupabaseUrl(env[M56E4_HOSTED_URL_ENV]);
  const serviceRoleKey =
    assertM56E4HostedServiceRoleKey(env[M56E4_HOSTED_SERVICE_ROLE_ENV]);
  const approval = requireEnv(env, "M56E4_CANARY_APPROVAL");
  const ownerId = requireEnv(env, "M56E4_EXPECTED_OWNER");
  const claimToken = requireEnv(env, "M56E4_CLAIM_TOKEN");
  const claimedGeneration = parseGeneration(env);
  const mode = parseMode(env);
  const now = parseNow(env);

  assertClaimTokenNotRevoked(env, claimToken);

  if (approval !== M56E4_CANARY_APPROVAL_PHRASE) {
    throw new Error(
      "M56E4_CANARY_APPROVAL must equal M5_6E4_CANARY_APPROVED.",
    );
  }

  if (ownerId !== M56E4_HOSTED_CANARY_OWNER) {
    throw new Error(
      `M56E4_EXPECTED_OWNER must equal ${M56E4_HOSTED_CANARY_OWNER}.`,
    );
  }

  const leaseSeconds = parsePositiveInt(
    env.M56E4_LEASE_SECONDS,
    120,
    "M56E4_LEASE_SECONDS",
    30,
  );
  const itemDeadlineMs = parsePositiveInt(
    env.M56E4_ITEM_DEADLINE_MS,
    40_000,
    "M56E4_ITEM_DEADLINE_MS",
    1_000,
  );
  const preflightTimeoutMs = parsePositiveInt(
    env.M56E4_PREFLIGHT_TIMEOUT_MS,
    M56E4_STAGE3_PREFLIGHT_TIMEOUT_MS,
    "M56E4_PREFLIGHT_TIMEOUT_MS",
    1_000,
  );
  const networkTimeoutMs = parsePositiveInt(
    env.M56E4_NETWORK_TIMEOUT_MS,
    M56E4_STAGE3_NETWORK_TIMEOUT_MS,
    "M56E4_NETWORK_TIMEOUT_MS",
    1_000,
  );

  return {
    mode,
    supabaseUrl,
    serviceRoleKey,
    approval,
    ownerId,
    claimToken,
    claimedGeneration,
    now,
    leaseSeconds,
    itemDeadlineMs,
    preflightTimeoutMs,
    networkTimeoutMs,
  };
}

function assertExecuteApprovals(
  env: M56E4Stage3OneshotEnv,
): void {
  const executeOk = env.M56E4_STAGE3_EXECUTE_OK?.trim();

  if (executeOk !== M56E4_STAGE3_EXECUTE_APPROVAL_PHRASE) {
    throw new Error(
      'Stage 3 execute requires M56E4_STAGE3_EXECUTE_OK=STAGE3_EXECUTE_APPROVED.',
    );
  }
}

export async function preflightM56E4Stage3Oneshot(
  env: M56E4Stage3OneshotEnv,
  deps?: {
    loadRow?: (
      client: M56E4RequestSelectClient,
    ) => Promise<M56E4CanaryRequestRow>;
    createClient?: (
      url: string,
      key: string,
      networkTimeoutMs: number,
    ) => SupabaseClient;
  },
): Promise<M56E4Stage3PreflightResult> {
  const resolved = resolveM56E4Stage3Credentials(env);

  const run = async (): Promise<M56E4Stage3PreflightResult> => {
    const client =
      (deps?.createClient ?? createM56E4HostedAdminClient)(
        resolved.supabaseUrl,
        resolved.serviceRoleKey,
        resolved.networkTimeoutMs,
      );
    const row =
      await (deps?.loadRow ?? loadCanaryRequestRow)(
        client as unknown as M56E4RequestSelectClient,
      );
    const matched =
      assertCanaryRequestMatchesExpectations(row, {
        ownerId: resolved.ownerId,
        claimToken: resolved.claimToken,
        claimedGeneration: resolved.claimedGeneration,
        now: resolved.now,
      });

    return {
      mode: resolved.mode,
      supabaseUrl: resolved.supabaseUrl,
      serviceRole: redactSecretMeta(resolved.serviceRoleKey),
      request: redactRequestRow(row),
      claim: matched.claim,
      leaseExpired: matched.leaseExpired,
      readyToExecute:
        resolved.mode === "execute" && !matched.leaseExpired,
    };
  };

  try {
    return await withTimeout(
      run(),
      resolved.preflightTimeoutMs,
      "Stage 3 preflight",
    );
  } catch (error) {
    throwSafeStage3Error(
      error instanceof Error
        ? error.message
        : "Stage 3 preflight failed.",
    );
  }
}

/**
 * Read-only hosted preflight. Forces preflight semantics even if
 * M56E4_STAGE3_MODE=execute is set. Never calls start/complete/recover/claim.
 */
export async function runM56E4Stage3PreflightOnlyFromEnv(
  env: M56E4Stage3OneshotEnv,
  deps?: Parameters<typeof preflightM56E4Stage3Oneshot>[1],
): Promise<{
  preflight: M56E4Stage3PreflightResult;
}> {
  const forced: M56E4Stage3OneshotEnv = {
    ...env,
    M56E4_STAGE3_MODE: "preflight",
  };

  const preflight = await preflightM56E4Stage3Oneshot(forced, deps);

  return { preflight };
}

export async function runM56E4Stage3OneshotFromEnv(
  env: M56E4Stage3OneshotEnv,
  deps?: {
    loadRow?: (
      client: M56E4RequestSelectClient,
    ) => Promise<M56E4CanaryRequestRow>;
    createClient?: (
      url: string,
      key: string,
      networkTimeoutMs: number,
    ) => SupabaseClient;
    runRecompute?: typeof runM56E4SingleGrainCanaryRecompute;
  },
): Promise<{
  preflight: M56E4Stage3PreflightResult;
  startedAttemptCount?: number;
  completion?: string;
}> {
  const resolved = resolveM56E4Stage3Credentials(env);

  if (resolved.mode === "preflight") {
    const preflight = await preflightM56E4Stage3Oneshot(env, deps);
    return { preflight };
  }

  assertExecuteApprovals(env);

  const preflight = await preflightM56E4Stage3Oneshot(env, deps);

  if (preflight.leaseExpired) {
    throw new Error(
      "canary lease is expired; refuse execute. Run org-scoped recover + reclaim (see runbook), then re-run with fresh token/generation.",
    );
  }

  assertClaimTokenNotRevoked(env, resolved.claimToken);

  const client =
    (deps?.createClient ?? createM56E4HostedAdminClient)(
      resolved.supabaseUrl,
      resolved.serviceRoleKey,
      resolved.networkTimeoutMs,
    ) as unknown as MetricRecomputeRpcClient;

  const queue = createMetricRecomputeQueue(client);
  const run =
    deps?.runRecompute ?? runM56E4SingleGrainCanaryRecompute;

  const result = await run({
    approval: resolved.approval,
    expectedOrganizationId: M56E4_STAGE3_CANARY_ORG,
    expectedGrain: {
      storeId: M56E4_STAGE3_CANARY_STORE,
      locationId: M56E4_STAGE3_CANARY_LOCATION,
      variantId: M56E4_STAGE3_CANARY_VARIANT,
      metricDate: M56E4_STAGE3_CANARY_METRIC_DATE,
    },
    expectedOwnerId: resolved.ownerId,
    expectedClaimToken: resolved.claimToken,
    expectedClaimedGeneration: resolved.claimedGeneration,
    claim: preflight.claim,
    queue,
    client,
    leaseSeconds: resolved.leaseSeconds,
    itemDeadlineMs: resolved.itemDeadlineMs,
  });

  return {
    preflight,
    startedAttemptCount: result.startedAttemptCount,
    completion: result.completion,
  };
}

/** Safe summary for stdout — never includes service role key or claim token. */
export function formatM56E4Stage3SafeSummary(
  result: {
    preflight: M56E4Stage3PreflightResult;
    startedAttemptCount?: number;
    completion?: string;
  },
): Record<string, unknown> {
  const { preflight } = result;

  return {
    mode: preflight.mode,
    supabaseUrl: preflight.supabaseUrl,
    serviceRole: preflight.serviceRole,
    organizationId: preflight.claim.organizationId,
    storeId: preflight.claim.storeId,
    locationId: preflight.claim.locationId,
    variantId: preflight.claim.variantId,
    metricDate: preflight.claim.metricDate,
    ownerId: preflight.claim.ownerId,
    claimedGeneration: preflight.claim.claimedGeneration,
    claimToken: {
      present: true,
      length: preflight.claim.claimToken.length,
    },
    status: preflight.request.status,
    attemptCount: preflight.request.attempt_count,
    leaseExpiresAt: preflight.request.lease_expires_at,
    leaseExpired: preflight.leaseExpired,
    readyToExecute: preflight.readyToExecute,
    startedAttemptCount: result.startedAttemptCount ?? null,
    completion: result.completion ?? null,
  };
}
