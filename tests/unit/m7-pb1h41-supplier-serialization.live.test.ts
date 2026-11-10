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
  evaluatePb1SupplierConcurrencyFence,
  M7_PB1_SUPPLIER_CONCURRENCY_FENCE_VERSION_V1,
} from "@/lib/decision-engine/pb1-supplier-concurrency-fence";
import {
  M7_PB1_TRUSTED_SUPPLIER_PLANNING_FACTS_RESOLVER_VERSION_V1,
  resolvePb1TrustedSupplierPlanningFacts,
  type Pb1SupplierProductLeadTimeRow,
} from "@/lib/decision-engine/pb1-trusted-supplier-planning-facts";
/**
 * M7-PB1.h.4.1 — supplier org+variant serialization adversarial proof
 * (DISPOSABLE LOCAL PG ONLY).
 *
 * Requires an isolated database where migration 20261110120000 has been
 * applied. Connection MUST be supplied explicitly — there is no silent
 * fallback to the existing Supabase DB on 55322.
 *
 * Required env (when RUN_PB1H41_ISOLATED_LIVE=1):
 *   PB1H41_PGHOST, PB1H41_PGPORT, PB1H41_PGDATABASE, PB1H41_PGUSER
 * Optional: PB1H41_PGPASSWORD
 *
 * Authority: docs/M7_PB1_H1_PRODUCTION_EVIDENCE_FENCING_CONTRACT.md §2.3 §8.1
 *
 * Does NOT wire production create/approve, grain advisory, workers, or UI.
 * Does NOT touch 127.0.0.1:55322.
 */

const execFileAsync = promisify(execFile);
const LIVE = process.env.RUN_PB1H41_ISOLATED_LIVE === "1";
const describeLive = LIVE ? describe : describe.skip;

const FORBIDDEN_PORTS = new Set(["55322", "54322"]);

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `PB1.h.4.1 isolated live requires ${name} (no silent 55322 fallback)`,
    );
  }
  return value;
}

function isolatedConnection(): {
  host: string;
  port: string;
  database: string;
  user: string;
  password: string;
} {
  const host = requiredEnv("PB1H41_PGHOST");
  const port = requiredEnv("PB1H41_PGPORT");
  const database = requiredEnv("PB1H41_PGDATABASE");
  const user = requiredEnv("PB1H41_PGUSER");
  const password = process.env.PB1H41_PGPASSWORD ?? "";

  if (FORBIDDEN_PORTS.has(port)) {
    throw new Error(
      `PB1.h.4.1 isolated live refuses port ${port} (existing Supabase DB is read-only)`,
    );
  }
  if (host === "127.0.0.1" && port === "55322") {
    throw new Error("PB1.h.4.1 isolated live refuses 127.0.0.1:55322");
  }

  return { host, port, database, user, password };
}

const TZ = "UTC";

/** Isolated PB1.h.4.1 synthetic tenants — never merchant data. */
const ORG = "ab141000-0000-4000-8000-000000000001";
const ORG_B = "ab141000-0000-4000-8000-000000000011";
const STORE = "ab141000-0000-4000-8000-000000000002";
const STORE_B = "ab141000-0000-4000-8000-000000000012";
const PRODUCT = "ab141000-0000-4000-8000-000000000004";
const PRODUCT_B = "ab141000-0000-4000-8000-000000000014";
const VARIANT = "ab141000-0000-4000-8000-000000000005";
const VARIANT_2 = "ab141000-0000-4000-8000-000000000006";
const VARIANT_B = "ab141000-0000-4000-8000-000000000015";
const SUPPLIER_1 = "ab141000-0000-4000-8000-000000000031";
const SUPPLIER_2 = "ab141000-0000-4000-8000-000000000032";
const SUPPLIER_3 = "ab141000-0000-4000-8000-000000000033";
const SUPPLIER_B = "ab141000-0000-4000-8000-000000000034";
const INTEGRATION = "ab141000-0000-4000-8000-000000000041";

const TENANTS = `(${quote(ORG)}::uuid, ${quote(ORG_B)}::uuid)`;

type CaseResult = "PASS" | "FAIL" | "SKIP";
const RESULTS: Array<{ id: string; result: CaseResult; detail: string }> = [];

function record(id: string, result: CaseResult, detail: string): void {
  RESULTS.push({ id, result, detail });
}

function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function psqlArgs(): string[] {
  const conn = isolatedConnection();
  return [
    "-h",
    conn.host,
    "-p",
    conn.port,
    "-U",
    conn.user,
    "-d",
    conn.database,
    "-v",
    "ON_ERROR_STOP=1",
    "-v",
    "VERBOSITY=verbose",
    "-q",
    "-t",
    "-A",
  ];
}

