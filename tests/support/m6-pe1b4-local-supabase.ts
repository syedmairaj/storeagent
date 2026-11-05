/**
 * M6-PE1.b.4b — local-only Supabase isolation helpers.
 *
 * Fail-closed loopback pins only. Never invokes Supabase CLI
 * mutate/remote operations and never accepts hosted URLs.
 * Does not disable triggers, relax CHECKs, or perform DB writes.
 * Deterministic order/order-item UUID vacancy checks live in the PE1.b.4b
 * live suite inventory (RESERVED_ORDER_IDS / RESERVED_ORDER_ITEM_IDS).
 *
 * Connection contract (normative):
 * - Effective API URL: NEXT_PUBLIC_SUPABASE_URL only (must be pinned loopback).
 * - Effective DB: hardcoded psql 127.0.0.1:55322 only.
 * - createSupabaseAdminClient → readServerEnvironment → NEXT_PUBLIC_* +
 *   SUPABASE_SERVICE_ROLE_KEY only.
 * - M56E4_HOSTED_SUPABASE_URL is NOT consumed by PE1.b.4b. It belongs to the
 *   separate M5.6E.4 hosted canary path (which ignores .env.local / admin
 *   client). Presence alone must not block local PE1.b.4b when effective
 *   targets remain pinned local.
 */

import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const M6_PE1B4_PINNED_API_URL =
  "http://127.0.0.1:55321" as const;
export const M6_PE1B4_PINNED_DB_HOST = "127.0.0.1" as const;
export const M6_PE1B4_PINNED_DB_PORT = "55322" as const;

/** Env vars that can influence connection targets if set incorrectly. */
const CONNECTION_ADJACENT_ENV_KEYS = [
  "DATABASE_URL",
  "DIRECT_URL",
  "SUPABASE_URL",
] as const;

const REMOTE_URL_MARKERS = [
  "supabase.co",
  "pooler.supabase",
  "amazonaws.com",
] as const;

export function quoteSqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export function pe1b4PsqlArgs(): string[] {
  return [
    "-h",
    M6_PE1B4_PINNED_DB_HOST,
    "-p",
    M6_PE1B4_PINNED_DB_PORT,
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
    "-v",
    "VERBOSITY=verbose",
    "-q",
    "-t",
    "-A",
  ];
}

export function assertPe1b4PinnedDbTarget(): void {
  const args = pe1b4PsqlArgs();
  if (
    args[0] !== "-h" ||
    args[1] !== M6_PE1B4_PINNED_DB_HOST ||
    args[2] !== "-p" ||
    args[3] !== M6_PE1B4_PINNED_DB_PORT
  ) {
    throw new Error(
      "PE1.b.4b refuses psql targets that are not pinned 127.0.0.1:55322.",
    );
  }
}

function assertNoRemoteMarkers(label: string, value: string): void {
  const low = value.toLowerCase();
  for (const marker of REMOTE_URL_MARKERS) {
    if (low.includes(marker)) {
      throw new Error(
        `PE1.b.4b refuses remote marker "${marker}" in ${label}.`,
      );
    }
  }
}

/**
 * Effective API URL must be exactly the pinned loopback API endpoint.
 * Rejects localhost alias, https, missing values, and hosted hosts.
 */
export function assertPe1b4PinnedApiUrl(url: string): void {
  if (!url || typeof url !== "string") {
    throw new Error("PE1.b.4b requires NEXT_PUBLIC_SUPABASE_URL.");
  }

  assertNoRemoteMarkers("NEXT_PUBLIC_SUPABASE_URL", url);

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("PE1.b.4b received an unparseable Supabase API URL.");
  }

  if (parsed.protocol !== "http:") {
    throw new Error(
      `PE1.b.4b refuses non-http Supabase API protocol "${parsed.protocol}".`,
    );
  }

  if (parsed.hostname !== "127.0.0.1") {
    throw new Error(
      `PE1.b.4b refuses non-pinned API host "${parsed.hostname}" (require 127.0.0.1).`,
    );
  }

  if (String(parsed.port || "") !== "55321") {
    throw new Error(
      `PE1.b.4b refuses non-pinned API port "${parsed.port}" (require 55321).`,
    );
  }

  const normalized = `${parsed.protocol}//${parsed.hostname}:${parsed.port}`;
  if (normalized !== M6_PE1B4_PINNED_API_URL) {
    throw new Error(
      `PE1.b.4b refuses API URL "${url}"; require exactly ${M6_PE1B4_PINNED_API_URL}.`,
    );
  }
}

