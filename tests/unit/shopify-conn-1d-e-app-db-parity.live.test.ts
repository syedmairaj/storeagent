import { execFile, spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { promisify } from "node:util";

import { beforeAll, describe, expect, it } from "vitest";

import { assertNonSecretIngestionPayload } from "@/lib/security/secret-ingestion";

/**
 * SHOPIFY-CONN-1d-E — disposable full-chain app/DB parity and concurrency.
 *
 * Requires an EMPTY dedicated database on the isolated Postgres (port 55427;
 * never local Supabase 55322 / 54322 or hosted).
 *
 * Required env when RUN_CONN1D_E_ISOLATED_LIVE=1:
 *   CONN1D_E_PGHOST, CONN1D_E_PGPORT, CONN1D_E_PGDATABASE, CONN1D_E_PGUSER
 * Optional: CONN1D_E_PGPASSWORD
 */

const execFileAsync = promisify(execFile);
const LIVE = process.env.RUN_CONN1D_E_ISOLATED_LIVE === "1";
const describeLive = LIVE ? describe : describe.skip;

const FORBIDDEN_PORTS = new Set(["55322", "54322"]);
const EXPECTED_DISPOSABLE_PORT = "55427";

const BOOTSTRAP = "tests/sql/shopify-conn-1d-e-full-chain-bootstrap.sql";
const ADVERSARIAL = "tests/sql/shopify-conn-1d-e-json-secret-guard-adversarial.sql";
const V15_ROLLBACK = "tests/sql/shopify-conn-1d-e-v15-rollback-additive.sql";
const MIGRATION_1D_E =
  "supabase/migrations/20261124120000_shopify_conn_1d_e_json_secret_guard.sql";

const ORG = "e2000000-0000-4000-8000-000000000001";
const STORE = "e2000000-0000-4000-8000-000000000002";
const INTEG = "e2000000-0000-4000-8000-000000000003";
const LOCATION = "e2000000-0000-4000-8000-000000000004";

/** Non-superuser, non-owner roles holding effective TRIGGER on a protected table. */
const TRIGGER_HOLDERS_SQL = `
select coalesce(string_agg(r.rolname || ':' || t.tb, ',' order by r.rolname, t.tb), '')
from pg_roles r
cross join unnest(array['integrations', 'provider_bindings', 'sync_runs']) as t(tb)
where not r.rolsuper
  and r.rolname not like 'pg\\_%'
  and r.oid <> (select relowner from pg_class where oid = ('public.' || t.tb)::regclass)
  and has_table_privilege(r.oid, ('public.' || t.tb)::regclass, 'TRIGGER')`;

const CORPUS_SEED = 0x1de11;
const CORPUS_SIZE = 2500;

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`CONN-1d-E isolated live requires ${name} (no silent fallback)`);
  }
  return value;
}

function psqlEnv(applicationName = "conn1de_live"): NodeJS.ProcessEnv {
  const port = requiredEnv("CONN1D_E_PGPORT");
  if (FORBIDDEN_PORTS.has(port) || port !== EXPECTED_DISPOSABLE_PORT) {
    throw new Error(`CONN-1d-E isolated live requires port ${EXPECTED_DISPOSABLE_PORT}, got ${port}`);
  }
  return {
    ...process.env,
    PGHOST: requiredEnv("CONN1D_E_PGHOST"),
    PGPORT: port,
    PGDATABASE: requiredEnv("CONN1D_E_PGDATABASE"),
    PGUSER: requiredEnv("CONN1D_E_PGUSER"),
    PGPASSWORD: process.env.CONN1D_E_PGPASSWORD ?? "",
    PGOPTIONS: "-c client_min_messages=warning",
    PGAPPNAME: applicationName,
  };
}

async function psqlFile(filePath: string, singleTransaction = false): Promise<string> {
  const args = ["-v", "ON_ERROR_STOP=1", "-q"];
  if (singleTransaction) {
    args.push("-1");
  }
  args.push("-f", filePath);
  const { stdout, stderr } = await execFileAsync("psql", args, {
    env: psqlEnv(),
    maxBuffer: 20 * 1024 * 1024,
  });
  if (stderr && /ERROR:/i.test(stderr)) {
    throw new Error(stderr);
  }
  return `${stdout}\n${stderr}`;
}

