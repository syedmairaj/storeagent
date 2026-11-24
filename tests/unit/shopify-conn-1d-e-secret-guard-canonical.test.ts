import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertNonSecretIngestionPayload,
  guardOptionalNonSecretJson,
  isSecretIngestionError,
  SecretIngestionError,
} from "@/lib/security/secret-ingestion";

const BOUNDARY = "integrations.configuration" as const;
const SYNTHETIC_ACCESS = "shpat_conn1de_fixture_0123456789";
const MIGRATION =
  "supabase/migrations/20261124120000_shopify_conn_1d_e_json_secret_guard.sql";

function rejects(value: unknown): boolean {
  try {
    assertNonSecretIngestionPayload(value, BOUNDARY);
    return false;
  } catch (error) {
    expect(error).toBeInstanceOf(SecretIngestionError);
    expect(isSecretIngestionError(error)).toBe(true);
    expect(String(error)).not.toContain(SYNTHETIC_ACCESS);
    return true;
  }
}

function nest(depth: number, leaf: unknown, asArray = false): unknown {
  let value = leaf;
  for (let level = 0; level < depth; level += 1) {
    value = asArray ? [value] : { a: value };
  }
  return value;
}

describe("CONN-1d-E red-team bypasses are rejected by the app guard", () => {
  const keyBypasses: Record<string, unknown> = {
    bare_token: { token: "abc" },
    accesstoken: { accesstoken: "x" },
    ACCESSToken: { ACCESSToken: "x" },
    dotted: { "access.token": "x" },
    spaced: { "access token": "x" },
    suffix_v2: { access_token_v2: "x" },
    accessTokenValue: { accessTokenValue: "x" },
    zero_width: { "access\u200b": "x" },
    cyrillic: { "\u0430ccess": "x" },
    fullwidth: { "\uff41ccess": "x" },
    leading_underscore: { _private: "x" },
    leading_digit: { "1key": "x" },
    long_key: { ["a".repeat(65)]: "x" },
    shpat_key: { shpat_0123456789: 1 },
    session: { session: "x" },
    access_nonce: { access_nonce: "x" },
    authorization: { Authorization: "x" },
    cookie: { setCookie: "x" },
    dek_wrap_nonce: { dek_wrap_nonce: "x" },
  };

  for (const [label, value] of Object.entries(keyBypasses)) {
    it(`rejects key bypass: ${label}`, () => {
      expect(rejects(value)).toBe(true);
    });
  }

  const valueBypasses: Record<string, unknown> = {
    underscore_prefixed_shpat: { note: "x_shpat_0123456789abcdef" },
    shpat_fixture: { note: `failed ${SYNTHETIC_ACCESS}` },
    jwt: { note: "eyJhbGciOi.eyJzdWIi.sig" },
    basic_auth: { note: "Basic dXNlcjpwYXNz" },
    stringified_access_token: { note: '{"access_token":"x"}' },
    stringified_client_secret: { note: '{ "clientSecret" : "x" }' },
    bearer_nbsp: { note: "Bearer\u00a0abcdef" },
  };

  for (const [label, value] of Object.entries(valueBypasses)) {
    it(`rejects value bypass: ${label}`, () => {
      expect(rejects(value)).toBe(true);
    });
  }
});

