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

import type { InventoryActionEvidence } from "@/lib/commerce-domain/types";

import {
  buildInventoryActionPersistPayload,
  InventoryActionPersistConflictError,
  M7_PERSISTENCE_CONTRACT_HARNESS_SOURCE_CLASS_V1,
  persistInventoryActionRecommendation,
  type InventoryActionPersistClient,
  type PersistInventoryActionRecommendationInput,
} from "@/lib/persistence/persist-inventory-action";

import type { TenantContext } from "@/lib/tenancy/types";

/**
 * M7.2c — local PG17 dormant inventory-action persist adapter live suite.
 */

const execFileAsync = promisify(execFile);
const LIVE = process.env.RUN_SUPABASE_LIVE === "1";
const describeLive = LIVE ? describe : describe.skip;

const ORG = "7100d000-0000-4000-8000-000000000001";
const STORE = "7100d000-0000-4000-8000-000000000002";
const LOCATION = "7100d000-0000-4000-8000-000000000003";
const PRODUCT = "7100d000-0000-4000-8000-000000000004";
const VARIANT = "7100d000-0000-4000-8000-000000000005";
const USER = "7100d000-0000-4000-8000-000000000007";
const FOREIGN_LOCATION = "7100d000-0000-4000-8000-000000000023";
const FOREIGN_ORG = "7100d000-0000-4000-8000-000000000011";
const FOREIGN_STORE = "7100d000-0000-4000-8000-000000000012";
const FOREIGN_PRODUCT = "7100d000-0000-4000-8000-000000000014";
const FOREIGN_VARIANT = "7100d000-0000-4000-8000-000000000025";

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

