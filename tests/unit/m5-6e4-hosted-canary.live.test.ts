import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  M56E4_CANARY_APPROVAL_PHRASE,
  runM56E4SingleGrainCanaryRecompute,
} from "@/lib/canary/m5-6e4-single-grain-recompute";

import {
  createMetricRecomputeQueue,
  type ClaimedMetricRecompute,
  type MetricRecomputeRpcClient,
} from "@/lib/persistence/metric-recompute-queue";

import { holdOrdersLiveLock } from "../support/orders-live-lock";

import {
  M56E4_ALGORITHM,
  M56E4_CANARY_AS_OF,
  M56E4_CANARY_LOCATION,
  M56E4_CANARY_METRIC_DATE,
  M56E4_CANARY_ORG,
  M56E4_CANARY_STORE,
  M56E4_CANARY_VARIANT,
  M56E4_FIXTURE_SQL_PATH,
  foreignPipelineFingerprintSql,
  quoteSql,
} from "../support/m5-6e4-canary-fixture";

const execFileAsync = promisify(execFile);
const LIVE = process.env.RUN_SUPABASE_LIVE === "1";
const describeLive = LIVE ? describe : describe.skip;

const OWNER = "m56e4-canary:live";

function psqlArgs(): string[] {
  return [
    "-h", "127.0.0.1",
    "-p", "55322",
    "-U", "postgres",
    "-d", "postgres",
    "-v", "ON_ERROR_STOP=1",
    "-v", "VERBOSITY=verbose",
    "-q", "-t", "-A",
  ];
}

function databaseEnv(): NodeJS.ProcessEnv {
  return { ...process.env, PGPASSWORD: "postgres" };
}

async function psql(sql: string): Promise<string> {
  const { stdout } = await execFileAsync("psql", [...psqlArgs(), "-c", sql], {
    env: databaseEnv(),
  });

  return stdout.trim();
}

function svc(sql: string): Promise<string> {
  return psql(`set role service_role; ${sql}`);
}

async function applyFixture(): Promise<void> {
  const file = path.join(process.cwd(), M56E4_FIXTURE_SQL_PATH);
  await execFileAsync(
    "psql",
    [...psqlArgs().filter((a) => a !== "-t" && a !== "-A"), "-f", file],
    { env: databaseEnv() },
  );
}

const psqlRpcClient: MetricRecomputeRpcClient = {
  rpc(fn, args = {}) {
    const literal = (value: unknown): string => {
      if (value === null || value === undefined) {
        return "null";
      }

      if (typeof value === "number") {
        return String(value);
      }

      if (typeof value === "boolean") {
        return value ? "true" : "false";
      }

      if (typeof value === "string") {
        return quoteSql(value);
      }

      return quoteSql(JSON.stringify(value));
    };
    const named = Object.entries(args)
      .map(([key, value]) => `${key} => ${literal(value)}`)
      .join(", ");

    return (async () => {
      try {
        const out = await svc(
          `select pg_catalog.to_jsonb(public.${fn}(${named}))::text`,
        );

        return {
          data: out === "" ? null : JSON.parse(out),
          error: null,
          status: 200,
        };
      } catch (error) {
        const stderr = String((error as { stderr?: string }).stderr ?? "");
        const match = /ERROR:\s+([0-9A-Z]{5}):\s*([^\n]*)/.exec(stderr);

        return {
          data: null,
          error: {
            code: match?.[1] ?? "",
            message: match?.[2] ?? "psql failed",
          },
          status: 400,
        };
      }
    })();
  },
};

async function fingerprint(): Promise<string> {
  return psql(foreignPipelineFingerprintSql(M56E4_CANARY_ORG));
}

async function claimCanary(): Promise<ClaimedMetricRecompute> {
  const out = await svc(`
    select coalesce(pg_catalog.json_agg(c), '[]'::json)::text
    from public.claim_sku_daily_metric_recompute_requests(
      ${quoteSql(OWNER)}, 1, 120, 4, ${quoteSql(M56E4_CANARY_ORG)}::uuid
    ) as c
  `);
  const rows = JSON.parse(out) as Array<{
    organization_id: string;
    store_id: string;
    location_id: string;
    variant_id: string;
    metric_date: string;
    algorithm_version: string;
    claimed_generation: number;
    attempt_count: number;
    lease_claim_token: string;
    lease_expires_at: string;
  }>;

  expect(rows).toHaveLength(1);
  expect(rows[0].organization_id).toBe(M56E4_CANARY_ORG);

  return {
    organizationId: rows[0].organization_id,
    storeId: rows[0].store_id,
    locationId: rows[0].location_id,
    variantId: rows[0].variant_id,
    metricDate: rows[0].metric_date,
    algorithmVersion: rows[0].algorithm_version,
    ownerId: OWNER,
    claimToken: rows[0].lease_claim_token,
    claimedGeneration: rows[0].claimed_generation,
    attemptCount: rows[0].attempt_count,
    leaseExpiresAt: rows[0].lease_expires_at,
  };
}