describe("CONN-1d-E serialization hazards", () => {
  it("rejects a prototype toJSON that would persist a secret", () => {
    class Hooked {
      toJSON() {
        return { access_token: SYNTHETIC_ACCESS };
      }
    }
    expect(JSON.stringify(new Hooked())).toContain("access_token");
    expect(rejects(new Hooked())).toBe(true);
    expect(rejects({ nested: new Hooked() })).toBe(true);
  });

  it("rejects an own toJSON function", () => {
    expect(rejects({ toJSON: () => ({ access_token: "x" }) })).toBe(true);
  });

  it("rejects a getter (TOCTOU) without invoking it", () => {
    let reads = 0;
    const value = {
      get note() {
        reads += 1;
        return reads > 1 ? SYNTHETIC_ACCESS : "ok";
      },
    };
    expect(rejects(value)).toBe(true);
    expect(reads).toBe(0);
  });

  it("rejects proxies without invoking traps", () => {
    let trapped = 0;
    const proxy = new Proxy(
      { note: "ok" },
      {
        ownKeys(target) {
          trapped += 1;
          return Reflect.ownKeys(target);
        },
        get(target, key, receiver) {
          trapped += 1;
          return Reflect.get(target, key, receiver);
        },
        getPrototypeOf(target) {
          trapped += 1;
          return Reflect.getPrototypeOf(target);
        },
      },
    );
    expect(rejects(proxy)).toBe(true);
    expect(rejects({ inner: proxy })).toBe(true);
    expect(trapped).toBe(0);
  });

  it("rejects non-plain objects that would serialize lossily", () => {
    expect(rejects(new Map([["access_token", "x"]]))).toBe(true);
    expect(rejects(new Set(["x"]))).toBe(true);
    expect(rejects({ at: new Date(0) })).toBe(true);
    expect(rejects({ re: /x/ })).toBe(true);
    expect(rejects(Object.create({ inherited: true }))).toBe(true);
  });

  it("rejects symbol keys, extra array properties and accessor array items", () => {
    expect(rejects({ [Symbol("s")]: "x" })).toBe(true);
    const tagged = Object.assign(["a"], { extra: "x" });
    expect(rejects(tagged)).toBe(true);
    const accessorArray: unknown[] = ["a"];
    Object.defineProperty(accessorArray, 0, { get: () => SYNTHETIC_ACCESS });
    expect(rejects(accessorArray)).toBe(true);
  });

  it("rejects sparse-array holes before an inherited index getter can run", () => {
    let reads = 0;
    Object.defineProperty(Array.prototype, "0", {
      get() {
        reads += 1;
        return SYNTHETIC_ACCESS;
      },
      configurable: true,
    });
    try {
      expect(rejects({ items: [, "b"] })).toBe(true);
      expect(rejects(new Array(2))).toBe(true);
      expect(reads).toBe(0);
    } finally {
      delete (Array.prototype as unknown as Record<string, unknown>)["0"];
    }
    expect(rejects({ items: [, "b"] })).toBe(true);
    expect(rejects({ items: [null, "b"] })).toBe(false);
    expect(rejects({ items: [] })).toBe(false);
  });

  it("rejects cycles, shared references, functions, bigint and symbols", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(rejects(cyclic)).toBe(true);
    const shared = { a: 1 };
    expect(rejects({ x: shared, y: shared })).toBe(true);
    expect(rejects({ fn: () => 1 })).toBe(true);
    expect(rejects({ big: BigInt(1) })).toBe(true);
    expect(rejects({ sym: Symbol("x") })).toBe(true);
  });

  it("rejects global Object/Array prototype toJSON pollution", () => {
    for (const prototype of [Object.prototype, Array.prototype]) {
      Object.defineProperty(prototype, "toJSON", {
        value: () => ({ access_token: "polluted" }),
        configurable: true,
        writable: true,
      });
      try {
        expect(rejects({ purpose: "ok" })).toBe(true);
      } finally {
        delete (prototype as { toJSON?: unknown }).toJSON;
      }
    }
    expect(rejects({ purpose: "ok" })).toBe(false);
  });

  it("returns a validated canonical copy that later mutation cannot change", () => {
    const input = { purpose: "merchant_inventory_import_v1", nested: { a: 1 } };
    const output = assertNonSecretIngestionPayload(input, BOUNDARY);
    expect(output).toEqual(input);
    expect(output).not.toBe(input);
    input.nested.a = 2;
    (input as Record<string, unknown>).access_token = SYNTHETIC_ACCESS;
    expect(output).toEqual({
      purpose: "merchant_inventory_import_v1",
      nested: { a: 1 },
    });
    expect(Object.getPrototypeOf(output)).toBe(Object.prototype);
  });

  it("accepts null-prototype plain objects and canonicalizes them", () => {
    const value = Object.assign(Object.create(null), { a: 1 });
    const output = assertNonSecretIngestionPayload(value, BOUNDARY);
    expect(output).toEqual({ a: 1 });
    expect(Object.getPrototypeOf(output)).toBe(Object.prototype);
  });

  it("keeps null/undefined semantics of the optional guard", () => {
    expect(guardOptionalNonSecretJson(null, BOUNDARY)).toBeNull();
    expect(guardOptionalNonSecretJson(undefined, BOUNDARY)).toBeNull();
    expect(assertNonSecretIngestionPayload(undefined, BOUNDARY)).toBeUndefined();
  });
});

