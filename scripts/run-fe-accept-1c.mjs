#!/usr/bin/env node
/**
 * Bounded local FE-ACCEPT-1C acceptance runner.
 * No git writes. Isolates Playwright auth/artifacts outside the repo.
 * Refuses hosted Supabase URLs via the harness assertLocalAcceptanceStack.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const evidenceRoot = path.join(
  os.homedir(),
  "Library/Application Support/StoreAgent/fe-accept-1c",
);

const dirs = {
  auth: path.join(evidenceRoot, "auth"),
  artifacts: path.join(evidenceRoot, "artifacts"),
  output: path.join(evidenceRoot, "test-results"),
  html: path.join(evidenceRoot, "playwright-report"),
  logs: path.join(evidenceRoot, "logs"),
  evidence: path.join(evidenceRoot, "evidence"),
};

for (const dir of Object.values(dirs)) {
  fs.mkdirSync(dir, {
    recursive: true,
    mode: 0o700,
  });
}

const env = {
  ...process.env,
  PLAYWRIGHT_AUTH_DIR: dirs.auth,
  PLAYWRIGHT_ARTIFACTS_DIR: dirs.artifacts,
  PLAYWRIGHT_OUTPUT_DIR: dirs.output,
  PLAYWRIGHT_HTML_REPORT: dirs.html,
  PLAYWRIGHT_BASE_URL:
    process.env.PLAYWRIGHT_BASE_URL ||
    "http://localhost:3000",
  PLAYWRIGHT_MAILPIT_URL:
    process.env.PLAYWRIGHT_MAILPIT_URL ||
    "http://127.0.0.1:55324",
  // Prefer the machine Playwright cache when Cursor sandbox cache is empty.
  PLAYWRIGHT_BROWSERS_PATH:
    process.env.PLAYWRIGHT_BROWSERS_PATH ||
    path.join(
      os.homedir(),
      "Library/Caches/ms-playwright",
    ),
};

function run(
  label,
  command,
  args,
  options = {},
) {
  console.log(`\n==> ${label}`);
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    encoding: "utf8",
    stdio: "pipe",
    ...options,
  });
  const logPath = path.join(
    dirs.logs,
    `${label.replace(/\s+/g, "-").toLowerCase()}.out`,
  );
  const body = [
    `exit=${result.status}`,
    result.stdout || "",
    result.stderr || "",
  ].join("\n");
  // Redact obvious secrets before writing logs.
  const redacted = body
    .replace(
      /([?&](?:token|code|access_token|refresh_token)=)[^&\s"']+/gi,
      "$1REDACTED",
    )
    .replace(
      /Bearer\s+[A-Za-z0-9._-]+/g,
      "Bearer REDACTED",
    );
  fs.writeFileSync(logPath, redacted, {
    encoding: "utf8",
    mode: 0o600,
  });
  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  return result.status ?? 1;
}

const steps = [
  [
    "vitest-auth-architecture",
    "npx",
    [
      "vitest",
      "run",
      "tests/unit/auth-passwordless-architecture.test.ts",
      "tests/unit/fe-accept-1c-mailpit.test.ts",
    ],
  ],
  [
    "playwright-fe-accept-1c",
    "npx",
    [
      "playwright",
      "test",
      "--project=setup",
      "--project=actions-320",
      "--project=actions-390",
      "--project=actions-768",
      "--project=actions-1024",
      "--project=actions-1280",
      "--project=actions-1440",
    ],
  ],
  ["typecheck", "npm", ["run", "typecheck"]],
  ["lint", "npm", ["run", "lint"]],
  [
    "migrations",
    "npm",
    ["run", "check:migrations"],
  ],
];

let failed = false;
const summary = [];

for (const [label, cmd, args] of steps) {
  const code = run(label, cmd, args);
  summary.push({
    label,
    code,
  });
  if (
    code !== 0
  ) {
    failed = true;
    // Continue remaining validation steps for report completeness,
    // except skip viewport projects if setup already failed.
    if (
      label === "playwright-fe-accept-1c"
    ) {
      // already includes setup+viewports
    }
  }
}

// Optional build — expensive; run last and record.
const buildCode = run("build", "npm", [
  "run",
  "build",
]);
summary.push({
  label: "build",
  code: buildCode,
});
if (
  buildCode !== 0
) {
  failed = true;
}

const reportPath = path.join(
  dirs.evidence,
  "FE_ACCEPT_1C_RUN_SUMMARY.json",
);
fs.writeFileSync(
  reportPath,
  JSON.stringify(
    {
      finishedAt: new Date().toISOString(),
      evidenceRoot,
      summary,
      failed,
    },
    null,
    2,
  ),
  {
    encoding: "utf8",
    mode: 0o600,
  },
);

console.log(
  `\nFE-ACCEPT-1C runner finished failed=${failed} summary=${reportPath}`,
);
process.exit(failed ? 1 : 0);
