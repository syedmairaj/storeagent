import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("server-only", () => ({}));

import {
  FORECAST_BACKTEST_MIN_ORIGINS_V1,
} from "@/lib/forecasting/backtest-harness";

import {
  validateHistoricalEvidenceIntegrity,
  type HistoricalEvidenceCandidateRevision,
} from "@/lib/forecasting/historical-evidence-integrity";

import { shiftForecastDate } from "@/lib/forecasting/series";

import {
  buildForecastEvaluationPersistPayload,
  ForecastEvaluationPersistConflictError,
  persistForecastEvaluation,
  type ForecastEvaluationPersistClient,
} from "@/lib/persistence/persist-forecast-evaluation";

import type { TenantContext } from "@/lib/tenancy/types";

/**
 * M6 P4c.2 — local PG17 evaluation persist adapter live suite.
 */

const execFileAsync = promisify(execFile);
const LIVE = process.env.RUN_SUPABASE_LIVE === "1";
const describeLive = LIVE ? describe : describe.skip;

const ORG = "6100c000-0000-4000-8000-000000000001";
const STORE = "6100c000-0000-4000-8000-000000000002";
const LOCATION = "6100c000-0000-4000-8000-000000000003";
const PRODUCT = "6100c000-0000-4000-8000-000000000004";
const VARIANT = "6100c000-0000-4000-8000-000000000005";
const USER = "6100c000-0000-4000-8000-000000000007";
const START = "2026-01-01";
const TZ = "UTC";

const TENANT: TenantContext = {
  userId: USER,
  organizationId: ORG,
  role: "owner",
  storeId: STORE,
};

function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

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