describeLive("M5.6E.4 hosted canary fixture and pipeline (local PG17)", () => {
  let releaseOrdersLock: (() => Promise<void>) | undefined;
  let beforeForeign: string;

  beforeAll(async () => {
    releaseOrdersLock = await holdOrdersLiveLock();
  }, 120000);

  afterAll(async () => {
    await releaseOrdersLock?.();
  }, 120000);

  beforeEach(async () => {
    const foreignClaimable = await psql(`
      select pg_catalog.count(*)
      from public.sku_daily_metric_recompute_requests
      where organization_id is distinct from ${quoteSql(M56E4_CANARY_ORG)}::uuid
        and status in ('queued', 'claimed', 'running', 'retry_wait')
    `);

    if (foreignClaimable !== "0") {
      throw new Error(
        "Local DB has non-canary claimable/active recompute requests; reset or clear them before M5.6E.4 live tests.",
      );
    }

    beforeForeign = await fingerprint();
    await applyFixture();
  }, 120000);

  it("creates schema-valid fixture with one unconsumed inventory source event", async () => {
    expect(
      await psql(`
        select source_date::text
        from public.sku_daily_metric_source_events
        where organization_id = ${quoteSql(M56E4_CANARY_ORG)}::uuid
          and consumed_at is null
      `),
    ).toBe(M56E4_CANARY_METRIC_DATE);

    expect(
      await psql(`
        select pg_catalog.count(*)
        from public.inventory_snapshots
        where organization_id = ${quoteSql(M56E4_CANARY_ORG)}::uuid
          and variant_id = ${quoteSql(M56E4_CANARY_VARIANT)}::uuid
      `),
    ).toBe("1");
  });

  it("runs consume → org-scoped claim → start/recompute/complete → fencing → frozen as_of rollover idempotency", async () => {
    const queue = createMetricRecomputeQueue(psqlRpcClient);

    const consumed = Number(
      await svc(
        `select public.consume_sku_daily_metric_source_events(10, ${quoteSql(M56E4_CANARY_ORG)}::uuid)`,
      ),
    );
    expect(consumed).toBeGreaterThanOrEqual(1);
    expect(
      Number(
        await svc(
          `select public.consume_sku_daily_metric_source_events(10, ${quoteSql(M56E4_CANARY_ORG)}::uuid)`,
        ),
      ),
    ).toBe(0);

    const claim = await claimCanary();
    expect(claim.metricDate).toBe(M56E4_CANARY_METRIC_DATE);
    expect(claim.storeId).toBe(M56E4_CANARY_STORE);
    expect(claim.locationId).toBe(M56E4_CANARY_LOCATION);
    expect(claim.variantId).toBe(M56E4_CANARY_VARIANT);
    expect(claim.algorithmVersion).toBe(M56E4_ALGORITHM);
    expect(claim.claimedGeneration).toBeGreaterThanOrEqual(1);

    const result = await runM56E4SingleGrainCanaryRecompute({
      approval: M56E4_CANARY_APPROVAL_PHRASE,
      expectedOrganizationId: M56E4_CANARY_ORG,
      expectedGrain: {
        storeId: M56E4_CANARY_STORE,
        locationId: M56E4_CANARY_LOCATION,
        variantId: M56E4_CANARY_VARIANT,
        metricDate: M56E4_CANARY_METRIC_DATE,
      },
      expectedOwnerId: OWNER,
      expectedClaimToken: claim.claimToken,
      expectedClaimedGeneration: claim.claimedGeneration,
      claim,
      queue,
      client: psqlRpcClient,
    });
    expect(result).toEqual({
      startedAttemptCount: 1,
      completion: "succeeded",
    });

    expect(
      await svc(`
        select public.complete_sku_daily_metric_recompute(
          ${quoteSql(M56E4_CANARY_ORG)}::uuid,
          ${quoteSql(M56E4_CANARY_STORE)}::uuid,
          ${quoteSql(M56E4_CANARY_LOCATION)}::uuid,
          ${quoteSql(M56E4_CANARY_VARIANT)}::uuid,
          ${quoteSql(M56E4_CANARY_METRIC_DATE)}::date,
          ${quoteSql(M56E4_ALGORITHM)},
          ${quoteSql(OWNER)},
          ${quoteSql(claim.claimToken)}
        )
      `),
    ).toBe("fenced");

    const firstRollover = JSON.parse(
      await svc(`
        select public.enqueue_sku_daily_metric_daily_rollover(
          20, 1,
          ${quoteSql(M56E4_CANARY_ORG)}::uuid,
          ${quoteSql(M56E4_CANARY_AS_OF)}::timestamptz
        )::text
      `),
    ) as {
      storesSelected: number;
      grainsEnrolled: number;
      runsFailed: number;
      runsCompleted: number;
    };
    expect(firstRollover.storesSelected).toBe(1);
    expect(firstRollover.runsFailed).toBe(0);
    expect(firstRollover.grainsEnrolled).toBeGreaterThanOrEqual(1);

    const dirtyAfterFirst = await psql(`
      select dirty_generation::text
      from public.sku_daily_metric_recompute_requests
      where organization_id = ${quoteSql(M56E4_CANARY_ORG)}::uuid
        and location_id = ${quoteSql(M56E4_CANARY_LOCATION)}::uuid
        and variant_id = ${quoteSql(M56E4_CANARY_VARIANT)}::uuid
        and metric_date = ${quoteSql(M56E4_CANARY_METRIC_DATE)}::date
    `);
    const enrollmentsAfterFirst = await psql(`
      select pg_catalog.count(*)
      from public.sku_daily_metric_rollover_enqueues
      where organization_id = ${quoteSql(M56E4_CANARY_ORG)}::uuid
        and metric_date = ${quoteSql(M56E4_CANARY_METRIC_DATE)}::date
    `);

    const secondRollover = JSON.parse(
      await svc(`
        select public.enqueue_sku_daily_metric_daily_rollover(
          20, 1,
          ${quoteSql(M56E4_CANARY_ORG)}::uuid,
          ${quoteSql(M56E4_CANARY_AS_OF)}::timestamptz
        )::text
      `),
    ) as { grainsEnrolled: number; runsFailed: number };
    expect(secondRollover.runsFailed).toBe(0);
    expect(secondRollover.grainsEnrolled).toBe(0);

    expect(
      await psql(`
        select dirty_generation::text
        from public.sku_daily_metric_recompute_requests
        where organization_id = ${quoteSql(M56E4_CANARY_ORG)}::uuid
          and location_id = ${quoteSql(M56E4_CANARY_LOCATION)}::uuid
          and variant_id = ${quoteSql(M56E4_CANARY_VARIANT)}::uuid
          and metric_date = ${quoteSql(M56E4_CANARY_METRIC_DATE)}::date
      `),
    ).toBe(dirtyAfterFirst);
    expect(
      await psql(`
        select pg_catalog.count(*)
        from public.sku_daily_metric_rollover_enqueues
        where organization_id = ${quoteSql(M56E4_CANARY_ORG)}::uuid
          and metric_date = ${quoteSql(M56E4_CANARY_METRIC_DATE)}::date
      `),
    ).toBe(enrollmentsAfterFirst);

    const afterForeign = await fingerprint();
    expect(afterForeign).toBe(beforeForeign);
  }, 180000);

  it("documents claim/recover RPC identities used by the canary", async () => {
    const args = await psql(`
      select pg_catalog.string_agg(
        p.proname || '(' || pg_catalog.pg_get_function_identity_arguments(p.oid) || ')',
        '|' order by p.proname
      )
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.proname in (
          'claim_sku_daily_metric_recompute_requests',
          'recover_expired_sku_daily_metric_recompute_leases',
          'consume_sku_daily_metric_source_events',
          'enqueue_sku_daily_metric_daily_rollover'
        )
    `);

    expect(args).toContain(
      "claim_sku_daily_metric_recompute_requests(p_owner_id text, p_limit integer, p_lease_seconds integer, p_max_active integer, p_organization_id uuid)",
    );
    expect(args).toContain(
      "recover_expired_sku_daily_metric_recompute_leases(p_max_attempts integer, p_base_delay_seconds integer, p_max_delay_seconds integer, p_organization_id uuid)",
    );
    expect(args).toContain(
      "consume_sku_daily_metric_source_events(p_limit integer, p_organization_id uuid)",
    );
    expect(args).toContain(
      "enqueue_sku_daily_metric_daily_rollover(p_limit integer, p_max_stores integer, p_organization_id uuid, p_as_of timestamp with time zone)",
    );
  });
});
