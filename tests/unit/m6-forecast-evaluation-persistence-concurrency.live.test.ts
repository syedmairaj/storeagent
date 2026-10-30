import { execFile, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

/**
 * M6 P4c.1 — multi-session evaluation persistence concurrency (local PG17).
 *
 * Proves competing same-key writers create one row; altered body conflicts;
 * loser abort leaves no partial run/score rows.
 */

const execFileAsync = promisify(execFile);
const LIVE = process.env.RUN_SUPABASE_LIVE === "1";
const describeLive = LIVE ? describe : describe.skip;

const ORG = "6100a000-0000-4000-8000-000000000001";
const STORE = "6100a000-0000-4000-8000-000000000002";
const LOCATION = "6100a000-0000-4000-8000-000000000003";
const PRODUCT = "6100a000-0000-4000-8000-000000000004";
const VARIANT = "6100a000-0000-4000-8000-000000000005";
const USER = "6100a000-0000-4000-8000-000000000007";

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

function scoredPayload(overrides: Record<string, unknown> = {}): string {
  const scoredDates = Array.from({ length: 14 }, (_, i) => {
    const day = 11 + i;
    return `2026-01-${String(day).padStart(2, "0")}`;
  });

  const model = (
    name: string,
    extras: Record<string, unknown> = {},
  ) => ({
    model: name,
    observationCount: 14,
    mae: 1.5,
    wape: 0.25,
    biasRatio: 0.1,
    mase: name === "candidate" ? 0.8 : null,
    totalActualDemand: 28,
    totalPredictedDemand: name === "zero" ? 0 : 30,
    totalAbsoluteError: 21,
    totalSignedError: name === "zero" ? -28 : 2,
    metricReasonCodes: [],
    ...extras,
  });

  const body = {
    organizationId: ORG,
    storeId: STORE,
    locationId: LOCATION,
    variantId: VARIANT,
    harnessVersion: "forecast-backtest-harness-v1",
    integrityVersion: "forecast-historical-evidence-integrity-v1",
    backtestMetricVersion: "forecast-backtest-v1",
    orchestratorVersion: "forecast-orchestrator-v1",
    configurationVersion: "forecast-config-v1",
    algorithmVersions: {
      weightedDemand: "weighted-demand-v1",
      trendAdjustment: "trend-adjustment-v1",
      stockoutCensoring: "stockout-censoring-v1",
      promotionTreatment: "promotion-treatment-v1",
      coldStart: "cold-start-v1",
      confidence: "forecast-confidence-v1",
      horizon: "forecast-horizon-v1",
      backtest: "forecast-backtest-v1",
    },
    algorithmVersionsFingerprint: "cccccccccccccccccccccccccccccccc",
    fixtureFingerprint: "fixture-eval-conc-v1",
    originsHash: "origins-conc",
    resultFingerprint: "result-conc",
    bodyHash: "body-conc",
    originStart: "2026-01-10",
    originEnd: "2026-01-23",
    lookbackDays: 7,
    harnessHorizonDays: 1,
    pinnedTimeZone: "UTC",
    integritySourceClass: "controlled_pit_fixture",
    integrityDisposition: "accepted",
    integrityReasonCodes: [],
    evaluationDisposition: "preliminary",
    harnessReasonCodes: [],
    demandClass: "smooth",
    originCount: 14,
    scoredDates,
    segments: [{ demandClass: "smooth", originCount: 14 }],
    claimsProductionApproval: false,
    claimsM7NumericEligibility: false,
    algorithmApproved: false,
    models: [model("candidate"), model("naive_lag1"), model("zero")],
    ...overrides,
  };

  return quote(JSON.stringify(body));
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

async function wipeEvaluationHistory(): Promise<void> {
  await psql(`
    truncate table public.forecast_evaluation_model_scores,
      public.forecast_evaluation_runs;
  `);
}

describeLive("M6 P4c.1 forecast evaluation persistence concurrency (live)", () => {
  beforeAll(async () => {
    expect(psqlArgs().slice(0, 4)).toEqual(["-h", "127.0.0.1", "-p", "55322"]);
    await psql("select 1");

    const def = await psql(`
      select pg_catalog.pg_get_functiondef(
        'public.persist_forecast_evaluation_result(uuid,uuid,uuid,uuid,jsonb)'::regprocedure
      )
    `);
    expect(def.toLowerCase()).toMatch(/security definer/);
    expect(def).toMatch(/EVALUATION_IDEMPOTENCY_BODY_CONFLICT/);

    await wipeEvaluationHistory();
    await psql(`
      insert into auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data
      ) values (
        ${quote(USER)}::uuid,
        '00000000-0000-0000-0000-000000000000'::uuid,
        'authenticated', 'authenticated', 'm6-eval-conc@example.invalid', '',
        now(), now(), now(), '{}'::jsonb, '{}'::jsonb
      )
      on conflict (id) do nothing;

      insert into public.organizations (id, name, default_currency, timezone)
      values (${quote(ORG)}::uuid, 'M6 Eval Conc', 'USD', 'UTC')
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
    await wipeEvaluationHistory();
  }, 120000);

  afterAll(async () => {
    await wipeEvaluationHistory();
  }, 180000);

  it("competing same-key writers create exactly one scored evaluation", async () => {
    const payload = scoredPayload();
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
            ${payload}::jsonb
          )::text;
        `,
        "a-persisted",
      );

      const bPersist = b.run(
        `
          select public.persist_forecast_evaluation_result(
            ${quote(ORG)}::uuid,
            ${quote(STORE)}::uuid,
            ${quote(LOCATION)}::uuid,
            ${quote(VARIANT)}::uuid,
            ${payload}::jsonb
          )::text;
        `,
        "b-persisted",
      );

      await a.run("commit;", "a-committed");
      await bPersist;
      await b.run("commit;", "b-committed");

      const count = await psql(`
        select count(*)::text from public.forecast_evaluation_runs
        where fixture_fingerprint = 'fixture-eval-conc-v1'
      `);
      expect(count).toBe("1");

      const scores = await psql(`
        select count(*)::text from public.forecast_evaluation_model_scores
      `);
      expect(scores).toBe("3");
    } finally {
      await a.close();
      await b.close();
    }
  }, 120000);

  it("same-key altered body conflicts under contention without partial rows", async () => {
    const good = scoredPayload();
    const bad = scoredPayload({
      bodyHash: "body-conc-CHANGED",
      resultFingerprint: "result-conc-CHANGED",
    });
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
            ${good}::jsonb
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
              ${bad}::jsonb
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
      expect(loserError + loserOut).not.toMatch(
        /"disposition":\s*"replayed"/,
      );

      const runs = await psql(`
        select count(*)::text from public.forecast_evaluation_runs
        where fixture_fingerprint = 'fixture-eval-conc-v1'
      `);
      expect(runs).toBe("1");

      const scores = await psql(`
        select count(*)::text from public.forecast_evaluation_model_scores
      `);
      expect(scores).toBe("3");
    } finally {
      await a.close();
      await b.close();
    }
  }, 120000);

  it("aborted writer leaves no partial evaluation rows", async () => {
    const payload = scoredPayload({
      fixtureFingerprint: "fixture-eval-abort-v1",
      bodyHash: "body-abort",
      resultFingerprint: "result-abort",
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
            ${payload}::jsonb
          )::text;
        `,
        "a-persisted",
      );
      await a.run("rollback;", "a-rolled-back");

      const runs = await psql(`
        select count(*)::text from public.forecast_evaluation_runs
        where fixture_fingerprint = 'fixture-eval-abort-v1'
      `);
      expect(runs).toBe("0");

      const scores = await psql(`
        select count(*)::text
        from public.forecast_evaluation_model_scores s
        join public.forecast_evaluation_runs r
          on r.id = s.evaluation_run_id
        where r.fixture_fingerprint = 'fixture-eval-abort-v1'
      `);
      expect(scores).toBe("0");
    } finally {
      await a.close();
    }
  }, 120000);
});