describe("CONN-1d-E storable JSON boundaries", () => {
  it("rejects numbers that are not finite or render with an exponent", () => {
    for (const value of [Number.NaN, Infinity, -Infinity, 1e21, 1e300, 5e-7]) {
      expect(rejects({ n: value }), String(value)).toBe(true);
    }
    for (const value of [0, -0, 1, -1.5, 1e20, 0.000001, Number.MAX_SAFE_INTEGER]) {
      expect(rejects({ n: value }), String(value)).toBe(false);
    }
  });

  it("rejects NUL and lone surrogates in values and keys; accepts valid Unicode", () => {
    expect(rejects({ note: "a\u0000b" })).toBe(true);
    expect(rejects({ note: "\ud800" })).toBe(true);
    expect(rejects({ note: "\udc00x" })).toBe(true);
    expect(rejects({ ["k\ud800"]: 1 })).toBe(true);
    expect(rejects({ note: "漢字 ✓ é 😀" })).toBe(false);
  });

  it("enforces a 4096-byte UTF-8 cap (not UTF-16 length)", () => {
    const overhead = Buffer.byteLength('{"a":""}', "utf8");
    const cjk = "漢";
    const fit = Math.floor((4096 - overhead) / 3);
    const atCap = { a: cjk.repeat(fit) + "x".repeat(4096 - overhead - fit * 3) };
    expect(Buffer.byteLength(JSON.stringify(atCap), "utf8")).toBe(4096);
    expect(rejects(atCap)).toBe(false);

    const overCap = { a: `${atCap.a}x` };
    expect(Buffer.byteLength(JSON.stringify(overCap), "utf8")).toBe(4097);
    expect(rejects(overCap)).toBe(true);

    const utf16Small = { a: cjk.repeat(1400) };
    expect(JSON.stringify(utf16Small).length).toBeLessThan(4096);
    expect(rejects(utf16Small)).toBe(true);
  });

  it("enforces depth 8 for objects, arrays and mixed nesting", () => {
    expect(rejects(nest(8, 1))).toBe(false);
    expect(rejects(nest(9, 1))).toBe(true);
    expect(rejects(nest(8, 1, true))).toBe(false);
    expect(rejects(nest(9, 1, true))).toBe(true);
    expect(rejects(nest(8, {}))).toBe(false);
    expect(rejects(nest(9, {}))).toBe(true);
    expect(rejects(nest(9, null))).toBe(true);
    expect(
      rejects({ a: [{ b: [{ c: [{ d: [{ e: 1 }] }] }] }] }),
    ).toBe(true);
  });

  it("accepts typed exemptions and every real CSV writer payload", () => {
    const accepted: unknown[] = [
      { token_kind: "offline_expiring", key_version: 1 },
      { tokenKind: "offline_expiring", keyVersion: 2 },
      { purpose: "merchant_inventory_import_v1" },
      { configuredBy: "merchant_inventory_import_v1", locationName: "MAIN" },
      { adapterVersion: "merchant-inventory-import-v1-product" },
      { orchestration: "csv-import" },
      { code: "CSV_IMPORT_ORCHESTRATION_FAILED" },
      { shop_domain: "org-a.myshopify.com", scope: "read_products" },
      { message: "basic import" },
      { ["a".repeat(64)]: "x" },
    ];
    for (const value of accepted) {
      expect(rejects(value), JSON.stringify(value)).toBe(false);
    }
  });

  it("stays monotonic with every CONN-1d-A rejection fixture", () => {
    const priorRejections: unknown[] = [
      { access_token: "not-a-shopify-shape" },
      { nested: { refreshToken: "x" } },
      { access_ciphertext: "\\xaa" },
      { envelope: { dek_wrapped: "\\xbb" } },
      { note: "failed shpat_test_access_token_fixture_1daa" },
      { errors: ["shprt_test_refresh_token_fixture_1dbb"] },
      { detail: "Authorization Bearer abc.def.ghi-secret" },
      { shopify_access_token: "x" },
      { message: "Bearer token missing" },
      { client_secret: "x" },
      { apikey: "x" },
      { api_key: "x" },
      { id_token: "x" },
      { private_key: "x" },
      { refresh_lock_token: "x" },
      { auth_tag: "x" },
      { dek_wrap_auth_tag: "x" },
      { service_role: "x" },
      { passwd: "x" },
      { credentials: "x" },
      { cookie: "x" },
    ];
    for (const value of priorRejections) {
      expect(rejects(value), JSON.stringify(value)).toBe(true);
    }
  });
});

describe("CONN-1d-E app/DB policy source parity", () => {
  const appSource = readFileSync(
    join(process.cwd(), "lib/security/secret-ingestion.ts"),
    "utf8",
  );
  const migration = readFileSync(join(process.cwd(), MIGRATION), "utf8");

  it("uses the same folded-key fragment list in the app and the trigger", () => {
    const appFragment = /FORBIDDEN_KEY_FRAGMENT =\s*\/([^/]+)\//.exec(appSource)?.[1];
    expect(appFragment).toBeTruthy();
    expect(migration).toContain(`v_folded ~ '(${appFragment})'`);
  });

  it("uses the same caps, key shape and exemptions", () => {
    expect(appSource).toContain("MAX_DEPTH = 8");
    expect(appSource).toContain("MAX_UTF8_BYTES = 4096");
    expect(migration).toContain("'strict $.**{9 to last}'");
    expect(migration).toContain("> 8192");
    expect(appSource).toContain("/^[A-Za-z][A-Za-z0-9_-]{0,63}$/");
    expect(migration).toContain("'^[A-Za-z][A-Za-z0-9_-]{0,63}$'");
    expect(migration).toContain("('tokenkind', 'keyversion')");
    expect(migration).toContain("('session', 'accessnonce', 'refreshnonce')");
  });

  it("never uses \\b in the trigger body (backspace in PostgreSQL ARE)", () => {
    const body = /create function public\.conn_1d_e_reject_secret_json\(\)[\s\S]*?as \$\$([\s\S]*?)\$\$;/.exec(migration)?.[1];
    expect(body).toBeTruthy();
    expect(body).toContain("shp(at|ca|pa|ss|rt)_");
    expect(body).not.toMatch(/\\b/);
  });

  it("keeps the trigger function non-callable and non-definer", () => {
    expect(migration).not.toMatch(/security\s+definer/i);
    expect(migration).toMatch(
      /revoke all\s+on function public\.conn_1d_e_reject_secret_json\(\)\s+from public, anon, authenticated, service_role;/,
    );
    expect(migration).not.toMatch(/grant\s+execute/i);
    expect(migration).toContain("returns trigger");
    expect(migration).toContain("errcode = 'SA011'");
  });

  it("revokes TRIGGER on all three protected tables from every API role", () => {
    expect(migration).toMatch(
      /revoke trigger\s+on table\s+public\.integrations,\s+public\.provider_bindings,\s+public\.sync_runs\s+from public, anon, authenticated, service_role;/,
    );
  });
});

// -----------------------------------------------------------------------------
// Future-migration protection: chronological static model of the guard
// -----------------------------------------------------------------------------