const rpcClient: ForecastEvaluationPersistClient = {
  async rpc(fn, args) {
    const json = JSON.stringify(args.p_payload);
    const sql = `
      set role service_role;
      select public.persist_forecast_evaluation_result(
        ${quote(String(args.p_organization_id))}::uuid,
        ${quote(String(args.p_store_id))}::uuid,
        ${quote(String(args.p_location_id))}::uuid,
        ${quote(String(args.p_variant_id))}::uuid,
        ${quote(json)}::jsonb
      )::text;
    `;
    try {
      const raw = await psql(sql);
      return { data: JSON.parse(raw), error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { data: null, error: { message } };
    }
  },
};

function revision(
  date: string,
  overrides: Partial<HistoricalEvidenceCandidateRevision> = {},
): HistoricalEvidenceCandidateRevision {
  return {
    sourceIdentity: `day:${date}`,
    claimKind: "day_outcome",
    organizationId: ORG,
    storeId: STORE,
    locationId: LOCATION,
    variantId: VARIANT,
    businessDate: date,
    knownAsOf: date,
    unitsSold: 2,
    availability: "available",
    promotionState: "none",
    dataComplete: true,
    ...overrides,
  };
}

function denseRevisions(dayCount: number): HistoricalEvidenceCandidateRevision[] {
  const rows: HistoricalEvidenceCandidateRevision[] = [];
  for (let i = 0; i < dayCount; i += 1) {
    rows.push(revision(shiftForecastDate(START, i)));
  }
  return rows;
}

async function wipe(): Promise<void> {
  await psql(`
    truncate table public.forecast_evaluation_model_scores,
      public.forecast_evaluation_runs;
  `);
}

interface Session {
  run: (sql: string, marker: string) => Promise<void>;
  readSince: (marker: string) => string;
  close: () => Promise<void>;
}

async function openSession(): Promise<Session> {
  const child: ChildProcess = spawn("psql", psqlArgs(), {
    env: databaseEnv(),
    stdio: ["pipe", "pipe", "pipe"],
  });
  let output = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  const exited = new Promise<void>((resolve) => {
    child.on("exit", () => resolve());
  });

  return {
    async run(sql, marker) {
      child.stdin?.write(`${sql}\nselect '${marker}';\n`);
      const started = Date.now();
      while (!output.includes(marker)) {
        if (child.exitCode !== null || Date.now() - started > 60000) {
          throw new Error(`session did not reach ${marker}: ${output}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    },
    readSince(marker) {
      const idx = output.lastIndexOf(marker);
      return idx >= 0 ? output.slice(idx) : output;
    },
    async close() {
      child.stdin?.end();
      await exited;
    },
  };
}

describeLive("M6 P4c.2 forecast evaluation persist adapter (live)", () => {
  beforeAll(async () => {
    await psql("select 1");
    await wipe();
    await psql(`
      insert into auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data
      ) values (
        ${quote(USER)}::uuid,
        '00000000-0000-0000-0000-000000000000'::uuid,
        'authenticated', 'authenticated', 'm6-eval-adapter@example.invalid', '',
        now(), now(), now(), '{}'::jsonb, '{}'::jsonb
      )
      on conflict (id) do nothing;

      insert into public.organizations (id, name, default_currency, timezone)
      values (${quote(ORG)}::uuid, 'M6 Eval Adapter', 'USD', 'UTC')
      on conflict (id) do nothing;

      insert into public.organization_members (organization_id, user_id, role)
      values (${quote(ORG)}::uuid, ${quote(USER)}::uuid, 'owner')
      on conflict do nothing;

      insert into public.stores (id, organization_id, name, status, currency, timezone)
      values (${quote(STORE)}::uuid, ${quote(ORG)}::uuid, 'S', 'active', 'USD', 'UTC')
      on conflict (id) do nothing;

      insert into public.locations (id, organization_id, store_id, name, status)
      values (
        ${quote(LOCATION)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid,
        'L', 'active'
      )
      on conflict (id) do nothing;

      insert into public.products (id, organization_id, store_id, title, status)
      values (
        ${quote(PRODUCT)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid,
        'P', 'active'
      )
      on conflict (id) do nothing;

      insert into public.product_variants (
        id, organization_id, store_id, product_id, sku, status
      ) values (
        ${quote(VARIANT)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid,
        ${quote(PRODUCT)}::uuid, 'V1', 'active'
      )
      on conflict (id) do nothing;
    `);
  }, 180000);

  beforeEach(async () => {
    await wipe();
  }, 120000);

  afterAll(async () => {
    await wipe();
  }, 180000);

  it("persists accepted preliminary via adapter and replays same body", async () => {
    const integrity = validateHistoricalEvidenceIntegrity({
      sourceClass: "controlled_pit_fixture",
      grain: {
        organizationId: ORG,
        storeId: STORE,
        locationId: LOCATION,
        variantId: VARIANT,
      },
      pinnedTimeZone: TZ,
      revisions: denseRevisions(40),
    });
    expect(integrity.disposition).toBe("accepted");

    const first = await persistForecastEvaluation(
      {
        tenant: TENANT,
        locationId: LOCATION,
        variantId: VARIANT,
        originStart: shiftForecastDate(START, 10),
        originEnd: shiftForecastDate(
          START,
          10 + FORECAST_BACKTEST_MIN_ORIGINS_V1 - 1,
        ),
        lookbackDays: 7,
        integrity,
      },
      rpcClient,
    );

    expect(first.disposition).toBe("created");
    expect(first.isScoredEvaluation).toBe(true);
    expect(first.payload.models).toHaveLength(3);

    const replay = await persistForecastEvaluation(
      {
        tenant: TENANT,
        locationId: LOCATION,
        variantId: VARIANT,
        originStart: shiftForecastDate(START, 10),
        originEnd: shiftForecastDate(
          START,
          10 + FORECAST_BACKTEST_MIN_ORIGINS_V1 - 1,
        ),
        lookbackDays: 7,
        integrity,
      },
      rpcClient,
    );

    expect(replay.disposition).toBe("replayed");
    expect(replay.evaluationRunId).toBe(first.evaluationRunId);

    const count = await psql(`
      select count(*)::text from public.forecast_evaluation_runs
      where organization_id = ${quote(ORG)}::uuid
        and is_scored_evaluation = true
    `);
    expect(count).toBe("1");

    const scores = await psql(`
      select count(*)::text from public.forecast_evaluation_model_scores
      where organization_id = ${quote(ORG)}::uuid
    `);
    expect(scores).toBe("3");
  }, 120000);

  it("persists rejected integrity with zero scores", async () => {
    const integrity = validateHistoricalEvidenceIntegrity({
      sourceClass: "unsupported_live_canonical",
      grain: {
        organizationId: ORG,
        storeId: STORE,
        locationId: LOCATION,
        variantId: VARIANT,
      },
      pinnedTimeZone: TZ,
      revisions: denseRevisions(3),
    });

    const result = await persistForecastEvaluation(
      {
        tenant: TENANT,
        locationId: LOCATION,
        variantId: VARIANT,
        originStart: shiftForecastDate(START, 10),
        originEnd: shiftForecastDate(START, 12),
        lookbackDays: 7,
        integrity,
        pinnedTimeZone: TZ,
      },
      rpcClient,
    );

    expect(result.disposition).toBe("created");
    expect(result.isScoredEvaluation).toBe(false);

    const scores = await psql(`
      select count(*)::text from public.forecast_evaluation_model_scores s
      join public.forecast_evaluation_runs r on r.id = s.evaluation_run_id
      where r.id = ${quote(result.evaluationRunId)}::uuid
    `);
    expect(scores).toBe("0");
  }, 120000);

  it("fails closed on same-key altered body under concurrency and rolls back loser", async () => {
    const integrity = validateHistoricalEvidenceIntegrity({
      sourceClass: "controlled_pit_fixture",
      grain: {
        organizationId: ORG,
        storeId: STORE,
        locationId: LOCATION,
        variantId: VARIANT,
      },
      pinnedTimeZone: TZ,
      revisions: denseRevisions(40),
    });
    expect(integrity.disposition).toBe("accepted");
    if (integrity.disposition !== "accepted") {
      return;
    }

    const { evaluateForecastBacktestHarness } = await import(
      "@/lib/forecasting/backtest-harness"
    );
    const harness = evaluateForecastBacktestHarness({
      grain: integrity.grain,
      originStart: shiftForecastDate(START, 10),
      originEnd: shiftForecastDate(
        START,
        10 + FORECAST_BACKTEST_MIN_ORIGINS_V1 - 1,
      ),
      lookbackDays: 7,
      facts: integrity.facts,
    });

    const good = buildForecastEvaluationPersistPayload({
      grain: integrity.grain,
      originStart: shiftForecastDate(START, 10),
      originEnd: shiftForecastDate(
        START,
        10 + FORECAST_BACKTEST_MIN_ORIGINS_V1 - 1,
      ),
      lookbackDays: 7,
      integrity,
      harness,
      pinnedTimeZone: TZ,
    });
    const bad = {
      ...good,
      bodyHash: "ffffffffffffffffffffffffffffffff",
      resultFingerprint: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    };

    const a = await openSession();
    const b = await openSession();

    try {
      await a.run("begin; set role service_role;", "a-ready");
      await b.run("begin; set role service_role;", "b-ready");

      await a.run(
        `
          select public.persist_forecast_evaluation_result(
            ${quote(ORG)}::uuid,
            ${quote(STORE)}::uuid,
            ${quote(LOCATION)}::uuid,
            ${quote(VARIANT)}::uuid,
            ${quote(JSON.stringify(good))}::jsonb
          )::text;
        `,
        "a-persisted",
      );

      let loserError = "";
      const bAttempt = b
        .run(
          `
            select public.persist_forecast_evaluation_result(
              ${quote(ORG)}::uuid,
              ${quote(STORE)}::uuid,
              ${quote(LOCATION)}::uuid,
              ${quote(VARIANT)}::uuid,
              ${quote(JSON.stringify(bad))}::jsonb
            )::text;
          `,
          "b-persisted",
        )
        .catch((error: unknown) => {
          loserError = String(error);
        });

      await new Promise((resolve) => setTimeout(resolve, 250));
      await a.run("commit;", "a-committed");
      await bAttempt;

      const loserOut = b.readSince("b-ready");
      expect(loserError + loserOut).toMatch(
        /EVALUATION_IDEMPOTENCY_BODY_CONFLICT/,
      );

      const runs = await psql(`
        select count(*)::text from public.forecast_evaluation_runs
        where organization_id = ${quote(ORG)}::uuid
      `);
      expect(runs).toBe("1");
    } finally {
      await a.close();
      await b.close();
    }

    // Adapter-level conflict mapping for altered bodyHash after create.
    await expect(
      persistForecastEvaluation(
        {
          tenant: TENANT,
          locationId: LOCATION,
          variantId: VARIANT,
          originStart: shiftForecastDate(START, 10),
          originEnd: shiftForecastDate(
            START,
            10 + FORECAST_BACKTEST_MIN_ORIGINS_V1 - 1,
          ),
          lookbackDays: 7,
          integrity,
        },
        {
          async rpc(fn, args) {
            // Force conflict by mutating body after build inside a thin wrapper:
            // call SQL with altered bodyHash while keeping identity key fields.
            const payload = {
              ...(args.p_payload as Record<string, unknown>),
              bodyHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              resultFingerprint: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            };
            const sql = `
              set role service_role;
              select public.persist_forecast_evaluation_result(
                ${quote(String(args.p_organization_id))}::uuid,
                ${quote(String(args.p_store_id))}::uuid,
                ${quote(String(args.p_location_id))}::uuid,
                ${quote(String(args.p_variant_id))}::uuid,
                ${quote(JSON.stringify(payload))}::jsonb
              )::text;
            `;
            try {
              const raw = await psql(sql);
              return { data: JSON.parse(raw), error: null };
            } catch (error) {
              return {
                data: null,
                error: {
                  message:
                    error instanceof Error ? error.message : String(error),
                },
              };
            }
          },
        },
      ),
    ).rejects.toBeInstanceOf(ForecastEvaluationPersistConflictError);
  }, 180000);

  it("aborted transaction leaves no partial adapter-written rows", async () => {
    const integrity = validateHistoricalEvidenceIntegrity({
      sourceClass: "controlled_pit_fixture",
      grain: {
        organizationId: ORG,
        storeId: STORE,
        locationId: LOCATION,
        variantId: VARIANT,
      },
      pinnedTimeZone: TZ,
      revisions: denseRevisions(40),
    });
    expect(integrity.disposition).toBe("accepted");
    if (integrity.disposition !== "accepted") {
      return;
    }

    const { evaluateForecastBacktestHarness } = await import(
      "@/lib/forecasting/backtest-harness"
    );
    const harness = evaluateForecastBacktestHarness({
      grain: integrity.grain,
      originStart: shiftForecastDate(START, 10),
      originEnd: shiftForecastDate(START, 12),
      lookbackDays: 7,
      facts: integrity.facts,
    });
    const payload = buildForecastEvaluationPersistPayload({
      grain: integrity.grain,
      originStart: shiftForecastDate(START, 10),
      originEnd: shiftForecastDate(START, 12),
      lookbackDays: 7,
      integrity,
      harness,
      pinnedTimeZone: TZ,
    });

    const a = await openSession();
    try {
      await a.run("begin; set role service_role;", "a-ready");
      await a.run(
        `
          select public.persist_forecast_evaluation_result(
            ${quote(ORG)}::uuid,
            ${quote(STORE)}::uuid,
            ${quote(LOCATION)}::uuid,
            ${quote(VARIANT)}::uuid,
            ${quote(JSON.stringify(payload))}::jsonb
          )::text;
        `,
        "a-persisted",
      );
      await a.run("rollback;", "a-rolled-back");

      const runs = await psql(`
        select count(*)::text from public.forecast_evaluation_runs
        where organization_id = ${quote(ORG)}::uuid
          and fixture_fingerprint = ${quote(payload.fixtureFingerprint)}
      `);
      expect(runs).toBe("0");
    } finally {
      await a.close();
    }
  }, 120000);
});
