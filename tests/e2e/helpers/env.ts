import fs from "node:fs";
import path from "node:path";

/**
 * Load local env files into process.env without printing values.
 * Does not override keys already present in the environment.
 */
export function loadLocalEnvFiles(): void {
  const root = process.cwd();
  const candidates = [
    path.join(root, ".env.local"),
    path.join(root, ".env.test.local"),
    path.join(root, ".env"),
  ];

  for (const file of candidates) {
    if (
      !fs.existsSync(file)
    ) {
      continue;
    }

    const text = fs.readFileSync(file, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (
        !trimmed ||
        trimmed.startsWith("#")
      ) {
        continue;
      }

      const eq = trimmed.indexOf("=");
      if (
        eq <= 0
      ) {
        continue;
      }

      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith("\"") &&
          value.endsWith("\"")) ||
        (value.startsWith("'") &&
          value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (
        process.env[key] === undefined
      ) {
        process.env[key] = value;
      }
    }
  }
}

/**
 * Owner-authorized local identity for magic-link E2E (no password required).
 * Prefer E2E_EMAIL; fall back to M14_TEST_EMAIL.
 */
export function resolveE2EEmail(): string | null {
  loadLocalEnvFiles();
  const email =
    process.env.E2E_EMAIL?.trim() ||
    process.env.M14_TEST_EMAIL?.trim() ||
    "";
  return email || null;
}

export function resolveE2ECredentials(): {
  email: string;
  password: string;
} | null {
  loadLocalEnvFiles();

  const email = resolveE2EEmail() || "";

  const password =
    process.env.E2E_PASSWORD ||
    process.env.M14_TEST_PASSWORD ||
    "";

  if (
    !email ||
    !password
  ) {
    return null;
  }

  return {
    email,
    password,
  };
}

/**
 * Default: magic-link. Set E2E_AUTH_MODE=password to use password setup.
 */
export function resolveE2EAuthMode(): "magic_link" | "password" {
  loadLocalEnvFiles();
  const mode =
    process.env.E2E_AUTH_MODE?.trim().toLowerCase() ||
    "";
  return mode === "password" ? "password" : "magic_link";
}

export function resolveOptionalOrgId(): string | null {
  loadLocalEnvFiles();
  const id =
    process.env.PLAYWRIGHT_ORG_ID?.trim() ||
    process.env.E2E_ORG_ID?.trim() ||
    "";
  return id || null;
}

/**
 * Optional isolation roots (absolute or cwd-relative).
 * Used by FE-ACCEPT recovery to keep auth/screenshots outside protected
 * in-repo evidence paths (.vitest, existing playwright/.auth, artifacts).
 */
function resolveIsolatedDir(
  envKey: string,
  fallbackRelative: string,
): string {
  loadLocalEnvFiles();
  const override = process.env[envKey]?.trim();
  if (override) {
    return path.isAbsolute(override)
      ? override
      : path.join(process.cwd(), override);
  }
  return path.join(process.cwd(), fallbackRelative);
}

export const AUTH_DIR = resolveIsolatedDir(
  "PLAYWRIGHT_AUTH_DIR",
  "playwright/.auth",
);

export const AUTH_STATE_PATH = path.join(
  AUTH_DIR,
  "user.json",
);

export const AUTH_CONTEXT_PATH = path.join(
  AUTH_DIR,
  "context.json",
);

export const ARTIFACTS_DIR = resolveIsolatedDir(
  "PLAYWRIGHT_ARTIFACTS_DIR",
  "tests/e2e/artifacts",
);