async function psqlScalar(sql: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "psql",
    ["-v", "ON_ERROR_STOP=1", "-At", "-c", sql],
    { env: psqlEnv() },
  );
  return stdout.trim();
}

type SessionResult = { code: number | null; stdout: string; stderr: string };

function psqlSession(script: string, applicationName: string): Promise<SessionResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("psql", ["-v", "ON_ERROR_STOP=1", "-At"], {
      env: psqlEnv(applicationName),
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(script);
  });
}

async function waitFor(sql: string, label: string, timeoutMs = 10_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if ((await psqlScalar(sql)) === "t") {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`barrier timeout: ${label}`);
}

function blockedBy(waiter: string, holder: string): string {
  return `select exists (
    select 1 from pg_stat_activity w, pg_stat_activity h
    where w.application_name = '${waiter}'
      and h.application_name = '${holder}'
      and h.pid = any (pg_blocking_pids(w.pid))
  )`;
}

async function deadlockCount(): Promise<number> {
  return Number(
    await psqlScalar(
      "select pg_stat_clear_snapshot(); select deadlocks from pg_stat_database where datname = current_database()",
    ).then((out) => out.split("\n").pop()),
  );
}

function appAccepts(value: unknown): boolean {
  try {
    assertNonSecretIngestionPayload(value, "integrations.configuration");
    return true;
  } catch {
    return false;
  }
}

// -----------------------------------------------------------------------------
// Seeded differential corpus (deterministic; no new dependency)
// -----------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BENIGN_KEYS = [
  "purpose", "configuredBy", "locationName", "adapterVersion", "orchestration",
  "code", "shop_domain", "scope", "count", "note", "items", "meta", "a", "b",
  "token_kind", "tokenKind", "key_version", "x-y", "Name1", "z_",
];
const SECRET_KEYS = [
  "token", "accessToken", "access_token", "ACCESS_TOKEN", "refresh-token",
  "accesstoken", "ACCESSToken", "access_token_v2", "client_secret", "clientSecret",
  "apiKey", "api_key", "password", "passwd", "Authorization", "cookie", "session",
  "access_nonce", "dek_wrapped", "myCredential", "x_ciphertext", "bearer",
  "privateKey", "auth_tag", "service_role", "shpat_abcdef",
];
const BAD_SHAPE_KEYS = [
  "access.token", "a b", "\u00e9t\u00e9", "\u0430ccess", "_x", "1x", "a".repeat(65),
  "k\u200b", "\uff41",
];
const BENIGN_STRINGS = [
  "ok", "merchant_inventory_import_v1", "\u6f22\u5b57", "\ud83d\ude00", "basic import",
  "Bearer", "token", "shp", "shpat", "eyJ", "Basic abc", "csv-import", "",
];
const SECRET_STRINGS = [
  "shpat_0123456789abcdef", "x_shpat_0123456789", "SHPCA_ABCDEF012345",
  "Bearer abc.def", "bearer\tXYZ", "eyJhbGciOi.eyJzdWIi.sig",
  "Basic dXNlcjpwYXNzd29yZA==", '{"access_token":"x"}', '{"refreshToken" : 1}',
  '{"client_secret":"x"}', "token=shprt_abc123",
];
const UNSTORABLE_STRINGS = ["a\u0000b", "\ud800", "x\udfff"];

type CorpusItem = { value: unknown; injectedSecret: boolean };