function databaseEnv(): NodeJS.ProcessEnv {
  const conn = isolatedConnection();
  return { ...process.env, PGPASSWORD: conn.password };
}

async function psql(sql: string): Promise<string> {
  const { stdout } = await execFileAsync("psql", [...psqlArgs(), "-c", sql], {
    env: databaseEnv(),
  });
  return stdout.trim();
}

async function psqlError(
  sql: string,
): Promise<{ code: string; message: string }> {
  try {
    await psql(sql);
  } catch (error) {
    const stderr = String((error as { stderr?: string }).stderr ?? "");
    const match = /ERROR:\s+([0-9A-Z]{5}):\s*([^\n]*)/.exec(stderr);
    if (match) {
      return { code: match[1], message: match[2] };
    }
    const soft = /ERROR:\s+([^\n]+)/.exec(stderr);
    if (soft) {
      return { code: "ERROR", message: soft[1] };
    }
    throw error;
  }
  throw new Error("expected SQL to fail");
}

interface Session {
  run: (sql: string, marker: string) => Promise<string>;
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
      const startLen = output.length;
      child.stdin?.write(`${sql}\nselect '${marker}';\n`);
      const started = Date.now();
      while (!output.includes(marker)) {
        if (child.exitCode !== null || Date.now() - started > 60000) {
          throw new Error(`session did not reach ${marker}: ${output}`);
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      return output.slice(startLen);
    },
    async close() {
      child.stdin?.end();
      await exited;
    },
  };
}

async function serializationObjectsPresent(): Promise<boolean> {
  const raw = await psql(`
    select (
      to_regprocedure(
        'public.acquire_supplier_products_org_variant_xact_lock(uuid,uuid)'
      ) is not null
      and exists (
        select 1
        from pg_trigger t
        join pg_class c on t.tgrelid = c.oid
        join pg_namespace n on c.relnamespace = n.oid
        where n.nspname = 'public'
          and c.relname = 'supplier_products'
          and t.tgname = 'supplier_products_serialize_org_variant_xact_lock'
          and not t.tgisinternal
      )
    )::text
  `);
  return raw === "t" || raw === "true";
}

async function cleanupFixture(): Promise<void> {
  await psql(`
    delete from public.supplier_products
    where organization_id in ${TENANTS};
    delete from public.suppliers
    where organization_id in ${TENANTS};
    delete from public.provider_bindings
    where organization_id in ${TENANTS};
    delete from public.integrations
    where organization_id in ${TENANTS};
    delete from public.product_variants
    where organization_id in ${TENANTS};
    delete from public.products
    where organization_id in ${TENANTS};
    delete from public.stores
    where organization_id in ${TENANTS};
    delete from public.organizations
    where id in ${TENANTS};
  `);
}

async function seedFixture(): Promise<void> {
  await psql(`
    insert into public.organizations (id, name, default_currency, timezone)
    values
      (${quote(ORG)}::uuid, 'PB1.h.4.1 Live A', 'USD', ${quote(TZ)}),
      (${quote(ORG_B)}::uuid, 'PB1.h.4.1 Live B', 'USD', ${quote(TZ)});

    insert into public.stores (id, organization_id, name, status, currency, timezone)
    values
      (${quote(STORE)}::uuid, ${quote(ORG)}::uuid, 'H41-A', 'active', 'USD', ${quote(TZ)}),
      (${quote(STORE_B)}::uuid, ${quote(ORG_B)}::uuid, 'H41-B', 'active', 'USD', ${quote(TZ)});

    insert into public.products (id, organization_id, store_id, title, status)
    values
      (${quote(PRODUCT)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, 'PA', 'active'),
      (${quote(PRODUCT_B)}::uuid, ${quote(ORG_B)}::uuid, ${quote(STORE_B)}::uuid, 'PB', 'active');

    insert into public.product_variants (
      id, organization_id, store_id, product_id, sku, status
    ) values
      (${quote(VARIANT)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(PRODUCT)}::uuid, 'PB1H41-A', 'active'),
      (${quote(VARIANT_2)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid, ${quote(PRODUCT)}::uuid, 'PB1H41-A2', 'active'),
      (${quote(VARIANT_B)}::uuid, ${quote(ORG_B)}::uuid, ${quote(STORE_B)}::uuid, ${quote(PRODUCT_B)}::uuid, 'PB1H41-B', 'active');

    insert into public.suppliers (id, organization_id, name, currency)
    values
      (${quote(SUPPLIER_1)}::uuid, ${quote(ORG)}::uuid, 'H41 Preferred', 'USD'),
      (${quote(SUPPLIER_2)}::uuid, ${quote(ORG)}::uuid, 'H41 Secondary', 'USD'),
      (${quote(SUPPLIER_3)}::uuid, ${quote(ORG)}::uuid, 'H41 Tertiary', 'USD'),
      (${quote(SUPPLIER_B)}::uuid, ${quote(ORG_B)}::uuid, 'H41 OrgB', 'USD');

    insert into public.integrations (id, organization_id, store_id, provider, status)
    values (
      ${quote(INTEGRATION)}::uuid, ${quote(ORG)}::uuid, ${quote(STORE)}::uuid,
      'csv', 'active'
    );
  `);
}