function readOptionalEnvFile(): Record<string, string> {
  const filePath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const values: Record<string, string> = {};
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

/**
 * Resolve local keys without Supabase CLI. Fail closed if effective API/DB
 * targets are not the pinned loopback endpoints.
 *
 * Does not treat M56E4_HOSTED_SUPABASE_URL as a PE1.b.4b connection input.
 * That variable is ignored here; only effective NEXT_PUBLIC_SUPABASE_URL /
 * service-role keys and pinned psql targets are authoritative.
 */
export function ensurePe1b4LocalSupabaseEnv(): void {
  assertPe1b4PinnedDbTarget();

  for (const key of CONNECTION_ADJACENT_ENV_KEYS) {
    const value = process.env[key];
    if (!value) {
      continue;
    }
    assertNoRemoteMarkers(key, value);
    if (key === "DATABASE_URL" || key === "DIRECT_URL") {
      const low = value.toLowerCase();
      const local =
        low.includes("127.0.0.1:55322") || low.includes("localhost:55322");
      if (!local) {
        throw new Error(
          `PE1.b.4b refuses non-local ${key}; require loopback :55322 only.`,
        );
      }
    }
  }

  const fileEnv = readOptionalEnvFile();
  // Ignore M56E4_HOSTED_* if present in .env.local — never assign it to
  // NEXT_PUBLIC_SUPABASE_URL or use it for pe1b4Psql / admin client.
  if (fileEnv.NEXT_PUBLIC_SUPABASE_URL) {
    assertPe1b4PinnedApiUrl(fileEnv.NEXT_PUBLIC_SUPABASE_URL);
  }
  for (const key of CONNECTION_ADJACENT_ENV_KEYS) {
    const value = fileEnv[key];
    if (!value) {
      continue;
    }
    assertNoRemoteMarkers(`.env.local ${key}`, value);
    if (key === "DATABASE_URL" || key === "DIRECT_URL") {
      const low = value.toLowerCase();
      const local =
        low.includes("127.0.0.1:55322") || low.includes("localhost:55322");
      if (!local) {
        throw new Error(
          `PE1.b.4b refuses non-local .env.local ${key}; require loopback :55322 only.`,
        );
      }
    }
  }

  const apiUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? fileEnv.NEXT_PUBLIC_SUPABASE_URL;
  const publishable =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    fileEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceRole =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? fileEnv.SUPABASE_SERVICE_ROLE_KEY;

  if (!apiUrl || !publishable || !serviceRole) {
    throw new Error(
      "PE1.b.4b requires local NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, and SUPABASE_SERVICE_ROLE_KEY (process env or .env.local). Supabase CLI fallback is forbidden.",
    );
  }

  assertPe1b4PinnedApiUrl(apiUrl);

  // Publish only local effective credentials used by createSupabaseAdminClient.
  // Never copy M56E4_HOSTED_* into these slots.
  process.env.NEXT_PUBLIC_SUPABASE_URL = apiUrl;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = publishable;
  process.env.SUPABASE_SERVICE_ROLE_KEY = serviceRole;
}

export async function pe1b4Psql(sql: string): Promise<string> {
  assertPe1b4PinnedDbTarget();
  const { stdout } = await execFileAsync(
    "psql",
    [...pe1b4PsqlArgs(), "-c", sql],
    {
      env: { ...process.env, PGPASSWORD: "postgres" },
    },
  );
  return stdout.trim();
}