const GUARD_TRIGGER = "zz_conn_1d_e_secret_json_guard";
const GUARD_FUNCTION = "conn_1d_e_reject_secret_json";
const GUARD_MIGRATION = "20261124120000_shopify_conn_1d_e_json_secret_guard.sql";
const PROTECTED_TABLES_LIST = ["integrations", "provider_bindings", "sync_runs"] as const;
type ProtectedTable = (typeof PROTECTED_TABLES_LIST)[number];
const GUARD_ARGS: Record<ProtectedTable, string[]> = {
  integrations: ["configuration"],
  provider_bindings: ["source_metadata"],
  sync_runs: ["error_summary", "reconciliation_metadata"],
};
/** Supabase default privileges grant ALL (including TRIGGER) to these. */
const AMBIENT_TRIGGER_ROLES = ["public", "anon", "authenticated", "service_role"];
/** Table owner / superuser: residual bypass, out of static scope. */
const OWNER_EQUIVALENT_ROLES = new Set(["postgres", "supabase_admin"]);

const IDENT = String.raw`(?:"(?:[^"]|"")+"|[A-Za-z_][A-Za-z0-9_$]*)`;
const QNAME = String.raw`${IDENT}(?:\s*\.\s*${IDENT})?`;

type MigrationSource = { file: string; sql: string };
type QualifiedName = { schema: string | null; name: string };
type TriggerState = {
  timing: string;
  events: string;
  row: boolean;
  fn: QualifiedName | null;
  args: string[];
  enabled: "O" | "D" | "R" | "A";
};

function normIdent(raw: string): string {
  return raw.startsWith('"') ? raw.slice(1, -1).replace(/""/g, '"') : raw.toLowerCase();
}

function parseQName(raw: string): QualifiedName {
  const parts = (raw.match(new RegExp(IDENT, "g")) ?? []).map(normIdent);
  return parts.length >= 2
    ? { schema: parts[0], name: parts[1] }
    : { schema: null, name: parts[0] ?? "" };
}

function protectedTable(name: QualifiedName): ProtectedTable | null {
  if (name.schema !== null && name.schema !== "public") {
    return null;
  }
  return (PROTECTED_TABLES_LIST as readonly string[]).includes(name.name)
    ? (name.name as ProtectedTable)
    : null;
}

function isGuardFunction(name: QualifiedName): boolean {
  return (name.schema === null || name.schema === "public") && name.name === GUARD_FUNCTION;
}

/** C-collation (byte) order, as PostgreSQL uses for trigger firing order. */
function sortsAfter(a: string, b: string): boolean {
  return Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8")) > 0;
}

/**
 * Split SQL into statements, dropping comments and recursing into
 * dollar-quoted bodies so DO blocks, function bodies and $q$-quoted dynamic
 * SQL are analyzed as statements too.
 */
function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let index = 0;
  const flush = () => {
    const text = current.replace(/\s+/g, " ").trim();
    if (text) {
      statements.push(text);
    }
    current = "";
  };
  while (index < sql.length) {
    const char = sql[index];
    if (sql.startsWith("--", index)) {
      const end = sql.indexOf("\n", index);
      index = end === -1 ? sql.length : end;
      current += " ";
      continue;
    }
    if (sql.startsWith("/*", index)) {
      let depth = 1;
      index += 2;
      while (index < sql.length && depth > 0) {
        if (sql.startsWith("/*", index)) {
          depth += 1;
          index += 2;
        } else if (sql.startsWith("*/", index)) {
          depth -= 1;
          index += 2;
        } else {
          index += 1;
        }
      }
      current += " ";
      continue;
    }
    if (char === "'" || char === '"') {
      const backslashEscapes = char === "'" && /(?:^|[^A-Za-z0-9_$])[eE]$/.test(current);
      let end = index + 1;
      while (end < sql.length) {
        if (backslashEscapes && sql[end] === "\\") {
          end += 2;
          continue;
        }
        if (sql[end] === char) {
          if (sql[end + 1] === char) {
            end += 2;
            continue;
          }
          break;
        }
        end += 1;
      }
      current += sql.slice(index, end + 1);
      index = end + 1;
      continue;
    }
    if (char === "$" && !/[A-Za-z0-9_$]$/.test(current)) {
      const tag = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(index))?.[0];
      if (tag) {
        const close = sql.indexOf(tag, index + tag.length);
        const end = close === -1 ? sql.length : close;
        statements.push(...splitStatements(sql.slice(index + tag.length, end)));
        current += " $body$ ";
        index = end + tag.length;
        continue;
      }
    }
    if (char === ";") {
      flush();
      index += 1;
      continue;
    }
    current += char;
    index += 1;
  }
  flush();
  return statements;
}

function splitList(text: string): string[] {
  return text.split(",").map((item) => item.trim()).filter(Boolean);
}

