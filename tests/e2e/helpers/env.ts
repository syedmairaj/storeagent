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

export function resolveE2ECredentials(): {
  email: string;
  password: string;
} | null {
  loadLocalEnvFiles();

  const email =
    process.env.E2E_EMAIL?.trim() ||
    process.env.M14_TEST_EMAIL?.trim() ||
    "";

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

export function resolveOptionalOrgId(): string | null {
  loadLocalEnvFiles();
  const id =
    process.env.PLAYWRIGHT_ORG_ID?.trim() ||
    process.env.E2E_ORG_ID?.trim() ||
    "";
  return id || null;
}

export const AUTH_DIR = path.join(
  process.cwd(),
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

export const ARTIFACTS_DIR = path.join(
  process.cwd(),
  "tests/e2e/artifacts",
);
