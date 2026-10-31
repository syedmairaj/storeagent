import { execFile, spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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
 * M7.3d — local PG17 dormant lifecycle E2E + multi-session verification.
 *
 * Hardcoded isolated local connection only. Never reads hosted DATABASE_URL.
 * Org-scoped wipe only. Test-only eligibility override is always restored.
 */

const execFileAsync = promisify(execFile);
const LIVE = process.env.RUN_SUPABASE_LIVE === "1";
const describeLive = LIVE ? describe : describe.skip;

const ORG = "7400d000-0000-4000-8000-000000000001";
const STORE = "7400d000-0000-4000-8000-000000000002";
const LOCATION = "7400d000-0000-4000-8000-000000000003";
const PRODUCT = "7400d000-0000-4000-8000-000000000004";
const VARIANT = "7400d000-0000-4000-8000-000000000005";
const USER_OWNER = "7400d000-0000-4000-8000-000000000007";
const USER_ANALYST = "7400d000-0000-4000-8000-000000000037";
const USER_FOREIGN = "7400d000-0000-4000-8000-000000000008";
const FOREIGN_ORG = "7400d000-0000-4000-8000-000000000011";

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

async function psqlFile(contents: string): Promise<string> {
  const file = path.join(
    os.tmpdir(),
    `m73d-lifecycle-${process.pid}-${Date.now()}.sql`,
  );
  fs.writeFileSync(file, contents, "utf8");
  try {
    const { stdout } = await execFileAsync(
      "psql",
      [...psqlArgs(), "-f", file],
      { env: databaseEnv() },
    );
    return stdout.trim();
  } finally {
    fs.unlinkSync(file);
  }
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

async function assertImmutabilityTriggersEnabled(): Promise<void> {
  const actions = await psql(`
    select t.tgenabled::text
    from pg_catalog.pg_trigger as t
    where
      t.tgname = 'inventory_actions_immutable'
      and t.tgrelid = 'public.inventory_actions'::regclass
  `);
  const events = await psql(`
    select t.tgenabled::text
    from pg_catalog.pg_trigger as t
    where
      t.tgname = 'action_events_immutable'
      and t.tgrelid = 'public.action_events'::regclass
  `);
  expect(actions).toBe("O");
  expect(events).toBe("O");
}

async function eligibilityDef(): Promise<string> {
  return psql(`
    select pg_catalog.pg_get_functiondef(
      'public.inventory_action_is_merchant_approvable(public.inventory_actions)'::regprocedure
    )
  `);
}

async function eligibilityHash(): Promise<string> {
  return psql(`
    select encode(
      extensions.digest(
        pg_catalog.pg_get_functiondef(
          'public.inventory_action_is_merchant_approvable(public.inventory_actions)'::regprocedure
        ),
        'sha256'
      ),
      'hex'
    )
  `);
}

async function restoreEligibility(def: string): Promise<void> {
  await psqlFile(`${def};\n`);
}

async function installEligibilityOverride(): Promise<void> {
  await psql(`
    create or replace function public.inventory_action_is_merchant_approvable(
      p_action public.inventory_actions
    )
    returns boolean
    language sql
    stable
    set search_path = ''
    as $f$
      select case when p_action is null then false else true end;
    $f$;
  `);
}

async function wipeOrgScoped(): Promise<void> {
  expect(psqlArgs().slice(0, 4)).toEqual(["-h", "127.0.0.1", "-p", "55322"]);
  await psql(`
    begin;
    alter table public.action_events
      disable trigger action_events_immutable;
    alter table public.inventory_actions
      disable trigger inventory_actions_immutable;
    delete from public.action_events
    where organization_id = ${quote(ORG)}::uuid;
    delete from public.inventory_actions
    where organization_id = ${quote(ORG)}::uuid;
    alter table public.inventory_actions
      enable trigger inventory_actions_immutable;
    alter table public.action_events
      enable trigger action_events_immutable;
    commit;
  `);
  await assertImmutabilityTriggersEnabled();
}

async function persistHarness(watermark: string): Promise<string> {
  const payloadJson = JSON.stringify({
    organizationId: ORG,
    storeId: STORE,
    locationId: LOCATION,
    variantId: VARIANT,
    decisionAsOfDate: "2026-10-31",
    pinnedTimeZone: "UTC",
    actionType: "REORDER",
    compatibleSecondaryActionTypes: [],
    priority: "high",
    status: "new",
    recommendedQuantity: 40,
    recommendedActionDate: "2026-10-31",
    confidence: "high",
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
    metricDate: "2026-10-31",
    metricAlgorithmVersion: "m5-test-v1",
    metricSourceWatermark: watermark,
    forecastRunId: null,
    algorithmVersion: "inventory-decision-v1",
    configurationVersion: "m7-config-v1",
    algorithmVersions: { decisionEngine: "inventory-decision-v1" },
    decisionReproducibilityFingerprint: "abcd1234",
    claimsMerchantFacing: false,
    claimsProductionForecastApproval: false,
    claimsM7ProductionEligibility: false,
    algorithmApproved: false,
    isScoredMerchantDecision: false,
  });

  const hashesJson = await psql(`
    select public.inventory_action_derive_hashes(${quote(payloadJson)}::jsonb)::text
  `);
  const hashes = JSON.parse(hashesJson) as Record<string, string>;
  const full = {
    ...JSON.parse(payloadJson),
    ...hashes,
  };

  const result = await psql(`
    select public.persist_inventory_action_recommendation(
      ${quote(ORG)}::uuid,
      ${quote(STORE)}::uuid,
      ${quote(LOCATION)}::uuid,
      ${quote(VARIANT)}::uuid,
      ${quote(JSON.stringify(full))}::jsonb
    )::text
  `);
  const parsed = JSON.parse(result) as { inventoryActionId: string };
  return parsed.inventoryActionId;
}

function asOwnerSql(): string {
  return `
    select set_config('request.jwt.claim.sub', ${quote(USER_OWNER)}, true);
    select set_config('request.jwt.claim.role', 'authenticated', true);
    set local role authenticated;
  `;
}

describeLive("M7.3d dormant lifecycle E2E verification (live)", () => {
  let baselineEligibilityHash = "";
  let baselineEligibilityDef = "";

  beforeAll(async () => {
    expect(psqlArgs().slice(0, 4)).toEqual(["-h", "127.0.0.1", "-p", "55322"]);
    expect(process.env.DATABASE_URL ?? "").not.toMatch(/supabase\.co|pooler/i);
    await psql("select 1");

    baselineEligibilityDef = await eligibilityDef();
    baselineEligibilityHash = await eligibilityHash();
    expect(baselineEligibilityDef.toLowerCase()).toMatch(
      /else false end/,
    );
    expect(baselineEligibilityDef).not.toContain(
      "m7_lifecycle_eligibility_probe_v1",
    );

    await wipeOrgScoped();
    await psql(`
      insert into auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data
      ) values
      (
        ${quote(USER_OWNER)}::uuid,
        '00000000-0000-0000-0000-000000000000'::uuid,
        'authenticated', 'authenticated', 'm73d-owner@example.invalid', '',
        now(), now(), now(), '{}'::jsonb, '{}'::jsonb
      ),
      (
        ${quote(USER_ANALYST)}::uuid,
        '00000000-0000-0000-0000-000000000000'::uuid,
        'authenticated', 'authenticated', 'm73d-analyst@example.invalid', '',
        now(), now(), now(), '{}'::jsonb, '{}'::jsonb
      ),
      (
        ${quote(USER_FOREIGN)}::uuid,
        '00000000-0000-0000-0000-000000000000'::uuid,
        'authenticated', 'authenticated', 'm73d-foreign@example.invalid', '',
        now(), now(), now(), '{}'::jsonb, '{}'::jsonb
      )
      on conflict (id) do nothing;

      insert into public.organizations (id, name, default_currency, timezone)
      values
        (${quote(ORG)}::uuid, 'M7.3d Org', 'USD', 'UTC'),
        (${quote(FOREIGN_ORG)}::uuid, 'M7.3d Foreign', 'USD', 'UTC')
      on conflict (id) do nothing;

      insert into public.organization_members (organization_id, user_id, role)
      values
        (${quote(ORG)}::uuid, ${quote(USER_OWNER)}::uuid, 'owner'),
        (${quote(ORG)}::uuid, ${quote(USER_ANALYST)}::uuid, 'analyst'),
        (${quote(FOREIGN_ORG)}::uuid, ${quote(USER_FOREIGN)}::uuid, 'owner')
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
    await restoreEligibility(baselineEligibilityDef);
    expect(await eligibilityHash()).toBe(baselineEligibilityHash);
    await wipeOrgScoped();
  }, 120000);

  afterAll(async () => {
    await restoreEligibility(baselineEligibilityDef);
    expect(await eligibilityHash()).toBe(baselineEligibilityHash);
    await wipeOrgScoped();
    await assertImmutabilityTriggersEnabled();
  }, 180000);

  it("SQL transition helper matches history-policy legal edges", async () => {
    const { canTransitionActionStatus } = await import(
      "@/lib/commerce-domain/history-policy"
    );
    const statuses = [
      "new",
      "accepted",
      "accepted_with_edit",
      "dismissed",
      "completed",
      "expired",
      "superseded",
    ] as const;

    for (const from of statuses) {
      for (const to of statuses) {
        const expected = canTransitionActionStatus(from, to);
        const actual = await psql(`
          select public.inventory_action_can_transition_status(
            ${quote(from)}, ${quote(to)}
          )::text
        `);
        expect(actual).toBe(String(expected));
      }
    }
  }, 120000);

  it("deployed eligibility is fail-closed for harness; service_role cannot merchant-approve", async () => {
    const actionId = await persistHarness("m73d-live-failclosed-v1");

    await expect(
      psql(`
        begin;
        ${asOwnerSql()}
        select public.transition_inventory_action_merchant(
          ${quote(actionId)}::uuid, 'accepted', null, null, 'live-failclosed'
        );
        commit;
      `),
    ).rejects.toThrow(/ACTION_NOT_MERCHANT_APPROVABLE/);

    const canService = await psql(`
      select has_function_privilege(
        'service_role',
        'public.transition_inventory_action_merchant(uuid,text,integer,text,text)',
        'EXECUTE'
      )::text
    `);
    expect(canService).toBe("false");

    await expect(
      psql(`
        begin;
        set local role service_role;
        select public.transition_inventory_action_merchant(
          ${quote(actionId)}::uuid, 'accepted', null, null, 'svc-deny'
        );
        commit;
      `),
    ).rejects.toThrow(/permission denied|ACTION_/i);
  }, 120000);

  it("analyst and foreign membership are denied before any status mutation", async () => {
    const actionId = await persistHarness("m73d-live-roles-v1");
    await installEligibilityOverride();

    try {
      await expect(
        psql(`
          begin;
          select set_config('request.jwt.claim.sub', ${quote(USER_ANALYST)}, true);
          select set_config('request.jwt.claim.role', 'authenticated', true);
          set local role authenticated;
          select public.transition_inventory_action_merchant(
            ${quote(actionId)}::uuid, 'accepted', null, null, 'analyst'
          );
          commit;
        `),
      ).rejects.toThrow(/ACTION_LIFECYCLE_ROLE_DENIED/);

      await expect(
        psql(`
          begin;
          select set_config('request.jwt.claim.sub', ${quote(USER_FOREIGN)}, true);
          select set_config('request.jwt.claim.role', 'authenticated', true);
          set local role authenticated;
          select public.transition_inventory_action_merchant(
            ${quote(actionId)}::uuid, 'accepted', null, null, 'foreign'
          );
          commit;
        `),
      ).rejects.toThrow(/ACTION_LIFECYCLE_MEMBERSHIP_REQUIRED/);

      const status = await psql(`
        select status from public.inventory_actions where id = ${quote(actionId)}::uuid
      `);
      expect(status).toBe("new");
    } finally {
      await restoreEligibility(baselineEligibilityDef);
      expect(await eligibilityHash()).toBe(baselineEligibilityHash);
    }
  }, 120000);

  it("concurrent same-key merchant transitions replay deterministically", async () => {
    const actionId = await persistHarness("m73d-live-replay-v1");
    await installEligibilityOverride();

    const a = await openSession();
    const b = await openSession();

    try {
      await a.run(`begin; ${asOwnerSql()}`, "a-ready");
      await b.run(`begin; ${asOwnerSql()}`, "b-ready");

      await a.run(
        `
          select public.transition_inventory_action_merchant(
            ${quote(actionId)}::uuid, 'accepted', null, 'same', 'idem-1'
          )::text;
        `,
        "a-applied",
      );

      const bRun = b.run(
        `
          select public.transition_inventory_action_merchant(
            ${quote(actionId)}::uuid, 'accepted', null, 'same', 'idem-1'
          )::text;
        `,
        "b-done",
      );

      await a.run("commit;", "a-committed");
      await bRun;
      await b.run("commit;", "b-committed");

      const aOut = a.readSince("a-ready");
      const bOut = b.readSince("b-ready");
      expect(aOut + bOut).toMatch(/"disposition":\s*"applied"/);
      expect(aOut + bOut).toMatch(/"disposition":\s*"replayed"/);

      const status = await psql(`
        select status from public.inventory_actions where id = ${quote(actionId)}::uuid
      `);
      expect(status).toBe("accepted");

      const events = await psql(`
        select count(*)::text from public.action_events
        where inventory_action_id = ${quote(actionId)}::uuid
          and idempotency_key = 'idem-1'
      `);
      expect(events).toBe("1");
    } finally {
      await a.close();
      await b.close();
      await restoreEligibility(baselineEligibilityDef);
      expect(await eligibilityHash()).toBe(baselineEligibilityHash);
      await assertImmutabilityTriggersEnabled();
    }
  }, 120000);

  it("concurrent competing transitions cannot overwrite each other", async () => {
    const actionId = await persistHarness("m73d-live-compete-v1");
    await installEligibilityOverride();

    const a = await openSession();
    const b = await openSession();

    try {
      await a.run(`begin; ${asOwnerSql()}`, "a-ready");
      await b.run(`begin; ${asOwnerSql()}`, "b-ready");

      await a.run(
        `
          select public.transition_inventory_action_merchant(
            ${quote(actionId)}::uuid, 'accepted', null, null, 'compete-accept'
          )::text;
        `,
        "a-applied",
      );

      let loserError = "";
      const bAttempt = b
        .run(
          `
            select public.transition_inventory_action_merchant(
              ${quote(actionId)}::uuid, 'dismissed', null, null, 'compete-dismiss'
            )::text;
          `,
          "b-done",
        )
        .catch((error: unknown) => {
          loserError = String(error);
        });

      await new Promise((resolve) => setTimeout(resolve, 250));
      await a.run("commit;", "a-committed");
      await bAttempt;

      const loserOut = b.readSince("b-ready");
      expect(loserError + loserOut).toMatch(/ACTION_LIFECYCLE_TRANSITION_ILLEGAL/);

      const status = await psql(`
        select status from public.inventory_actions where id = ${quote(actionId)}::uuid
      `);
      expect(status).toBe("accepted");

      const dismissEvents = await psql(`
        select count(*)::text from public.action_events
        where inventory_action_id = ${quote(actionId)}::uuid
          and event_type = 'dismissed'
      `);
      expect(dismissEvents).toBe("0");
    } finally {
      await a.close();
      await b.close();
      await restoreEligibility(baselineEligibilityDef);
      expect(await eligibilityHash()).toBe(baselineEligibilityHash);
      await assertImmutabilityTriggersEnabled();
    }
  }, 120000);

  it("gate does not allow recommendation mutation; failed edit leaves status new", async () => {
    const actionId = await persistHarness("m73d-live-atomic-v1");
    await installEligibilityOverride();

    try {
      await expect(
        psql(`
          begin;
          select set_config(
            'storeagent.inventory_action_lifecycle_gate',
            'trusted_lifecycle_rpc_v1',
            true
          );
          update public.inventory_actions
          set recommended_quantity = 1
          where id = ${quote(actionId)}::uuid;
          commit;
        `),
      ).rejects.toThrow(/only status and superseded_by_action_id/i);

      await expect(
        psql(`
          begin;
          ${asOwnerSql()}
          select public.transition_inventory_action_merchant(
            ${quote(actionId)}::uuid, 'accepted_with_edit', 40, null, 'same-qty'
          );
          commit;
        `),
      ).rejects.toThrow(/ACTION_EVENT_EDITED_QUANTITY_INVALID/);

      const row = await psql(`
        select status || ':' || recommended_quantity::text
        from public.inventory_actions
        where id = ${quote(actionId)}::uuid
      `);
      expect(row).toBe("new:40");

      const events = await psql(`
        select count(*)::text from public.action_events
        where inventory_action_id = ${quote(actionId)}::uuid
      `);
      expect(events).toBe("0");
    } finally {
      await restoreEligibility(baselineEligibilityDef);
      expect(await eligibilityHash()).toBe(baselineEligibilityHash);
      await assertImmutabilityTriggersEnabled();
    }
  }, 120000);

  it("system expire then illegal second expire; supersede tenant isolation", async () => {
    const actionId = await persistHarness("m73d-live-expire-v1");
    const otherId = await persistHarness("m73d-live-expire-peer-v1");

    const first = await psql(`
      select public.expire_inventory_action_system(
        ${quote(actionId)}::uuid, 'expire', 'exp-1'
      )::text
    `);
    expect(first).toMatch(/"disposition":\s*"applied"/);

    const replay = await psql(`
      select public.expire_inventory_action_system(
        ${quote(actionId)}::uuid, 'expire', 'exp-1'
      )::text
    `);
    expect(replay).toMatch(/"disposition":\s*"replayed"/);

    await expect(
      psql(`
        select public.expire_inventory_action_system(
          ${quote(actionId)}::uuid, 'expire-again', 'exp-2'
        )
      `),
    ).rejects.toThrow(/ACTION_LIFECYCLE_TRANSITION_ILLEGAL/);

    // Cross-org supersede target must fail (insert foreign org action via direct
    // persist is org-scoped; use foreign org id that has no action).
    await expect(
      psql(`
        select public.supersede_inventory_action_system(
          ${quote(otherId)}::uuid,
          '7400d000-0000-4000-8000-00000000dead'::uuid,
          'x', 'sup-missing'
        )
      `),
    ).rejects.toThrow(/ACTION_LIFECYCLE_SUPERSEDE_TARGET_NOT_FOUND/);

    const qty = await psql(`
      select recommended_quantity::text
      from public.inventory_actions where id = ${quote(actionId)}::uuid
    `);
    expect(qty).toBe("40");
  }, 120000);
});