function analyzeGuardMigrations(sources: readonly MigrationSource[]): {
  violations: string[];
  triggers: Record<ProtectedTable, Map<string, TriggerState>>;
} {
  const violations: string[] = [];
  const triggers = {
    integrations: new Map<string, TriggerState>(),
    provider_bindings: new Map<string, TriggerState>(),
    sync_runs: new Map<string, TriggerState>(),
  } satisfies Record<ProtectedTable, Map<string, TriggerState>>;
  const holders = {
    integrations: new Set(AMBIENT_TRIGGER_ROLES),
    provider_bindings: new Set(AMBIENT_TRIGGER_ROLES),
    sync_runs: new Set(AMBIENT_TRIGGER_ROLES),
  } satisfies Record<ProtectedTable, Set<string>>;
  const memberships = new Map<string, Set<string>>();
  let guardFunctionDefinitions = 0;

  const files = sources.map((source) => source.file);
  files.forEach((file, position) => {
    if (!/^\d{14}_[a-z0-9_]+\.sql$/.test(file)) {
      violations.push(`${file}: migration name is not chronological`);
    }
    if (position > 0 && !(files[position - 1] < file)) {
      violations.push(`${file}: migrations are not in strictly chronological order`);
    }
  });
  const guardPosition = files.indexOf(GUARD_MIGRATION);
  if (guardPosition === -1) {
    violations.push(`guard migration ${GUARD_MIGRATION} is missing`);
  }

  const forTables = (objects: string, apply: (table: ProtectedTable) => void) => {
    const allTables = /^all\s+tables\s+in\s+schema\s+(.+)$/i.exec(objects);
    if (allTables) {
      if (splitList(allTables[1]).map(normIdent).includes("public")) {
        PROTECTED_TABLES_LIST.forEach(apply);
      }
      return;
    }
    if (/^(?:function|procedure|routine|schema|sequence|all\s|database|type|domain|foreign|large|language|tablespace|parameter)\b/i.test(objects)) {
      return;
    }
    for (const item of splitList(objects.replace(/^table\s+/i, ""))) {
      const table = protectedTable(parseQName(item));
      if (table) {
        apply(table);
      }
    }
  };

  sources.forEach((source, position) => {
    const afterGuard = guardPosition !== -1 && position > guardPosition;
    const where = source.file;
    const statements = splitStatements(source.sql);

    if (afterGuard) {
      const text = statements.join(";\n").toLowerCase();
      if (text.includes(GUARD_TRIGGER) || text.includes(GUARD_FUNCTION)) {
        violations.push(`${where}: later migration references the 1d-E guard (owner review required)`);
      }
    }

    for (const raw of statements) {
      const start = raw.search(/\b(?:create|drop|alter|grant|revoke)\b/i);
      if (start === -1) {
        continue;
      }
      const statement = raw.slice(start);
      let match: RegExpExecArray | null;

      if ((match = new RegExp(String.raw`^create\s+(?:or\s+replace\s+)?(?:constraint\s+)?trigger\s+(${IDENT})\s+(before|after|instead\s+of)\s+(.+?)\s+on\s+(${QNAME})(?:\s+(.*))?$`, "i").exec(statement))) {
        const table = protectedTable(parseQName(match[4]));
        if (table) {
          const rest = match[5] ?? "";
          const execute = new RegExp(String.raw`execute\s+(?:function|procedure)\s+(${QNAME})\s*\(([^)]*)\)`, "i").exec(rest);
          triggers[table].set(normIdent(match[1]), {
            timing: match[2].toLowerCase(),
            events: match[3].toLowerCase(),
            row: /\bfor\s+each\s+row\b/i.test(rest),
            fn: execute ? parseQName(execute[1]) : null,
            args: execute
              ? splitList(execute[2]).map((arg) => arg.replace(/^'(.*)'$/, "$1"))
              : [],
            enabled: "O",
          });
        }
        continue;
      }

      if ((match = new RegExp(String.raw`^drop\s+trigger\s+(?:if\s+exists\s+)?(${IDENT})\s+on\s+(${QNAME})`, "i").exec(statement))) {
        const table = protectedTable(parseQName(match[2]));
        if (table) {
          triggers[table].delete(normIdent(match[1]));
        }
        continue;
      }

      if ((match = new RegExp(String.raw`^alter\s+trigger\s+(${IDENT})\s+on\s+(${QNAME})\s+(.*)$`, "i").exec(statement))) {
        const table = protectedTable(parseQName(match[2]));
        const name = normIdent(match[1]);
        const state = table ? triggers[table].get(name) : undefined;
        const rename = new RegExp(String.raw`^rename\s+to\s+(${IDENT})`, "i").exec(match[3]);
        if (table && state) {
          if (rename) {
            triggers[table].delete(name);
            triggers[table].set(normIdent(rename[1]), state);
          } else if (name === GUARD_TRIGGER) {
            violations.push(`${where}: alters the guard trigger on ${table}`);
          }
        }
        continue;
      }

      if ((match = new RegExp(String.raw`^alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(${QNAME})\s+(.*)$`, "i").exec(statement))) {
        const table = protectedTable(parseQName(match[1]));
        if (!table) {
          continue;
        }
        const actions = match[2];
        if (/\brename\s+to\b/i.test(actions)) {
          triggers[table].clear();
        }
        if (afterGuard && /\bowner\s+to\b/i.test(actions)) {
          violations.push(`${where}: changes the owner of protected table ${table}`);
        }
        const toggle = new RegExp(String.raw`\b(disable|enable)\s+(replica\s+|always\s+)?trigger\s+(${IDENT})`, "gi");
        let action: RegExpExecArray | null;
        while ((action = toggle.exec(actions))) {
          const target = normIdent(action[3]);
          const enabled =
            action[1].toLowerCase() === "disable"
              ? "D"
              : action[2]?.trim().toLowerCase() === "replica"
                ? "R"
                : action[2]?.trim().toLowerCase() === "always"
                  ? "A"
                  : "O";
          for (const [name, state] of triggers[table]) {
            if (target === name || target === "all" || target === "user") {
              state.enabled = enabled;
            }
          }
        }
        continue;
      }

      if ((match = /^drop\s+table\s+(?:if\s+exists\s+)?(.+?)(?:\s+(?:cascade|restrict))?$/i.exec(statement))) {
        for (const item of splitList(match[1])) {
          const table = protectedTable(parseQName(item));
          if (table) {
            triggers[table].clear();
          }
        }
        continue;
      }

      if ((match = new RegExp(String.raw`^create\s+(?:or\s+replace\s+)?function\s+(${QNAME})\s*\(`, "i").exec(statement))) {
        if (isGuardFunction(parseQName(match[1]))) {
          guardFunctionDefinitions += 1;
          if (source.file !== GUARD_MIGRATION) {
            violations.push(`${where}: redefines the guard function`);
          }
        }
        continue;
      }

      if ((match = /^(drop|alter)\s+(?:function|routine)\s+(?:if\s+exists\s+)?(.+)$/i.exec(statement))) {
        for (const candidate of match[2].match(new RegExp(QNAME, "g")) ?? []) {
          if (isGuardFunction(parseQName(candidate))) {
            violations.push(`${where}: ${match[1].toLowerCase()}s the guard function`);
            break;
          }
        }
        continue;
      }

      if ((match = /^(grant|revoke)\s+(grant\s+option\s+for\s+)?(.+?)\s+on\s+(.+?)\s+(to|from)\s+(.+?)(?:\s+(?:with\s+grant\s+option|granted\s+by\s+\S+|cascade|restrict))*$/i.exec(statement))) {
        const isGrant = match[1].toLowerCase() === "grant";
        if (match[2] || !/\b(?:all|trigger)\b/i.test(match[3])) {
          continue;
        }
        const grantees = splitList(match[6]).map((role) => normIdent(role.replace(/^group\s+/i, "")));
        forTables(match[4], (table) => {
          for (const role of grantees) {
            if (isGrant) {
              holders[table].add(role);
            } else {
              holders[table].delete(role);
            }
          }
        });
        continue;
      }

      if ((match = /^(grant|revoke)\s+(.+?)\s+(to|from)\s+(.+?)(?:\s+(?:with\s+\w+\s+(?:option|true|false)|granted\s+by\s+\S+|cascade|restrict))*$/i.exec(statement))) {
        const roles = splitList(match[2]).map(normIdent);
        for (const member of splitList(match[4]).map(normIdent)) {
          const set = memberships.get(member) ?? new Set<string>();
          for (const role of roles) {
            if (match[1].toLowerCase() === "grant") {
              set.add(role);
            } else {
              set.delete(role);
            }
          }
          memberships.set(member, set);
        }
      }
    }
  });

  if (guardFunctionDefinitions !== 1) {
    violations.push(`guard function defined ${guardFunctionDefinitions} times (expected exactly 1)`);
  }

  for (const table of PROTECTED_TABLES_LIST) {
    const guard = triggers[table].get(GUARD_TRIGGER);
    if (!guard) {
      violations.push(`${table}: guard trigger missing`);
    } else {
      if (
        guard.timing !== "before"
        || !guard.row
        || !/\binsert\b/.test(guard.events)
        || !/\bupdate\b/.test(guard.events)
        || /\bupdate\s+of\b/.test(guard.events)
      ) {
        violations.push(`${table}: guard is not BEFORE INSERT OR UPDATE FOR EACH ROW`);
      }
      if (guard.fn?.schema !== "public" || guard.fn.name !== GUARD_FUNCTION) {
        violations.push(`${table}: guard does not execute schema-qualified public.${GUARD_FUNCTION}`);
      }
      if (guard.args.join(",") !== GUARD_ARGS[table].join(",")) {
        violations.push(`${table}: guard trigger arguments changed`);
      }
      if (guard.enabled !== "O" && guard.enabled !== "A") {
        violations.push(`${table}: guard trigger is not enabled for ordinary sessions (${guard.enabled})`);
      }
    }
    for (const [name, state] of triggers[table]) {
      if (
        name !== GUARD_TRIGGER
        && state.timing === "before"
        && state.row
        && /\b(?:insert|update)\b/.test(state.events)
        && sortsAfter(name, GUARD_TRIGGER)
      ) {
        violations.push(`${table}: BEFORE row trigger ${name} sorts after the guard`);
      }
    }

    const effective = (role: string, seen = new Set<string>()): boolean => {
      if (seen.has(role)) {
        return false;
      }
      seen.add(role);
      if (holders[table].has(role) || OWNER_EQUIVALENT_ROLES.has(role)) {
        return true;
      }
      return [...(memberships.get(role) ?? [])].some((parent) => effective(parent, seen));
    };
    const candidates = new Set([...holders[table], ...memberships.keys()]);
    for (const role of candidates) {
      if (!OWNER_EQUIVALENT_ROLES.has(role) && effective(role)) {
        violations.push(`${table}: role ${role} effectively holds TRIGGER`);
      }
    }
  }

  return { violations, triggers };
}