function buildCorpus(seed: number, size: number): CorpusItem[] {
  const random = mulberry32(seed);
  const pick = <T,>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;

  function scalar(): unknown {
    const roll = random();
    if (roll < 0.35) return pick(BENIGN_STRINGS);
    if (roll < 0.45) return Math.floor(random() * 1e6) - 5e5;
    if (roll < 0.5) return pick([1e21, 5e-7, 1e300, 0.5, -0, 123456789012345680000]);
    if (roll < 0.55) return random() < 0.5;
    if (roll < 0.6) return null;
    if (roll < 0.63) return pick(UNSTORABLE_STRINGS);
    if (roll < 0.7) return "\u6f22".repeat(Math.floor(random() * 1500));
    if (roll < 0.75) return "x".repeat(Math.floor(random() * 5000));
    return `v${Math.floor(random() * 1e9).toString(36)}`;
  }

  function node(depth: number): unknown {
    if (depth >= 10 || random() < 0.35) {
      return scalar();
    }
    if (random() < 0.3) {
      return Array.from({ length: Math.floor(random() * 4) }, () => node(depth + 1));
    }
    const object: Record<string, unknown> = {};
    const width = Math.floor(random() * 4);
    for (let index = 0; index < width; index += 1) {
      const roll = random();
      const key = roll < 0.85 ? pick(BENIGN_KEYS) : pick(BAD_SHAPE_KEYS);
      object[key] = node(depth + 1);
    }
    return object;
  }

  const corpus: CorpusItem[] = [];
  for (let index = 0; index < size; index += 1) {
    const root: Record<string, unknown> = {};
    const width = 1 + Math.floor(random() * 4);
    for (let field = 0; field < width; field += 1) {
      root[pick(BENIGN_KEYS)] = node(1);
    }

    let injectedSecret = false;
    if (random() < 0.4) {
      let target: Record<string, unknown> = root;
      for (let level = 1; level < 1 + Math.floor(random() * 6); level += 1) {
        const child: Record<string, unknown> = {};
        target[`n${level}`] = child;
        target = child;
      }
      if (random() < 0.5) {
        target[pick(SECRET_KEYS)] = "v";
      } else {
        target[`inj${index}`] = pick(SECRET_STRINGS);
      }
      injectedSecret = true;
    }
    corpus.push({ value: root, injectedSecret });
  }
  return corpus;
}

type DbVerdict = { verdict: "accept" | "reject" | "unstorable"; bytes: number | null };

async function dbVerdicts(serialized: string[]): Promise<DbVerdict[]> {
  const corpusJson = JSON.stringify(serialized);
  expect(corpusJson).not.toContain("$corpus$");
  const script = `
create temporary table conn1de_probe (payload jsonb);
create trigger zz_conn_1d_e_secret_json_guard
before insert on pg_temp.conn1de_probe
for each row execute function public.conn_1d_e_reject_secret_json('payload');
create temporary table conn1de_verdicts (i int, verdict text, bytes int);
do $do$
declare
  v_text text;
  v_i int := 0;
  v_json jsonb;
begin
  for v_text in select jsonb_array_elements_text($corpus$${corpusJson}$corpus$::jsonb) loop
    v_i := v_i + 1;
    begin
      v_json := v_text::jsonb;
    exception when others then
      insert into conn1de_verdicts values (v_i, 'unstorable', null);
      continue;
    end;
    begin
      insert into pg_temp.conn1de_probe (payload) values (v_json);
      insert into conn1de_verdicts values (v_i, 'accept', octet_length(v_json::text));
    exception when sqlstate 'SA011' then
      insert into conn1de_verdicts values (v_i, 'reject', octet_length(v_json::text));
    end;
  end loop;
end;
$do$;
select coalesce(json_agg(json_build_object('verdict', verdict, 'bytes', bytes) order by i), '[]') from conn1de_verdicts;
`;
  const result = await psqlSession(script, "conn1de_corpus");
  expect(result.stderr).not.toMatch(/ERROR:/);
  const last = result.stdout.trim().split("\n").pop() ?? "[]";
  return JSON.parse(last) as DbVerdict[];
}

// -----------------------------------------------------------------------------