const rpcClient: InventoryActionPersistClient = {
  async rpc(fn, args) {
    expect(fn).toBe("persist_inventory_action_recommendation");
    const json = JSON.stringify(args.p_payload);
    const sql = `
      set role service_role;
      select public.persist_inventory_action_recommendation(
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

function evidence(
  overrides: Partial<InventoryActionEvidence> = {},
): InventoryActionEvidence {
  return {
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
    ...overrides,
  };
}

function baseInput(
  overrides: Partial<PersistInventoryActionRecommendationInput> = {},
): PersistInventoryActionRecommendationInput {
  return {
    tenant: TENANT,
    locationId: LOCATION,
    variantId: VARIANT,
    decisionAsOfDate: "2026-10-30",
    pinnedTimeZone: "UTC",
    actionType: "REORDER",
    compatibleSecondaryActionTypes: [],
    priority: "high",
    recommendedQuantity: 12,
    recommendedActionDate: "2026-10-30",
    confidence: "medium",
    evidenceSnapshot: evidence(),
    incomingStateKnown: true,
    evidenceSourceClass: M7_PERSISTENCE_CONTRACT_HARNESS_SOURCE_CLASS_V1,
    metricDate: "2026-10-30",
    metricAlgorithmVersion: "sku-daily-metrics-v1",
    metricSourceWatermark: "adapter-live-v1",
    configurationVersion: "m7-persistence-harness-config-v1",
    decisionReproducibilityFingerprint: "abcd1234",
    ...overrides,
  };
}

async function assertImmutabilityTriggerEnabled(): Promise<void> {
  const state = await psql(`
    select t.tgenabled::text
    from pg_catalog.pg_trigger as t
    where
      t.tgname = 'inventory_actions_immutable'
      and t.tgrelid = 'public.inventory_actions'::regclass
  `);
  // O = enabled for origin sessions (normal enabled).
  expect(state).toBe("O");
}

async function wipe(): Promise<void> {
  // One explicit transaction on the hardcoded local connection.
  // DISABLE is transactional: failed DELETE aborts and rolls back trigger state.
  expect(psqlArgs().slice(0, 4)).toEqual(["-h", "127.0.0.1", "-p", "55322"]);
  await psql(`
    begin;
    alter table public.inventory_actions
      disable trigger inventory_actions_immutable;
    delete from public.inventory_actions
    where organization_id = ${quote(ORG)}::uuid;
    alter table public.inventory_actions
      enable trigger inventory_actions_immutable;
    commit;
  `);
  await assertImmutabilityTriggerEnabled();
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

describeLive("M7.2c dormant inventory action persist adapter (live)", () => {
  beforeAll(async () => {
    expect(psqlArgs().slice(0, 4)).toEqual(["-h", "127.0.0.1", "-p", "55322"]);
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
        'authenticated', 'authenticated', 'm7-adapter-live@example.invalid', '',
        now(), now(), now(), '{}'::jsonb, '{}'::jsonb
      )
      on conflict (id) do nothing;

      insert into public.organizations (id, name, default_currency, timezone)
      values
        (${quote(ORG)}::uuid, 'M7 Adapter Org', 'USD', 'UTC'),
        (${quote(FOREIGN_ORG)}::uuid, 'M7 Adapter Foreign', 'USD', 'UTC')
      on conflict (id) do nothing;

      insert into public.organization_members (organization_id, user_id, role)
      values (${quote(ORG)}::uuid, ${quote(USER)}::uuid, 'owner')
      on conflict do nothing;

      insert into public.stores (id, organization_id, name, status, currency, timezone)
      values
        (${quote(STORE)}::uuid, ${quote(ORG)}::uuid, 'S', 'active', 'USD', 'UTC'),
        (${quote(FOREIGN_STORE)}::uuid, ${quote(FOREIGN_ORG)}::uuid, 'SF', 'active', 'USD', 'UTC')
      on conflict (id) do nothing;

      insert into public.locations (id, organization_id, store_id, name, status)
      values
        (${quote(LOCATION)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, 'L', 'active'),
        (${quote(FOREIGN_LOCATION)}::uuid, ${quote(FOREIGN_ORG)}::uuid, ${quote(FOREIGN_STORE)}::uuid, 'LF', 'active')
      on conflict (id) do nothing;

      insert into public.products (id, organization_id, store_id, title, status)
      values
        (${quote(PRODUCT)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, 'P', 'active'),
        (${quote(FOREIGN_PRODUCT)}::uuid, ${quote(FOREIGN_ORG)}::uuid, ${quote(FOREIGN_STORE)}::uuid, 'PF', 'active')
      on conflict (id) do nothing;

      insert into public.product_variants (
        id, organization_id, store_id, product_id, sku, status
      ) values
        (
          ${quote(VARIANT)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid,
          ${quote(PRODUCT)}::uuid, 'V1', 'active'
        ),
        (
          ${quote(FOREIGN_VARIANT)}::uuid, ${quote(FOREIGN_ORG)}::uuid, ${quote(FOREIGN_STORE)}::uuid,
          ${quote(FOREIGN_PRODUCT)}::uuid, 'VF', 'active'
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

  it("failed wipe DELETE rolls back and leaves immutability trigger enabled", async () => {
    expect(psqlArgs().slice(0, 4)).toEqual(["-h", "127.0.0.1", "-p", "55322"]);
    await assertImmutabilityTriggerEnabled();

    await expect(
      psql(`
        begin;
        alter table public.inventory_actions
          disable trigger inventory_actions_immutable;
        delete from public.inventory_actions
        where organization_id = ${quote(ORG)}::uuid
          and (1 / 0) = 1;
        alter table public.inventory_actions
          enable trigger inventory_actions_immutable;
        commit;
      `),
    ).rejects.toThrow(/division by zero|ERROR/i);

    await assertImmutabilityTriggerEnabled();
  }, 120000);

  it("matches SQL-derived hashes and creates then replays", async () => {
    const input = baseInput();
    const payload = buildInventoryActionPersistPayload({
      grain: {
        organizationId: ORG,
        storeId: STORE,
        locationId: LOCATION,
        variantId: VARIANT,
      },
      input,
    });

    const withoutHashes = { ...payload } as Record<string, unknown>;
    delete withoutHashes.evidenceProvenanceFingerprint;
    delete withoutHashes.decisionBodyHash;

    const sqlHashRaw = await psql(`
      select public.inventory_action_derive_hashes(
        ${quote(JSON.stringify(withoutHashes))}::jsonb
      )::text
    `);
    const sqlParsed = JSON.parse(sqlHashRaw) as {
      evidenceProvenanceFingerprint: string;
      decisionBodyHash: string;
    };

    expect(sqlParsed.evidenceProvenanceFingerprint).toBe(
      payload.evidenceProvenanceFingerprint,
    );
    expect(sqlParsed.decisionBodyHash).toBe(payload.decisionBodyHash);

    const created = await persistInventoryActionRecommendation(
      input,
      rpcClient,
    );
    expect(created.disposition).toBe("created");
    expect(created.decisionBodyHash).toBe(payload.decisionBodyHash);

    const replayed = await persistInventoryActionRecommendation(
      input,
      rpcClient,
    );
    expect(replayed.disposition).toBe("replayed");
    expect(replayed.inventoryActionId).toBe(created.inventoryActionId);

    const count = await psql(`
      select count(*)::text from public.inventory_actions
      where metric_source_watermark = 'adapter-live-v1'
    `);
    expect(count).toBe("1");
  }, 120000);

  it("creates distinct historical rows for distinct provenance", async () => {
    const first = await persistInventoryActionRecommendation(
      baseInput({ metricSourceWatermark: "adapter-hist-a" }),
      rpcClient,
    );
    const second = await persistInventoryActionRecommendation(
      baseInput({
        metricSourceWatermark: "adapter-hist-b",
        recommendedQuantity: 18,
      }),
      rpcClient,
    );

    expect(first.disposition).toBe("created");
    expect(second.disposition).toBe("created");
    expect(first.inventoryActionId).not.toBe(second.inventoryActionId);
    expect(first.evidenceProvenanceFingerprint).not.toBe(
      second.evidenceProvenanceFingerprint,
    );

    const count = await psql(`
      select count(*)::text from public.inventory_actions
      where organization_id = ${quote(ORG)}::uuid
    `);
    expect(count).toBe("2");
  }, 120000);

  it("rejects foreign location through the RPC", async () => {
    await expect(
      persistInventoryActionRecommendation(
        baseInput({
          locationId: FOREIGN_LOCATION,
          metricSourceWatermark: "adapter-foreign-loc",
        }),
        rpcClient,
      ),
    ).rejects.toThrow(/DECISION_PERSISTENCE_SCOPE_ERROR|inventory action persist/);
  }, 120000);

  it("conflicts when same identity has a changed body under concurrency", async () => {
    const goodInput = baseInput({
      metricSourceWatermark: "adapter-conc-conflict",
      recommendedQuantity: 12,
    });
    const badInput = baseInput({
      metricSourceWatermark: "adapter-conc-conflict",
      recommendedQuantity: 99,
      priority: "critical",
    });

    const goodPayload = buildInventoryActionPersistPayload({
      grain: {
        organizationId: ORG,
        storeId: STORE,
        locationId: LOCATION,
        variantId: VARIANT,
      },
      input: goodInput,
    });
    const badPayload = buildInventoryActionPersistPayload({
      grain: {
        organizationId: ORG,
        storeId: STORE,
        locationId: LOCATION,
        variantId: VARIANT,
      },
      input: badInput,
    });

    expect(goodPayload.evidenceProvenanceFingerprint).toBe(
      badPayload.evidenceProvenanceFingerprint,
    );

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
            ${quote(JSON.stringify(goodPayload))}::jsonb
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
              ${quote(JSON.stringify(badPayload))}::jsonb
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

      await expect(
        persistInventoryActionRecommendation(badInput, rpcClient),
      ).rejects.toBeInstanceOf(InventoryActionPersistConflictError);

      const count = await psql(`
        select count(*)::text from public.inventory_actions
        where metric_source_watermark = 'adapter-conc-conflict'
      `);
      expect(count).toBe("1");
    } finally {
      await a.close();
      await b.close();
    }
  }, 120000);
});
