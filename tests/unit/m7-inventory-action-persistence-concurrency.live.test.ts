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
 * M7.2b — multi-session inventory action persistence concurrency (local PG17).
 *
 * Proves competing same-key writers create one row; altered body conflicts.
 */

const execFileAsync = promisify(execFile);
const LIVE = process.env.RUN_SUPABASE_LIVE === "1";
const describeLive = LIVE ? describe : describe.skip;

const ORG = "7100a000-0000-4000-8000-000000000001";
const STORE = "7100a000-0000-4000-8000-000000000002";
const LOCATION = "7100a000-0000-4000-8000-000000000003";
const PRODUCT = "7100a000-0000-4000-8000-000000000004";
const VARIANT = "7100a000-0000-4000-8000-000000000005";
const USER = "7100a000-0000-4000-8000-000000000007";

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

function basePayloadObject(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    organizationId: ORG,
    storeId: STORE,
    locationId: LOCATION,
    variantId: VARIANT,
    decisionAsOfDate: "2026-10-30",
    pinnedTimeZone: "UTC",
    actionType: "REORDER",
    compatibleSecondaryActionTypes: [],
    priority: "high",
    status: "new",
    recommendedQuantity: 12,
    recommendedActionDate: "2026-10-30",
    confidence: "medium",
    evidenceSnapshot: {
      availableQuantity: 2,
      incomingQuantity: 0,
      demandVelocity: 1.5,
      daysOfStock: 1,
      leadTimeDays: 7,
      safetyStockUnits: 3,
      reorderPointUnits: 10,
      targetStockUnits: 20,
      inventoryAgeDays: 12,
      forecastExpectedDemandUnits: null,
      dataQualityScore: 0.9,
      reasonCodes: ["REORDER_QUANTITY_POSITIVE", "BELOW_REORDER_POINT"],
    },
    incomingStateKnown: true,
    evidenceSourceClass: "m7_persistence_contract_harness_v1",
    metricDate: "2026-10-30",
    metricAlgorithmVersion: "sku-daily-metrics-v1",
    metricSourceWatermark: "2026-10-30T12:00:00.000Z",
    forecastRunId: null,
    algorithmVersion: "inventory-decision-v1",
    configurationVersion: "m7-persistence-harness-config-v1",
    algorithmVersions: {
      reorder: "reorder-rule-v1",
      reduce: "reduce-rule-v1",
      promote: "promote-rule-v1",
      watchHealthy: "watch-healthy-rule-v1",
      conflict: "decision-conflict-v1",
      primaryAction: "primary-action-v1",
      priority: "decision-priority-v1",
      confidence: "decision-confidence-v1",
    },
    decisionReproducibilityFingerprint: "abcd1234",
    claimsMerchantFacing: false,
    claimsProductionForecastApproval: false,
    claimsM7ProductionEligibility: false,
    algorithmApproved: false,
    isScoredMerchantDecision: false,
    ...overrides,
  };
}