describeLive("SHOPIFY-CONN-1d-E app/DB parity (disposable full chain)", () => {
  let migrationCount = 0;

  beforeAll(async () => {
    const identity = await psqlScalar(
      `select current_database() || '|' || inet_server_port()::text || '|' ||
              (select setting from pg_settings where name = 'data_directory')`,
    );
    process.stdout.write(`\n[CONN-1d-E] disposable identity: ${identity}\n`);
    expect(identity.startsWith(`${requiredEnv("CONN1D_E_PGDATABASE")}|`)).toBe(true);
    expect(identity.split("|")[1]).toBe(EXPECTED_DISPOSABLE_PORT);
    expect(identity).not.toContain("/var/lib/postgresql/data");
    expect(await psqlScalar("select to_regclass('public.integrations') is null")).toBe("t");

    await psqlFile(BOOTSTRAP);
    const migrations = readdirSync("supabase/migrations")
      .filter((file) => file.endsWith(".sql"))
      .sort();
    for (const file of migrations) {
      await psqlFile(`supabase/migrations/${file}`, true);
      migrationCount += 1;
    }
  }, 300_000);

  it("L1 replays the full migration chain with 1d-E last", async () => {
    const files = readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql")).sort();
    expect(migrationCount).toBe(files.length);
    expect(files.at(-1)).toBe(MIGRATION_1D_E.split("/").pop());
    expect(
      await psqlScalar("select count(*) from pg_trigger where tgname = 'zz_conn_1d_e_secret_json_guard'"),
    ).toBe("3");
    expect(
      await psqlScalar("select has_table_privilege('service_role', 'public.integrations', 'INSERT')"),
    ).toBe("t");
    expect(
      await psqlScalar("select rolbypassrls from pg_roles where rolname = 'service_role'"),
    ).toBe("t");
    expect(await psqlScalar(TRIGGER_HOLDERS_SQL)).toBe("");
  });

  it("L2 adversarial SQL matrix (A-F, 11 CSV writer RPCs, liveness, grants, catalog)", async () => {
    const output = await psqlFile(ADVERSARIAL);
    for (const marker of [
      "E0 ensure-integration configuration round-trip PASS",
      "A1/A2 integrations.configuration insert+update deny PASS",
      "A3/A4 provider_bindings + sync_runs insert+update deny PASS",
      "A5 table-owner DML deny PASS",
      "C1-C8 csv_bind_location + 7 csv_reconcile_* PASS",
      "C9-C11 sync-run writers + G1/G2 completion/failure liveness PASS",
      "D1-D3 changed-value semantics on legacy rows PASS",
      "E1-E6 guard grants / TRIGGER revoked / no RPC exposure PASS",
      "F1-F3 trigger catalog order / enabled / no later rewrite PASS",
      "CONN-1d-E adversarial PASS",
    ]) {
      expect(output).toContain(marker);
    }
  }, 120_000);

  it("L3 seeded differential corpus: app-accept implies DB-accept; injected secrets rejected by both", async () => {
    const corpus = buildCorpus(CORPUS_SEED, CORPUS_SIZE);
    const serialized = corpus.map((item) => JSON.stringify(item.value));
    const db = await dbVerdicts(serialized);
    expect(db).toHaveLength(corpus.length);

    const stats = { appAccept: 0, dbAccept: 0, bothReject: 0, appOnlyReject: 0, unstorable: 0, injected: 0 };
    const violations: string[] = [];

    corpus.forEach((item, index) => {
      const app = appAccepts(item.value);
      const verdict = db[index] as DbVerdict;
      if (app) stats.appAccept += 1;
      if (verdict.verdict === "accept") stats.dbAccept += 1;
      if (verdict.verdict === "unstorable") stats.unstorable += 1;
      if (!app && verdict.verdict === "reject") stats.bothReject += 1;
      if (!app && verdict.verdict === "accept") stats.appOnlyReject += 1;
      if (item.injectedSecret) stats.injected += 1;

      if (app && verdict.verdict !== "accept") {
        violations.push(`#${index} app accepted but DB ${verdict.verdict}`);
      }
      if (app && (verdict.bytes ?? 0) > 6144) {
        violations.push(`#${index} app-accepted payload expanded beyond 1.5x`);
      }
      if (item.injectedSecret && (app || verdict.verdict === "accept")) {
        violations.push(`#${index} injected secret accepted (app=${app}, db=${verdict.verdict})`);
      }
    });

    process.stdout.write(`[CONN-1d-E] corpus seed=${CORPUS_SEED} size=${CORPUS_SIZE} ${JSON.stringify(stats)}\n`);
    expect(violations).toEqual([]);
    expect(stats.appAccept).toBeGreaterThan(100);
    expect(stats.bothReject).toBeGreaterThan(100);
    expect(stats.appOnlyReject).toBeGreaterThan(10);
  }, 120_000);

  it("L4 size boundaries: worst-case 1.5x expansion of a 4096-byte app payload stays under 8192", async () => {
    const zeros = { a: [...Array.from({ length: 2043 }, () => 0), 10] };
    const compact = JSON.stringify(zeros);
    expect(Buffer.byteLength(compact, "utf8")).toBe(4096);
    expect(appAccepts(zeros)).toBe(true);
    expect(appAccepts({ a: [...zeros.a, 0] })).toBe(false);

    const cjk = { a: "\u6f22".repeat(1362) + "xx" };
    expect(Buffer.byteLength(JSON.stringify(cjk), "utf8")).toBe(4096);
    expect(appAccepts(cjk)).toBe(true);

    const [zerosDb, cjkDb] = await dbVerdicts([compact, JSON.stringify(cjk)]);
    expect(zerosDb?.verdict).toBe("accept");
    expect(zerosDb?.bytes).toBeGreaterThan(6000);
    expect(zerosDb?.bytes).toBeLessThanOrEqual(6144);
    expect(cjkDb?.verdict).toBe("accept");
    expect(cjkDb?.bytes).toBeLessThanOrEqual(4097);

    const tooBig = await dbVerdicts([JSON.stringify({ a: "x".repeat(8184) })]);
    expect(tooBig[0]).toEqual({ verdict: "reject", bytes: 8193 });
  }, 60_000);

  it("L5 two-session CSV binding race with the guard: one imported, one skipped, no deadlock", async () => {
    const before = await deadlockCount();
    const meta = '{"configuredBy":"merchant_inventory_import_v1","locationName":"RACE"}';
    const call = `select disposition from public.csv_bind_location('${ORG}', '${STORE}', '${INTEG}', 'RACE-LOC', '${LOCATION}', '${meta}'::jsonb);`;

    const first = psqlSession(
      `set role service_role;\nbegin;\n${call}\nselect pg_sleep(1.5);\ncommit;\n`,
      "conn1de_bind_a",
    );
    await waitFor(
      "select exists (select 1 from pg_stat_activity where application_name = 'conn1de_bind_a' and query like '%pg_sleep%')",
      "bind A holding insert",
    );
    const second = psqlSession(`set role service_role;\n${call}\n`, "conn1de_bind_b");
    await waitFor(blockedBy("conn1de_bind_b", "conn1de_bind_a"), "bind B blocked by A");

    const [a, b] = await Promise.all([first, second]);
    expect(a.stderr).not.toMatch(/ERROR:/);
    expect(b.stderr).not.toMatch(/ERROR:/);
    expect(a.stdout).toContain("imported");
    expect(b.stdout).toContain("skipped");
    expect(await deadlockCount()).toBe(before);
  }, 60_000);

  it("L6 two-session migration lock race: a writer blocked during apply is validated by the new trigger", async () => {
    await psqlFile(V15_ROLLBACK);
    expect(
      await psqlScalar("select count(*) from pg_trigger where tgname = 'zz_conn_1d_e_secret_json_guard'"),
    ).toBe("0");
    const before = await deadlockCount();

    const migration = psqlSession(
      `begin;\n\\i ${MIGRATION_1D_E}\nselect pg_sleep(1.5);\ncommit;\n`,
      "conn1de_mig",
    );
    await waitFor(
      `select exists (select 1 from pg_locks l join pg_stat_activity a on a.pid = l.pid
        where a.application_name = 'conn1de_mig' and l.relation = 'public.integrations'::regclass
          and l.mode = 'ShareRowExclusiveLock' and l.granted)`,
      "migration holds lock",
    );

    const secretWriter = psqlSession(
      `set role service_role;\ninsert into public.integrations (organization_id, provider, status, configuration) values ('${ORG}', 'csv', 'pending', '{"access_token":"race-secret"}');\n`,
      "conn1de_race_bad",
    );
    const cleanWriter = psqlSession(
      `set role service_role;\ninsert into public.integrations (organization_id, provider, status, configuration) values ('${ORG}', 'csv', 'pending', '{"purpose":"race-clean"}');\n`,
      "conn1de_race_ok",
    );
    await waitFor(blockedBy("conn1de_race_bad", "conn1de_mig"), "secret writer blocked");
    await waitFor(blockedBy("conn1de_race_ok", "conn1de_mig"), "clean writer blocked");

    const [mig, bad, ok] = await Promise.all([migration, secretWriter, cleanWriter]);
    expect(mig.stderr).not.toMatch(/ERROR:/);
    expect(bad.stderr).toContain("secret material rejected at JSON boundary (integrations.configuration)");
    expect(bad.stderr).not.toContain("race-secret");
    expect(ok.stderr).not.toMatch(/ERROR:/);
    expect(
      await psqlScalar("select count(*) from public.integrations where configuration::text like '%race-secret%'"),
    ).toBe("0");
    expect(
      await psqlScalar(`select count(*) from public.integrations where configuration = '{"purpose":"race-clean"}'`),
    ).toBe("1");
    expect(await deadlockCount()).toBe(before);
  }, 60_000);

  it("L7 existing invalid row aborts the migration atomically with counts-only diagnostics", async () => {
    await psqlFile(V15_ROLLBACK);
    await psqlScalar(
      `insert into public.integrations (id, organization_id, provider, status, configuration)
       values ('e2000000-0000-4000-8000-000000000099', '${ORG}', 'shopify', 'pending', '{"refresh_token":"planted-secret"}')`,
    );

    const failed = await execFileAsync(
      "psql",
      ["-v", "ON_ERROR_STOP=1", "-q", "-1", "-f", MIGRATION_1D_E],
      { env: psqlEnv() },
    ).then(
      () => null,
      (error: { stderr?: string }) => error.stderr ?? "",
    );
    expect(failed).toContain(
      'CONN-1d-E existing-row scan rejected 1 value(s): {"integrations.configuration": 1}',
    );
    expect(failed).not.toContain("planted-secret");
    expect(
      await psqlScalar(
        "select (select count(*) from pg_proc where proname = 'conn_1d_e_reject_secret_json') || '|' || (select count(*) from pg_trigger where tgname = 'zz_conn_1d_e_secret_json_guard')",
      ),
    ).toBe("0|0");
    expect(
      await psqlScalar(
        "select configuration ->> 'refresh_token' from public.integrations where id = 'e2000000-0000-4000-8000-000000000099'",
      ),
    ).toBe("planted-secret");

    await psqlScalar("delete from public.integrations where id = 'e2000000-0000-4000-8000-000000000099'");
    await psqlFile(MIGRATION_1D_E, true);
    expect(
      await psqlScalar("select count(*) from pg_trigger where tgname = 'zz_conn_1d_e_secret_json_guard'"),
    ).toBe("3");
  }, 60_000);

  it("L8 V15 rollback leaves M2.6/M2.7 + CONN intact, and reapply restores enforcement", async () => {
    const rollback = await psqlFile(V15_ROLLBACK);
    expect(rollback).toContain("CONN-1d-E V15 rollback PASS");
    await psqlFile(MIGRATION_1D_E, true);

    const denied = await execFileAsync(
      "psql",
      ["-v", "ON_ERROR_STOP=1", "-At", "-c", "set role service_role", "-c",
        `insert into public.integrations (organization_id, provider, status, configuration) values ('${ORG}', 'csv', 'pending', '{"apiKey":"reapply-probe"}')`],
      { env: psqlEnv() },
    ).then(
      () => "",
      (error: { stderr?: string }) => error.stderr ?? "",
    );
    expect(denied).toContain("secret material rejected at JSON boundary (integrations.configuration)");
    expect(
      await psqlScalar(
        "select string_agg(tgname, ',' order by tgname) from pg_trigger where tgrelid = 'public.integrations'::regclass and not tgisinternal",
      ),
    ).toBe("integrations_prevent_identity_reassignment,integrations_set_updated_at,zz_conn_1d_e_secret_json_guard");
    expect(await psqlScalar(TRIGGER_HOLDERS_SQL)).toBe("");
  }, 60_000);
});