function realMigrations(): MigrationSource[] {
  const dir = join(process.cwd(), "supabase/migrations");
  return readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => ({ file, sql: readFileSync(join(dir, file), "utf8") }));
}

describe("CONN-1d-E future-migration protection (chronological static model)", () => {
  const base = realMigrations();
  const later = (sql: string): MigrationSource[] => [
    ...base,
    { file: "20991231000000_future_mutation.sql", sql },
  ];
  const editGuard = (edit: (sql: string) => string): MigrationSource[] =>
    base.map((source) =>
      source.file === GUARD_MIGRATION ? { ...source, sql: edit(source.sql) } : source,
    );

  it("accepts the real migration chain and reproduces the guarded trigger catalog", () => {
    const { violations, triggers } = analyzeGuardMigrations(base);
    expect(violations).toEqual([]);
    expect([...triggers.integrations.keys()].sort()).toEqual([
      "integrations_prevent_identity_reassignment",
      "integrations_set_updated_at",
      GUARD_TRIGGER,
    ]);
    expect([...triggers.provider_bindings.keys()].sort()).toEqual([
      "provider_bindings_prevent_identity_reassignment",
      "provider_bindings_set_updated_at",
      "provider_bindings_validate_canonical_target",
      GUARD_TRIGGER,
    ]);
    expect([...triggers.sync_runs.keys()].sort()).toEqual([
      "sync_runs_prevent_delete",
      "sync_runs_prevent_identity_reassignment",
      "sync_runs_validate_integration_scope",
      GUARD_TRIGGER,
    ]);
  });

  const mutations: Array<[string, MigrationSource[], RegExp]> = [
    ["later BEFORE trigger sorting after the guard", later(
      "create trigger zzz_rewrite before insert on public.integrations for each row execute function public.rw();",
    ), /integrations: BEFORE row trigger zzz_rewrite sorts after the guard/],
    ["quoted later trigger name", later(
      'create trigger "zz_conn_1d_e_secret_json_guard_v2"\n  before update on "public"."provider_bindings"\n  for each row execute function public.rw();',
    ), /provider_bindings: BEFORE row trigger zz_conn_1d_e_secret_json_guard_v2 sorts after/],
    ["unqualified table and create or replace trigger", later(
      "create or replace trigger zzzz before insert or update on sync_runs for each row execute function public.rw();",
    ), /sync_runs: BEFORE row trigger zzzz sorts after the guard/],
    ["guard drop", later(
      "drop trigger if exists zz_conn_1d_e_secret_json_guard on public.sync_runs;",
    ), /sync_runs: guard trigger missing/],
    ["guard rename", later(
      "alter trigger zz_conn_1d_e_secret_json_guard on public.integrations rename to a_guard;",
    ), /integrations: guard trigger missing/],
    ["guard disable by name", later(
      "alter table public.integrations disable trigger zz_conn_1d_e_secret_json_guard;",
    ), /integrations: guard trigger is not enabled for ordinary sessions \(D\)/],
    ["disable trigger all", later(
      "alter table only public.provider_bindings disable trigger all;",
    ), /provider_bindings: guard trigger is not enabled for ordinary sessions \(D\)/],
    ["disable trigger user (no guard name)", later(
      "alter table public.sync_runs disable trigger user;",
    ), /sync_runs: guard trigger is not enabled for ordinary sessions \(D\)/],
    ["enable replica trigger", later(
      "alter table public.sync_runs enable replica trigger zz_conn_1d_e_secret_json_guard;",
    ), /sync_runs: guard trigger is not enabled for ordinary sessions \(R\)/],
    ["guard function replacement", later(
      "create or replace function public.conn_1d_e_reject_secret_json()\nreturns trigger language plpgsql as $$ begin return new; end $$;",
    ), /redefines the guard function/],
    ["guard function made security definer", later(
      "alter function public.conn_1d_e_reject_secret_json() security definer;",
    ), /alters the guard function/],
    ["guard function drop", later(
      "drop function if exists public.conn_1d_e_reject_secret_json() cascade;",
    ), /drops the guard function/],
    ["GRANT ALL on a protected table", later(
      "grant all on table public.integrations to service_role;",
    ), /integrations: role service_role effectively holds TRIGGER/],
    ["GRANT ALL PRIVILEGES on all tables in schema public", later(
      "grant all privileges on all tables in schema public to authenticated;",
    ), /sync_runs: role authenticated effectively holds TRIGGER/],
    ["GRANT TRIGGER in a multi-privilege list to PUBLIC", later(
      'grant insert,\n  trigger\non table "public"."provider_bindings"\nto public;',
    ), /provider_bindings: role public effectively holds TRIGGER/],
    ["role inheritance from a TRIGGER holder", later(
      "create role sync_maint nologin;\ngrant trigger on public.sync_runs to sync_maint;\ngrant sync_maint to service_role;",
    ), /sync_runs: role service_role effectively holds TRIGGER/],
    ["role inheritance from the table owner", later(
      "grant postgres to service_role;",
    ), /integrations: role service_role effectively holds TRIGGER/],
    ["protected table ownership change", later(
      "alter table public.integrations owner to service_role;",
    ), /changes the owner of protected table integrations/],
    ["guard drop via dollar-quoted dynamic SQL", later(
      "do $do$ begin execute $q$drop trigger zz_conn_1d_e_secret_json_guard on public.integrations$q$; end $do$;",
    ), /integrations: guard trigger missing/],
    ["string-built guard reference", later(
      "do $$ begin execute format('alter table public.integrations disable trigger %I', 'zz_conn_1d_e_secret_json_guard'); end $$;",
    ), /references the 1d-E guard/],
    ["guard migration without the TRIGGER revoke", editGuard((sql) =>
      sql.replace(/revoke trigger[\s\S]*?service_role;/, ""),
    ), /role service_role effectively holds TRIGGER/],
    ["guard executes an unqualified function", editGuard((sql) =>
      sql.replace(
        "execute function public.conn_1d_e_reject_secret_json('configuration')",
        "execute function conn_1d_e_reject_secret_json('configuration')",
      ),
    ), /integrations: guard does not execute schema-qualified/],
    ["guard trigger argument change", editGuard((sql) =>
      sql.replace("('source_metadata')", "('metadata')"),
    ), /provider_bindings: guard trigger arguments changed/],
  ];

  for (const [label, sources, expected] of mutations) {
    it(`fails on mutation: ${label}`, () => {
      const { violations } = analyzeGuardMigrations(sources);
      expect(violations.join("\n")).toMatch(expected);
    });
  }

  const benign: Array<[string, MigrationSource[]]> = [
    ["later AFTER trigger sorting after the guard", later(
      "create trigger zzz_audit after insert or update on public.integrations for each row execute function public.audit();",
    )],
    ["later BEFORE trigger sorting before the guard", later(
      "create trigger a_normalize before insert or update on public.integrations for each row execute function public.norm();",
    )],
    ["later BEFORE DELETE trigger", later(
      "create trigger zzz_block_delete before delete on public.sync_runs for each row execute function public.block();",
    )],
    ["later trigger on a same-named table in another schema", later(
      "create trigger zzz before insert on audit.integrations for each row execute function audit.rw();",
    )],
    ["later non-TRIGGER grants and other-table TRIGGER grant", later(
      "grant select on public.integrations to authenticated;\ngrant trigger on public.products to service_role;\nrevoke trigger on public.integrations from service_role;",
    )],
    ["later default privileges (new tables only)", later(
      "alter default privileges in schema public grant all on tables to service_role;",
    )],
    ["guard named only in a comment", later(
      "-- drop trigger zz_conn_1d_e_secret_json_guard on public.integrations;\n/* alter table public.integrations disable trigger zz_conn_1d_e_secret_json_guard; */\nselect 1;",
    )],
    ["historical GRANT ALL later revoked by 1d-E", [
      ...base.filter((source) => source.file < "20261011160000"),
      { file: "20261011160000_historical_grant.sql", sql: "grant all on table public.integrations, public.sync_runs to service_role;" },
      ...base.filter((source) => source.file > "20261011160000"),
    ]],
  ];

  for (const [label, sources] of benign) {
    it(`does not flag benign change: ${label}`, () => {
      expect(analyzeGuardMigrations(sources).violations).toEqual([]);
    });
  }
});