async function ensurePreferredMapping(): Promise<{
  id: string;
  updatedAt: string;
}> {
  await psql(`
    delete from public.supplier_products
    where organization_id = ${quote(ORG)}::uuid
      and variant_id = ${quote(VARIANT)}::uuid;

    insert into public.supplier_products (
      organization_id, supplier_id, variant_id,
      supplier_sku, currency, lead_time_days, preferred
    ) values (
      ${quote(ORG)}::uuid, ${quote(SUPPLIER_1)}::uuid, ${quote(VARIANT)}::uuid,
      'H41-PREF', 'USD', 5, true
    );
  `);

  const raw = await psql(`
    select id::text || '|' || updated_at::text
    from public.supplier_products
    where organization_id = ${quote(ORG)}::uuid
      and supplier_id = ${quote(SUPPLIER_1)}::uuid
      and variant_id = ${quote(VARIANT)}::uuid
  `);
  const [id, updatedAt] = raw.split("|");
  return { id, updatedAt };
}

async function loadSupplierRows(
  organizationId = ORG,
  variantId = VARIANT,
): Promise<Pb1SupplierProductLeadTimeRow[]> {
  const raw = await psql(`
    select coalesce(
      json_agg(row_to_json(t) order by t."supplierId"),
      '[]'::json
    )::text
    from (
      select
        id,
        organization_id as "organizationId",
        supplier_id as "supplierId",
        variant_id as "variantId",
        lead_time_days as "leadTimeDays",
        preferred,
        updated_at as "updatedAt"
      from public.supplier_products
      where organization_id = ${quote(organizationId)}::uuid
        and variant_id = ${quote(variantId)}::uuid
    ) t
  `);
  return JSON.parse(raw) as Pb1SupplierProductLeadTimeRow[];
}

async function beginSelectionLock(session: Session, marker: string): Promise<void> {
  await session.run(
    `begin;
     set local lock_timeout = '2s';
     set local statement_timeout = '15s';
     select public.acquire_supplier_products_org_variant_xact_lock(
       ${quote(ORG)}::uuid,
       ${quote(VARIANT)}::uuid
     );
     select id::text
     from public.supplier_products
     where organization_id = ${quote(ORG)}::uuid
       and variant_id = ${quote(VARIANT)}::uuid
       and preferred = true
     for update;`,
    marker,
  );
}

let objectsPresent = false;
let suiteConnectionSummary = "";

