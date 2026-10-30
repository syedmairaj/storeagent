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
 * M6 P4c.3 — E2E gate:
 * P4b integrity → P4a harness → P4c.2 adapter → P4c.1 SQL persistence.
 *
 * Verification-first local PG17 suite. Does not invent migrations.
 *
 * Run this file serially vs other evaluation live suites: shared
 * truncate of forecast_evaluation_* deadlocks under parallel vitest.
 */

const execFileAsync = promisify(execFile);
const LIVE = process.env.RUN_SUPABASE_LIVE === "1";
const describeLive = LIVE ? describe : describe.skip;

const ORG = "6100d000-0000-4000-8000-000000000001";
const STORE = "6100d000-0000-4000-8000-000000000002";
const LOCATION = "6100d000-0000-4000-8000-000000000003";
const PRODUCT = "6100d000-0000-4000-8000-000000000004";
const VARIANT = "6100d000-0000-4000-8000-000000000005";
const USER = "6100d000-0000-4000-8000-000000000007";
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

/** Capture raw SQL JSON before TS decode. */
function createCapturingClient(): {
  client: ForecastEvaluationPersistClient;
  lastRaw: () => Record<string, unknown> | null;
} {
  let lastRaw: Record<string, unknown> | null = null;

  return {
    lastRaw: () => lastRaw,
    client: {
      async rpc(_fn, args) {
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
          const rawText = await psql(sql);
          const parsed = JSON.parse(rawText) as Record<string, unknown>;
          lastRaw = parsed;
          return { data: parsed, error: null };
        } catch (error) {
          lastRaw = null;
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
  };
}

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

function denseRevisions(
  dayCount: number,
  unitsForDay: (index: number) => number = () => 2,
): HistoricalEvidenceCandidateRevision[] {
  const rows: HistoricalEvidenceCandidateRevision[] = [];
  for (let i = 0; i < dayCount; i += 1) {
    rows.push(
      revision(shiftForecastDate(START, i), {
        unitsSold: unitsForDay(i),
      }),
    );
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

describeLive("M6 P4c.3 evaluation persistence E2E gate (live)", () => {
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
        'authenticated', 'authenticated', 'm6-eval-e2e@example.invalid', '',
        now(), now(), now(), '{}'::jsonb, '{}'::jsonb
      )
      on conflict (id) do nothing;

      insert into public.organizations (id, name, default_currency, timezone)
      values (${quote(ORG)}::uuid, 'M6 Eval E2E', 'USD', 'UTC')
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

  it("full path: controlled fixture → diagnostic → immutable run + three scores; SQL JSON matches TS decoder", async () => {
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

    const capturing = createCapturingClient();
    const result = await persistForecastEvaluation(
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
      capturing.client,
    );

    const raw = capturing.lastRaw();
    expect(raw).not.toBeNull();
    expect(raw?.ok).toBe(true);
    expect(raw?.disposition).toBe("created");
    expect(raw?.evaluationRunId).toBe(result.evaluationRunId);
    expect(raw?.isScoredEvaluation).toBe(true);
    expect(raw?.claimsProductionApproval).toBe(false);
    expect(raw?.claimsM7NumericEligibility).toBe(false);
    expect(raw?.algorithmApproved).toBe(false);

    expect(result.isScoredEvaluation).toBe(true);
    expect(result.harness?.disposition).toBe("preliminary");
    expect(result.payload.models.map((m) => m.model).sort()).toEqual([
      "candidate",
      "naive_lag1",
      "zero",
    ]);
    expect(result.claimsProductionApproval).toBe(false);
    expect(result.claimsM7NumericEligibility).toBe(false);
    expect(result.algorithmApproved).toBe(false);

    const models = await psql(`
      select string_agg(model, ',' order by model)
      from public.forecast_evaluation_model_scores
      where evaluation_run_id = ${quote(result.evaluationRunId)}::uuid
    `);
    expect(models).toBe("candidate,naive_lag1,zero");

    const scored = await psql(`
      select is_scored_evaluation::text
      from public.forecast_evaluation_runs
      where id = ${quote(result.evaluationRunId)}::uuid
    `);
    expect(scored).toBe("true");
  }, 120000);

  it("INVALID_HISTORY and unsupported live paths persist audit-only with zero scores", async () => {
    const capturing = createCapturingClient();

    const invalid = validateHistoricalEvidenceIntegrity({
      sourceClass: "controlled_pit_fixture",
      grain: {
        organizationId: ORG,
        storeId: STORE,
        locationId: LOCATION,
        variantId: VARIANT,
      },
      pinnedTimeZone: TZ,
      revisions: [
        revision(shiftForecastDate(START, 5), {
          knownAsOf: shiftForecastDate(START, 4),
        }),
      ],
    });
    expect(invalid.disposition).toBe("INVALID_HISTORY");

    const invalidResult = await persistForecastEvaluation(
      {
        tenant: TENANT,
        locationId: LOCATION,
        variantId: VARIANT,
        originStart: shiftForecastDate(START, 10),
        originEnd: shiftForecastDate(START, 12),
        lookbackDays: 7,
        integrity: invalid,
        pinnedTimeZone: TZ,
      },
      capturing.client,
    );

    expect(invalidResult.isScoredEvaluation).toBe(false);
    expect(invalidResult.harness).toBeNull();
    expect(capturing.lastRaw()?.isScoredEvaluation).toBe(false);

    const unsupported = validateHistoricalEvidenceIntegrity({
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
    expect(unsupported.disposition).toBe("UNSUPPORTED_HISTORICAL_REPLAY");

    const unsupportedResult = await persistForecastEvaluation(
      {
        tenant: TENANT,
        locationId: LOCATION,
        variantId: VARIANT,
        originStart: shiftForecastDate(START, 10),
        originEnd: shiftForecastDate(START, 12),
        lookbackDays: 7,
        integrity: unsupported,
        pinnedTimeZone: TZ,
      },
      capturing.client,
    );

    expect(unsupportedResult.isScoredEvaluation).toBe(false);

    const scoreCount = await psql(`
      select count(*)::text from public.forecast_evaluation_model_scores
      where organization_id = ${quote(ORG)}::uuid
    `);
    expect(scoreCount).toBe("0");

    const scoredRuns = await psql(`
      select count(*)::text from public.forecast_evaluation_runs
      where organization_id = ${quote(ORG)}::uuid
        and is_scored_evaluation = true
    `);
    expect(scoredRuns).toBe("0");
  }, 120000);

  it("replays identical input and conflicts when material body changes regardless of caller bodyHash", async () => {
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

    const client = createCapturingClient().client;
    const input = {
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
    } as const;

    const first = await persistForecastEvaluation(input, client);
    const replay = await persistForecastEvaluation(input, client);
    expect(replay.disposition).toBe("replayed");
    expect(replay.evaluationRunId).toBe(first.evaluationRunId);

    if (integrity.disposition !== "accepted") {
      return;
    }

    const { evaluateForecastBacktestHarness } = await import(
      "@/lib/forecasting/backtest-harness"
    );
    const harness = evaluateForecastBacktestHarness({
      grain: integrity.grain,
      originStart: input.originStart,
      originEnd: input.originEnd,
      lookbackDays: 7,
      facts: integrity.facts,
    });
    const good = buildForecastEvaluationPersistPayload({
      grain: integrity.grain,
      originStart: input.originStart,
      originEnd: input.originEnd,
      lookbackDays: 7,
      integrity,
      harness,
      pinnedTimeZone: TZ,
    });

    // Same identity key; only bodyHash/resultFingerprint mutated — SQL must conflict.
    await expect(
      persistForecastEvaluation(input, {
        async rpc(_fn, args) {
          const mutated = {
            ...(args.p_payload as Record<string, unknown>),
            bodyHash: "0123456789abcdef0123456789abcdef",
            resultFingerprint: "fedcba9876543210fedcba9876543210",
          };
          const sql = `
            set role service_role;
            select public.persist_forecast_evaluation_result(
              ${quote(String(args.p_organization_id))}::uuid,
              ${quote(String(args.p_store_id))}::uuid,
              ${quote(String(args.p_location_id))}::uuid,
              ${quote(String(args.p_variant_id))}::uuid,
              ${quote(JSON.stringify(mutated))}::jsonb
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
      }),
    ).rejects.toBeInstanceOf(ForecastEvaluationPersistConflictError);

    // Prove original body still present (no overwrite).
    const body = await psql(`
      select body_hash
      from public.forecast_evaluation_runs
      where id = ${quote(first.evaluationRunId)}::uuid
    `);
    expect(body).toBe(good.bodyHash);

    const count = await psql(`
      select count(*)::text from public.forecast_evaluation_runs
      where organization_id = ${quote(ORG)}::uuid
    `);
    expect(count).toBe("1");
  }, 120000);

  it("changed fixture identity creates distinct historical evaluation rows", async () => {
    const grain = {
      organizationId: ORG,
      storeId: STORE,
      locationId: LOCATION,
      variantId: VARIANT,
    };
    const a = validateHistoricalEvidenceIntegrity({
      sourceClass: "controlled_pit_fixture",
      grain,
      pinnedTimeZone: TZ,
      revisions: denseRevisions(40, () => 2),
    });
    const b = validateHistoricalEvidenceIntegrity({
      sourceClass: "controlled_pit_fixture",
      grain,
      pinnedTimeZone: TZ,
      revisions: denseRevisions(40, (i) => (i % 2 === 0 ? 1 : 3)),
    });
    expect(a.disposition).toBe("accepted");
    expect(b.disposition).toBe("accepted");

    const client = createCapturingClient().client;
    const window = {
      tenant: TENANT,
      locationId: LOCATION,
      variantId: VARIANT,
      originStart: shiftForecastDate(START, 10),
      originEnd: shiftForecastDate(
        START,
        10 + FORECAST_BACKTEST_MIN_ORIGINS_V1 - 1,
      ),
      lookbackDays: 7,
    } as const;

    const first = await persistForecastEvaluation(
      { ...window, integrity: a },
      client,
    );
    const second = await persistForecastEvaluation(
      { ...window, integrity: b },
      client,
    );

    expect(first.evaluationRunId).not.toBe(second.evaluationRunId);
    expect(first.payload.fixtureFingerprint).not.toBe(
      second.payload.fixtureFingerprint,
    );

    const count = await psql(`
      select count(*)::text from public.forecast_evaluation_runs
      where organization_id = ${quote(ORG)}::uuid
        and is_scored_evaluation = true
    `);
    expect(count).toBe("2");
  }, 120000);

  it("round-trips undefined WAPE/bias/MASE as null with reasons for zero-demand fixtures", async () => {
    const integrity = validateHistoricalEvidenceIntegrity({
      sourceClass: "controlled_pit_fixture",
      grain: {
        organizationId: ORG,
        storeId: STORE,
        locationId: LOCATION,
        variantId: VARIANT,
      },
      pinnedTimeZone: TZ,
      revisions: denseRevisions(40, () => 0),
    });
    expect(integrity.disposition).toBe("accepted");

    const result = await persistForecastEvaluation(
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
      createCapturingClient().client,
    );

    expect(result.isScoredEvaluation).toBe(true);
    const candidate = result.payload.models.find((m) => m.model === "candidate");
    expect(candidate?.wape).toBeNull();
    expect(candidate?.biasRatio).toBeNull();
    expect(candidate?.mase).toBeNull();
    expect(candidate?.metricReasonCodes).toEqual(
      expect.arrayContaining([
        "ZERO_TOTAL_ACTUAL_DEMAND",
        "MASE_DENOMINATOR_ZERO",
      ]),
    );

    const db = await psql(`
      select
        (wape is null)::text || ',' ||
        (bias_ratio is null)::text || ',' ||
        (mase is null)::text || ',' ||
        metric_reason_codes::text
      from public.forecast_evaluation_model_scores
      where evaluation_run_id = ${quote(result.evaluationRunId)}::uuid
        and model = 'candidate'
    `);
    expect(db.startsWith("true,true,true,")).toBe(true);
    expect(db).toContain("ZERO_TOTAL_ACTUAL_DEMAND");
    expect(db).toContain("MASE_DENOMINATOR_ZERO");
    expect(db.toLowerCase()).not.toContain("nan");
    expect(db.toLowerCase()).not.toContain("infinity");
  }, 120000);

  it("concurrent same-key writers leave one run; loser altered body fails closed", async () => {
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

      expect(loserError + b.readSince("b-ready")).toMatch(
        /EVALUATION_IDEMPOTENCY_BODY_CONFLICT/,
      );

      expect(
        await psql(`
          select count(*)::text from public.forecast_evaluation_runs
          where organization_id = ${quote(ORG)}::uuid
        `),
      ).toBe("1");
      expect(
        await psql(`
          select count(*)::text from public.forecast_evaluation_model_scores
          where organization_id = ${quote(ORG)}::uuid
        `),
      ).toBe("3");
    } finally {
      await a.close();
      await b.close();
    }
  }, 180000);

  it("foreign grain and aborted transaction fail closed with no partial rows", async () => {
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

    await expect(
      persistForecastEvaluation(
        {
          tenant: TENANT,
          locationId: LOCATION,
          variantId: VARIANT,
          originStart: shiftForecastDate(START, 10),
          originEnd: shiftForecastDate(START, 12),
          lookbackDays: 7,
          integrity,
        },
        {
          async rpc(_fn, args) {
            const sql = `
              set role service_role;
              select public.persist_forecast_evaluation_result(
                ${quote(String(args.p_organization_id))}::uuid,
                '6100d000-0000-4000-8000-000000000099'::uuid,
                ${quote(String(args.p_location_id))}::uuid,
                ${quote(String(args.p_variant_id))}::uuid,
                ${quote(JSON.stringify(args.p_payload))}::jsonb
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
    ).rejects.toThrow(/scope error: store|forecast evaluation persist/i);

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

    const session = await openSession();
    try {
      await session.run("begin; set role service_role;", "ready");
      await session.run(
        `
          select public.persist_forecast_evaluation_result(
            ${quote(ORG)}::uuid,
            ${quote(STORE)}::uuid,
            ${quote(LOCATION)}::uuid,
            ${quote(VARIANT)}::uuid,
            ${quote(JSON.stringify(payload))}::jsonb
          )::text;
        `,
        "persisted",
      );
      await session.run("rollback;", "rolled-back");
    } finally {
      await session.close();
    }

    expect(
      await psql(`
        select count(*)::text from public.forecast_evaluation_runs
        where organization_id = ${quote(ORG)}::uuid
      `),
    ).toBe("0");
  }, 120000);
});