describe("CONN-1d-E architecture protection for future JSON writers", () => {
  const root = process.cwd();
  const PROTECTED_TABLES = /\.from\(\s*["'](integrations|provider_bindings|sync_runs)["']\s*\)/;
  const MUTATION = /\.(insert|update|upsert)\(/;
  const JSON_RPC_ARGS = /\bp_(source_metadata|error_summary|reconciliation_metadata)\b|\bconfiguration\s*:/;

  function sourceFiles(dir: string): string[] {
    const full = join(root, dir);
    let entries: string[];
    try {
      entries = readdirSync(full);
    } catch {
      return [];
    }
    return entries.flatMap((entry) => {
      const path = join(full, entry);
      if (statSync(path).isDirectory()) {
        return sourceFiles(relative(root, path));
      }
      return /\.(ts|tsx|mts|js|mjs)$/.test(entry) ? [relative(root, path)] : [];
    });
  }

  const files = ["lib", "app", "workers", "supabase/functions"].flatMap(sourceFiles);

  it("allows direct protected-table mutation only in ensure-integration", () => {
    const offenders = files.filter((file) => {
      const text = readFileSync(join(root, file), "utf8");
      const chunks = text.split(PROTECTED_TABLES).slice(1);
      return chunks.some((chunk, index) => index % 2 === 1 && MUTATION.test(chunk.slice(0, 400)));
    });
    expect(offenders).toEqual(["lib/inventory-import/ensure-integration.ts"]);
  });

  it("requires every file that builds protected JSON RPC args to use the guard", () => {
    const writers = files.filter((file) => {
      if (file === "lib/security/secret-ingestion.ts") {
        return false;
      }
      const text = readFileSync(join(root, file), "utf8");
      return /\.rpc\(/.test(text) && JSON_RPC_ARGS.test(text);
    });
    expect(writers.length).toBeGreaterThanOrEqual(3);
    for (const file of writers) {
      const text = readFileSync(join(root, file), "utf8");
      expect(text, file).toMatch(/from "@\/lib\/security\/secret-ingestion"/);
    }
  });

  it("persists the guard's return value at each confirmed writer", () => {
    const read = (file: string) => readFileSync(join(root, file), "utf8");
    expect(read("lib/inventory-import/ensure-integration.ts")).toMatch(
      /const configuration = assertNonSecretIngestionPayload\([\s\S]*?\);[\s\S]*?\.insert\(\{[\s\S]*?\bconfiguration,/,
    );
    expect(read("lib/providers/csv/location-binding.ts")).toMatch(
      /p_source_metadata: guardOptionalNonSecretJson\(/,
    );
    expect(read("lib/providers/csv/supabase-persistence.ts")).toMatch(
      /return assertNonSecretIngestionPayload\(/,
    );
    const syncRun = read("lib/providers/csv/sync-run-persistence.ts");
    expect(syncRun.match(/p_reconciliation_metadata: guardOptionalNonSecretJson\(/g)).toHaveLength(3);
    expect(syncRun).toMatch(/p_error_summary: guardOptionalNonSecretJson\(/);
  });
});