async function hashedPayloadSql(
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const body = basePayloadObject(overrides);
  const literal = quote(JSON.stringify(body));
  const hashesJson = await psql(`
    select public.inventory_action_derive_hashes(${literal}::jsonb)::text
  `);
  const hashes = JSON.parse(hashesJson) as {
    evidenceProvenanceFingerprint: string;
    decisionBodyHash: string;
  };

  return quote(
    JSON.stringify({
      ...body,
      evidenceProvenanceFingerprint: hashes.evidenceProvenanceFingerprint,
      decisionBodyHash: hashes.decisionBodyHash,
    }),
  );
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

async function wipeActions(): Promise<void> {
  await psql("truncate table public.inventory_actions;");
}

describeLive("M7.2b inventory action persistence concurrency (live)", () => {
  beforeAll(async () => {
    expect(psqlArgs().slice(0, 4)).toEqual(["-h", "127.0.0.1", "-p", "55322"]);
    await psql("select 1");

    const def = await psql(`
      select pg_catalog.pg_get_functiondef(
        'public.persist_inventory_action_recommendation(uuid,uuid,uuid,uuid,jsonb)'::regprocedure
      )
    `);
    expect(def.toLowerCase()).toMatch(/security definer/);
    expect(def).toMatch(/DECISION_IDEMPOTENCY_BODY_CONFLICT/);

    await wipeActions();
    await psql(`
      insert into auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data
      ) values (
        ${quote(USER)}::uuid,
        '00000000-0000-0000-0000-000000000000'::uuid,
        'authenticated', 'authenticated', 'm7-action-conc@example.invalid', '',
        now(), now(), now(), '{}'::jsonb, '{}'::jsonb
      )
      on conflict (id) do nothing;

      insert into public.organizations (id, name, default_currency, timezone)
      values (${quote(ORG)}::uuid, 'M7 Action Conc', 'USD', 'UTC')
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
    await wipeActions();
  }, 120000);

  afterAll(async () => {
    await wipeActions();
  }, 180000);

  it("competing same-key writers create exactly one inventory action", async () => {
    const payload = await hashedPayloadSql({
      metricSourceWatermark: "conc-same-v1",
    });
    const a = await openSession();
    const b = await openSession();

    try {
      await a.run("begin; set role service_role;", "a-ready");
      await b.run("begin; set role service_role;", "b-ready");

      await a.run(
        `
          select public.persist_inventory_action_recommendation(
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
          select public.persist_inventory_action_recommendation(
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
        select count(*)::text from public.inventory_actions
        where metric_source_watermark = 'conc-same-v1'
      `);
      expect(count).toBe("1");
    } finally {
      await a.close();
      await b.close();
    }
  }, 120000);

  it("same-key altered body conflicts under contention", async () => {
    const goodBody = basePayloadObject({
      metricSourceWatermark: "conc-conflict-v1",
      recommendedQuantity: 12,
    });
    const badBody = basePayloadObject({
      metricSourceWatermark: "conc-conflict-v1",
      recommendedQuantity: 99,
      priority: "critical",
    });

    const goodFp = await psql(`
      select public.inventory_action_derive_hashes(
        ${quote(JSON.stringify(goodBody))}::jsonb
      )->>'evidenceProvenanceFingerprint'
    `);
    const badFp = await psql(`
      select public.inventory_action_derive_hashes(
        ${quote(JSON.stringify(badBody))}::jsonb
      )->>'evidenceProvenanceFingerprint'
    `);
    expect(goodFp).toBe(badFp);

    const good = await hashedPayloadSql({
      metricSourceWatermark: "conc-conflict-v1",
      recommendedQuantity: 12,
    });
    const bad = await hashedPayloadSql({
      metricSourceWatermark: "conc-conflict-v1",
      recommendedQuantity: 99,
      priority: "critical",
    });

    const a = await openSession();
    const b = await openSession();

    try {
      await a.run("begin; set role service_role;", "a-ready");
      await b.run("begin; set role service_role;", "b-ready");

      await a.run(
        `
          select public.persist_inventory_action_recommendation(
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
            select public.persist_inventory_action_recommendation(
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
        /DECISION_IDEMPOTENCY_BODY_CONFLICT/,
      );
      expect(loserError + loserOut).not.toMatch(
        /"disposition":\s*"replayed"/,
      );

      const runs = await psql(`
        select count(*)::text from public.inventory_actions
        where metric_source_watermark = 'conc-conflict-v1'
      `);
      expect(runs).toBe("1");
    } finally {
      await a.close();
      await b.close();
    }
  }, 120000);

  it("aborted writer leaves no inventory_actions row", async () => {
    const payload = await hashedPayloadSql({
      metricSourceWatermark: "conc-abort-v1",
    });
    const a = await openSession();

    try {
      await a.run("begin; set role service_role;", "a-ready");
      await a.run(
        `
          select public.persist_inventory_action_recommendation(
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
        select count(*)::text from public.inventory_actions
        where metric_source_watermark = 'conc-abort-v1'
      `);
      expect(runs).toBe("0");
    } finally {
      await a.close();
    }
  }, 120000);
});