describeLive("M7-PB1.h.4.1 supplier serialization live", () => {
  beforeAll(async () => {
    const conn = isolatedConnection();
    suiteConnectionSummary = `${conn.host}:${conn.port}/${conn.database}`;
    if (FORBIDDEN_PORTS.has(conn.port)) {
      throw new Error(`refusing forbidden port ${conn.port}`);
    }

    const identity = await psql(`
      select current_database() || '|' || inet_server_port()::text || '|' ||
             (current_setting('data_directory'))
    `);
    process.stdout.write(`\n[PB1.h.4.1] disposable identity: ${identity}\n`);
    if (identity.includes("|55322|") || identity.startsWith("postgres|55322|")) {
      throw new Error("refusing to run against server port 55322");
    }

    objectsPresent = await serializationObjectsPresent();
    if (!objectsPresent) {
      process.stdout.write(
        "\n[PB1.h.4.1] UNVERIFIED: serialization objects absent on disposable DB. S1–S10 SKIP.\n",
      );
      return;
    }
    await cleanupFixture();
    await seedFixture();
  }, 120000);

  afterAll(async () => {
    try {
      if (objectsPresent) {
        await cleanupFixture();
      }
    } finally {
      process.stdout.write(
        `\n[PB1.h.4.1] connection=${suiteConnectionSummary}\n[PB1.h.4.1] results:\n${RESULTS.map(
          (row) => `${row.id}\t${row.result}\t${row.detail}`,
        ).join("\n")}\n`,
      );
    }
  }, 120000);

  beforeEach(() => {
    if (!objectsPresent) {
      return;
    }
  });

  it("S1: preferred INSERT during locked selection is blocked", async () => {
    if (!objectsPresent) {
      record("S1", "SKIP", "objects absent / migration unapplied");
      return;
    }
    const preferred = await ensurePreferredMapping();
    expect(preferred.id.length).toBeGreaterThan(0);

    const txA = await openSession();
    try {
      await beginSelectionLock(txA, "s1-locked");

      const err = await psqlError(`
        begin;
        set local lock_timeout = '2s';
        set local statement_timeout = '15s';
        insert into public.supplier_products (
          organization_id, supplier_id, variant_id,
          supplier_sku, currency, lead_time_days, preferred
        ) values (
          ${quote(ORG)}::uuid, ${quote(SUPPLIER_2)}::uuid, ${quote(VARIANT)}::uuid,
          'H41-PHANTOM', 'USD', 9, true
        );
      `);
      expect(err.code).toBe("55P03");

      await txA.run("rollback;", "s1-done");

      expect(
        await psql(`
          select count(*)::text from public.supplier_products
          where organization_id = ${quote(ORG)}::uuid
            and variant_id = ${quote(VARIANT)}::uuid
            and preferred = true
        `),
      ).toBe("1");

      record("S1", "PASS", "preferred INSERT → 55P03 while selection holds 71010401");
    } finally {
      await txA.close();
    }
  }, 120000);

  it("S2: sibling preferred UPDATE is blocked while selection locked", async () => {
    if (!objectsPresent) {
      record("S2", "SKIP", "objects absent / migration unapplied");
      return;
    }
    await ensurePreferredMapping();
    await psql(`
      insert into public.supplier_products (
        organization_id, supplier_id, variant_id,
        supplier_sku, currency, lead_time_days, preferred
      ) values (
        ${quote(ORG)}::uuid, ${quote(SUPPLIER_2)}::uuid, ${quote(VARIANT)}::uuid,
        'H41-SIB', 'USD', 4, false
      );
    `);

    const txA = await openSession();
    try {
      await beginSelectionLock(txA, "s2-locked");

      const err = await psqlError(`
        begin;
        set local lock_timeout = '2s';
        set local statement_timeout = '15s';
        update public.supplier_products
        set preferred = true, updated_at = pg_catalog.now()
        where organization_id = ${quote(ORG)}::uuid
          and supplier_id = ${quote(SUPPLIER_2)}::uuid
          and variant_id = ${quote(VARIANT)}::uuid;
      `);
      expect(err.code).toBe("55P03");

      await txA.run("rollback;", "s2-done");

      expect(
        await psql(`
          select count(*)::text from public.supplier_products
          where organization_id = ${quote(ORG)}::uuid
            and variant_id = ${quote(VARIANT)}::uuid
            and preferred = true
        `),
      ).toBe("1");

      record("S2", "PASS", "sibling preferred UPDATE → 55P03");
    } finally {
      await txA.close();
    }
  }, 120000);

  it("S3: exact-row LT UPDATE/DELETE under FOR UPDATE still blocks without deadlock", async () => {
    if (!objectsPresent) {
      record("S3", "SKIP", "objects absent / migration unapplied");
      return;
    }
    const preferred = await ensurePreferredMapping();
    const txA = await openSession();
    try {
      await beginSelectionLock(txA, "s3-locked");

      const updateErr = await psqlError(`
        begin;
        set local lock_timeout = '2s';
        set local statement_timeout = '15s';
        update public.supplier_products
        set lead_time_days = 99, updated_at = pg_catalog.now()
        where id = ${quote(preferred.id)}::uuid;
      `);
      expect(updateErr.code).toBe("55P03");
      expect(updateErr.message).not.toMatch(/deadlock/i);

      const deleteErr = await psqlError(`
        begin;
        set local lock_timeout = '2s';
        set local statement_timeout = '15s';
        delete from public.supplier_products
        where id = ${quote(preferred.id)}::uuid;
      `);
      expect(deleteErr.code).toBe("55P03");
      expect(deleteErr.message).not.toMatch(/deadlock/i);

      const reread = await txA.run(
        `select lead_time_days::text
         from public.supplier_products
         where id = ${quote(preferred.id)}::uuid;`,
        "s3-reread",
      );
      expect(reread).toMatch(/5/);

      await txA.run("rollback;", "s3-done");
      record("S3", "PASS", "exact-row UPDATE/DELETE → 55P03; no deadlock; LT stable");
    } finally {
      await txA.close();
    }
  }, 120000);

  it("S4: csv_reconcile vs selection serializes on 71010401", async () => {
    if (!objectsPresent) {
      record("S4", "SKIP", "objects absent / migration unapplied");
      return;
    }
    await ensurePreferredMapping();
    const txA = await openSession();
    try {
      await beginSelectionLock(txA, "s4-locked");

      const err = await psqlError(`
        begin;
        set local lock_timeout = '2s';
        set local statement_timeout = '15s';
        set local role service_role;
        select * from public.csv_reconcile_supplier_product(
          ${quote(ORG)}::uuid,
          ${quote(INTEGRATION)}::uuid,
          ${quote(SUPPLIER_2)}::uuid,
          ${quote(VARIANT)}::uuid,
          'H41-CSV',
          1.25,
          'USD',
          7,
          null,
          null,
          true
        );
      `);
      expect(err.code).toBe("55P03");

      await txA.run("rollback;", "s4-done");

      expect(
        await psql(`
          select count(*)::text from public.supplier_products
          where organization_id = ${quote(ORG)}::uuid
            and supplier_id = ${quote(SUPPLIER_2)}::uuid
            and variant_id = ${quote(VARIANT)}::uuid
        `),
      ).toBe("0");

      record("S4", "PASS", "csv_reconcile waits/fails on advisory while selection holds lock");
    } finally {
      await txA.close();
    }
  }, 120000);

  it("S5: cross-org preferred INSERT remains independent", async () => {
    if (!objectsPresent) {
      record("S5", "SKIP", "objects absent / migration unapplied");
      return;
    }
    await ensurePreferredMapping();
    const txA = await openSession();
    try {
      await beginSelectionLock(txA, "s5-locked");

      await psql(`
        begin;
        set local lock_timeout = '2s';
        set local statement_timeout = '15s';
        insert into public.supplier_products (
          organization_id, supplier_id, variant_id,
          supplier_sku, currency, lead_time_days, preferred
        ) values (
          ${quote(ORG_B)}::uuid, ${quote(SUPPLIER_B)}::uuid, ${quote(VARIANT_B)}::uuid,
          'H41-ORGB', 'USD', 3, true
        );
        commit;
      `);

      await txA.run("rollback;", "s5-done");

      expect(
        await psql(`
          select count(*)::text from public.supplier_products
          where organization_id = ${quote(ORG_B)}::uuid
            and preferred = true
        `),
      ).toBe("1");

      record("S5", "PASS", "Org-B preferred INSERT commits while Org-A selection locked");
    } finally {
      await txA.close();
    }
  }, 120000);

  it("S6: two concurrent opposite-order multi-variant writers fail closed without deadlock", async () => {
    if (!objectsPresent) {
      record("S6", "SKIP", "objects absent / migration unapplied");
      return;
    }
    await psql(`
      delete from public.supplier_products
      where organization_id = ${quote(ORG)}::uuid
        and variant_id in (${quote(VARIANT)}::uuid, ${quote(VARIANT_2)}::uuid);

      insert into public.supplier_products (
        organization_id, supplier_id, variant_id,
        supplier_sku, currency, lead_time_days, preferred
      ) values
        (${quote(ORG)}::uuid, ${quote(SUPPLIER_1)}::uuid, ${quote(VARIANT)}::uuid, 'V1', 'USD', 5, true),
        (${quote(ORG)}::uuid, ${quote(SUPPLIER_1)}::uuid, ${quote(VARIANT_2)}::uuid, 'V2', 'USD', 5, true);

      drop table if exists public.pb1h41_s6_barrier;
      create table public.pb1h41_s6_barrier (
        name text primary key,
        ready boolean not null default false
      );
      insert into public.pb1h41_s6_barrier(name, ready) values ('go', false);
    `);

    const txA = await openSession();
    const txB = await openSession();
    try {
      await txA.run(
        `begin;
         set local lock_timeout = '2s';
         set local statement_timeout = '15s';
         set local deadlock_timeout = '200ms';`,
        "s6-a-begin",
      );
      await txB.run(
        `begin;
         set local lock_timeout = '2s';
         set local statement_timeout = '15s';
         set local deadlock_timeout = '200ms';`,
        "s6-b-begin",
      );

      // Opposite-order blocking prelocks across two live sessions.
      // A: V1 then V2. B: V2 then V1. Contender must not hang forever.
      const aFirst = txA.run(
        `select public.acquire_supplier_products_org_variant_xact_lock(
           ${quote(ORG)}::uuid, ${quote(VARIANT)}::uuid
         );
         update public.pb1h41_s6_barrier set ready = true where name = 'go';
         select public.acquire_supplier_products_org_variant_xact_lock(
           ${quote(ORG)}::uuid, ${quote(VARIANT_2)}::uuid
         );
         update public.supplier_products
         set lead_time_days = 61
         where organization_id = ${quote(ORG)}::uuid
           and variant_id in (${quote(VARIANT)}::uuid, ${quote(VARIANT_2)}::uuid);`,
        "s6-a-done",
      );

      // Wait until A holds V1 before B takes V2 (maximize inversion window).
      const barrierStarted = Date.now();
      while (Date.now() - barrierStarted < 10000) {
        const ready = await psql(
          `select ready::text from public.pb1h41_s6_barrier where name = 'go'`,
        );
        if (ready === "t" || ready === "true") {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }

      const bSecond = txB.run(
        `select public.acquire_supplier_products_org_variant_xact_lock(
           ${quote(ORG)}::uuid, ${quote(VARIANT_2)}::uuid
         );
         select public.acquire_supplier_products_org_variant_xact_lock(
           ${quote(ORG)}::uuid, ${quote(VARIANT)}::uuid
         );
         update public.supplier_products
         set lead_time_days = 62
         where organization_id = ${quote(ORG)}::uuid
           and variant_id in (${quote(VARIANT_2)}::uuid, ${quote(VARIANT)}::uuid);`,
        "s6-b-done",
      );

      const settled = await Promise.allSettled([aFirst, bSecond]);
      const texts = settled.map((result) =>
        result.status === "fulfilled"
          ? result.value
          : String((result.reason as Error)?.message ?? result.reason),
      );
      const joined = texts.join("\n");

      // At least one side must fail closed (lock_timeout 55P03 and/or deadlock 40P01).
      // Deadlock detector abort is acceptable; silent commit of both is not.
      const aOk = settled[0]?.status === "fulfilled" && texts[0]?.includes("s6-a-done");
      const bOk = settled[1]?.status === "fulfilled" && texts[1]?.includes("s6-b-done");
      expect(aOk && bOk).toBe(false);
      expect(joined).toMatch(/55P03|40P01|lock timeout|deadlock detected|did not reach/i);

      // Roll back whichever sessions are still open.
      try {
        await txA.run("rollback;", "s6-a-rb");
      } catch {
        /* session may already be aborted/closed by timeout */
      }
      try {
        await txB.run("rollback;", "s6-b-rb");
      } catch {
        /* session may already be aborted/closed by timeout */
      }

      // Direct DML opposite-order path uses trigger try-acquire: no wait deadlock.
      const directA = openSession().then(async (session) => {
        try {
          return await session.run(
            `begin;
             set local lock_timeout = '2s';
             set local statement_timeout = '15s';
             update public.supplier_products
             set lead_time_days = 71
             where organization_id = ${quote(ORG)}::uuid
               and variant_id = ${quote(VARIANT)}::uuid;
             update public.supplier_products
             set lead_time_days = 71
             where organization_id = ${quote(ORG)}::uuid
               and variant_id = ${quote(VARIANT_2)}::uuid;
             commit;`,
            "s6-direct-a",
          );
        } finally {
          await session.close();
        }
      });
      const directB = openSession().then(async (session) => {
        try {
          return await session.run(
            `begin;
             set local lock_timeout = '2s';
             set local statement_timeout = '15s';
             update public.supplier_products
             set lead_time_days = 72
             where organization_id = ${quote(ORG)}::uuid
               and variant_id = ${quote(VARIANT_2)}::uuid;
             update public.supplier_products
             set lead_time_days = 72
             where organization_id = ${quote(ORG)}::uuid
               and variant_id = ${quote(VARIANT)}::uuid;
             commit;`,
            "s6-direct-b",
          );
        } finally {
          await session.close();
        }
      });

      const directSettled = await Promise.allSettled([directA, directB]);
      const directJoined = directSettled
        .map((result) =>
          result.status === "fulfilled"
            ? result.value
            : String((result.reason as Error)?.message ?? result.reason),
        )
        .join("\n");
      // Opposite-order direct multi-statement UPDATEs can hit row-lock 40P01
      // even with advisory try-acquire (row locks precede the trigger). That is
      // fail-closed (one TX aborts); hanging forever would be a defect.
      const directAOk =
        directSettled[0]?.status === "fulfilled" &&
        directJoined.includes("s6-direct-a");
      const directBOk =
        directSettled[1]?.status === "fulfilled" &&
        /s6-direct-b/.test(
          directSettled[1]?.status === "fulfilled"
            ? directSettled[1].value
            : "",
        );
      expect(directAOk && directBOk).toBe(false);
      expect(directJoined).toMatch(
        /55P03|40P01|lock timeout|deadlock detected|did not reach s6-direct/i,
      );

      const ltValues = await psql(`
        select string_agg(lead_time_days::text, ',' order by variant_id)
        from public.supplier_products
        where organization_id = ${quote(ORG)}::uuid
          and variant_id in (${quote(VARIANT)}::uuid, ${quote(VARIANT_2)}::uuid)
      `);
      // Both rows must share one writer's committed value (or remain baseline 5
      // if both writers aborted). Never a torn 71/72 mix from a partial writer.
      expect(["5,5", "71,71", "72,72"]).toContain(ltValues);

      await psql(`drop table if exists public.pb1h41_s6_barrier;`);

      record(
        "S6",
        "PASS",
        "opposite-order dual-TX writers fail closed (55P03/40P01); no torn multi-variant write",
      );
    } finally {
      await txA.close();
      await txB.close();
    }
  }, 180000);

  it("S7: lock timeout yields safe rollback with no partial preferred writes", async () => {
    if (!objectsPresent) {
      record("S7", "SKIP", "objects absent / migration unapplied");
      return;
    }
    await ensurePreferredMapping();
    const txA = await openSession();
    try {
      await beginSelectionLock(txA, "s7-locked");

      const before = await psql(`
        select count(*)::text from public.supplier_products
        where organization_id = ${quote(ORG)}::uuid
          and variant_id = ${quote(VARIANT)}::uuid
      `);

      const err = await psqlError(`
        begin;
        set local lock_timeout = '2s';
        set local statement_timeout = '15s';
        insert into public.supplier_products (
          organization_id, supplier_id, variant_id,
          supplier_sku, currency, lead_time_days, preferred
        ) values (
          ${quote(ORG)}::uuid, ${quote(SUPPLIER_2)}::uuid, ${quote(VARIANT)}::uuid,
          'H41-PARTIAL-A', 'USD', 1, true
        );
        insert into public.supplier_products (
          organization_id, supplier_id, variant_id,
          supplier_sku, currency, lead_time_days, preferred
        ) values (
          ${quote(ORG)}::uuid, ${quote(SUPPLIER_3)}::uuid, ${quote(VARIANT)}::uuid,
          'H41-PARTIAL-B', 'USD', 2, true
        );
        commit;
      `);
      expect(err.code).toBe("55P03");

      await txA.run("rollback;", "s7-done");

      expect(
        await psql(`
          select count(*)::text from public.supplier_products
          where organization_id = ${quote(ORG)}::uuid
            and variant_id = ${quote(VARIANT)}::uuid
        `),
      ).toBe(before);

      record("S7", "PASS", "failed multi-insert leaves no partial preferred rows");
    } finally {
      await txA.close();
    }
  }, 120000);

  it("S8: explicit selection exact; ambiguous implicit fails closed", async () => {
    if (!objectsPresent) {
      record("S8", "SKIP", "objects absent / migration unapplied");
      return;
    }
    await ensurePreferredMapping();
    await psql(`
      insert into public.supplier_products (
        organization_id, supplier_id, variant_id,
        supplier_sku, currency, lead_time_days, preferred
      ) values (
        ${quote(ORG)}::uuid, ${quote(SUPPLIER_2)}::uuid, ${quote(VARIANT)}::uuid,
        'H41-AMB', 'USD', 4, true
      );
    `);

    const rows = await loadSupplierRows();
    const ambiguous = resolvePb1TrustedSupplierPlanningFacts({
      resolverVersion: M7_PB1_TRUSTED_SUPPLIER_PLANNING_FACTS_RESOLVER_VERSION_V1,
      organizationId: ORG,
      variantId: VARIANT,
      rows,
    });
    expect(ambiguous.ok).toBe(false);
    if (!ambiguous.ok) {
      expect(ambiguous.code).toBe("SUPPLIER_FACTS_AMBIGUOUS");
    }

    const explicit = resolvePb1TrustedSupplierPlanningFacts({
      resolverVersion: M7_PB1_TRUSTED_SUPPLIER_PLANNING_FACTS_RESOLVER_VERSION_V1,
      organizationId: ORG,
      variantId: VARIANT,
      supplierId: SUPPLIER_1,
      rows,
    });
    expect(explicit.ok).toBe(true);
    if (explicit.ok) {
      expect(explicit.supplierId).toBe(SUPPLIER_1);
      expect(explicit.supplierPlanning.leadTimeDays).toBe(5);
    }

    const fence = evaluatePb1SupplierConcurrencyFence({
      fenceVersion: M7_PB1_SUPPLIER_CONCURRENCY_FENCE_VERSION_V1,
      organizationId: ORG,
      variantId: VARIANT,
      rows,
    });
    expect(fence.ok).toBe(false);
    if (!fence.ok) {
      expect(fence.code).toBe("SUPPLIER_FACTS_AMBIGUOUS");
      expect(fence.productionCreateEligible).toBe(false);
    }

    record("S8", "PASS", "explicit exact; multi-preferred implicit fail-closed");
  }, 120000);

  it("S9: direct DML joins protocol; identity reassignment remains forbidden", async () => {
    if (!objectsPresent) {
      record("S9", "SKIP", "objects absent / migration unapplied");
      return;
    }
    const preferred = await ensurePreferredMapping();
    const txA = await openSession();
    try {
      await beginSelectionLock(txA, "s9-locked");

      const insertErr = await psqlError(`
        begin;
        set local lock_timeout = '2s';
        set local statement_timeout = '15s';
        insert into public.supplier_products (
          organization_id, supplier_id, variant_id,
          supplier_sku, currency, lead_time_days, preferred
        ) values (
          ${quote(ORG)}::uuid, ${quote(SUPPLIER_3)}::uuid, ${quote(VARIANT)}::uuid,
          'H41-DIRECT', 'USD', 2, true
        );
      `);
      expect(insertErr.code).toBe("55P03");

      await txA.run("rollback;", "s9-unlocked");

      // After selection ends, identity reassignment still forbidden.
      const identityErr = await psqlError(`
        begin;
        update public.supplier_products
        set supplier_id = ${quote(SUPPLIER_2)}::uuid
        where id = ${quote(preferred.id)}::uuid;
      `);
      expect(identityErr.message).toMatch(
        /supplier product canonical identity cannot be reassigned/i,
      );

      // Unique(org,supplier,variant) still holds.
      await psql(`
        insert into public.supplier_products (
          organization_id, supplier_id, variant_id,
          supplier_sku, currency, lead_time_days, preferred
        ) values (
          ${quote(ORG)}::uuid, ${quote(SUPPLIER_2)}::uuid, ${quote(VARIANT)}::uuid,
          'H41-OK', 'USD', 3, false
        );
      `);
      const uniq = await psqlError(`
        insert into public.supplier_products (
          organization_id, supplier_id, variant_id,
          supplier_sku, currency, lead_time_days, preferred
        ) values (
          ${quote(ORG)}::uuid, ${quote(SUPPLIER_2)}::uuid, ${quote(VARIANT)}::uuid,
          'H41-DUP', 'USD', 3, false
        );
      `);
      expect(uniq.code === "23505" || uniq.message.toLowerCase().includes("unique")).toBe(
        true,
      );

      record(
        "S9",
        "PASS",
        "direct DML cannot bypass lock; identity reassignment + unique frozen",
      );
    } finally {
      await txA.close();
    }
  }, 120000);

  it("S10: helper grants frozen; h.3 gap demos remain valid until objects applied", async () => {
    if (!objectsPresent) {
      record("S10", "SKIP", "objects absent / migration unapplied");
      return;
    }

    const grants = await psql(`
      select coalesce(string_agg(grantee || ':' || privilege_type, ',' order by 1), '')
      from information_schema.routine_privileges
      where specific_schema = 'public'
        and routine_name = 'acquire_supplier_products_org_variant_xact_lock'
        and grantee in ('anon', 'authenticated', 'PUBLIC', 'public')
    `);
    expect(grants).toBe("");

    // Authenticated still cannot mutate supplier_products (M2.7).
    const tableGrants = await psql(`
      select coalesce(string_agg(privilege_type, ','), '')
      from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name = 'supplier_products'
        and grantee = 'authenticated'
        and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
    `);
    expect(tableGrants).toBe("");

    // csv dispositions still available after rewrite.
    await ensurePreferredMapping();
    const skipped = await psql(`
      begin;
      set local role service_role;
      select disposition
      from public.csv_reconcile_supplier_product(
        ${quote(ORG)}::uuid,
        ${quote(INTEGRATION)}::uuid,
        ${quote(SUPPLIER_1)}::uuid,
        ${quote(VARIANT)}::uuid,
        'H41-PREF',
        null,
        'USD',
        5,
        null,
        null,
        true
      );
      commit;
    `);
    expect(skipped).toMatch(/skipped/);

    record(
      "S10",
      "PASS",
      "grants frozen; csv skipped disposition intact; no browser DML",
    );
  }, 120000);
});
