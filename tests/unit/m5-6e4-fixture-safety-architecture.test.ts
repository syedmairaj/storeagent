import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

const HOSTED_CREATE = read(
  "scripts/m5-6e4/canary-fixture-hosted-create.sql",
);
const LOCAL_TEARDOWN = read(
  "scripts/m5-6e4/canary-fixture-local-teardown.sql",
);
const WRAPPER = read("scripts/m5-6e4/canary-fixture.sql");
const RUNBOOK = read("docs/M5_6E_4_HOSTED_CANARY_RUNBOOK.md");
const RUNNER = read("lib/canary/m5-6e4-single-grain-recompute.ts");
const ONESHOT = read("lib/canary/m5-6e4-stage3-oneshot.ts");
const HOSTED_TARGET = read("lib/canary/m5-6e4-hosted-target.ts");

describe("M5.6E.4 fixture safety architecture", () => {
  it("keeps hosted-safe create free of trigger toggles and destructive SQL", () => {
    const sqlOnly = HOSTED_CREATE
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n")
      .toLowerCase();

    expect(sqlOnly).not.toMatch(/disable\s+trigger/);
    expect(sqlOnly).not.toMatch(/enable\s+trigger/);
    expect(sqlOnly).not.toMatch(/\balter\s+table\b/);
    expect(sqlOnly).not.toMatch(/\btruncate\b/);
    expect(sqlOnly).not.toMatch(/\bdelete\s+from\b/);
    expect(HOSTED_CREATE).toContain("insert into public.organizations");
    expect(HOSTED_CREATE).toContain("refuse hosted-safe create");
  });

  it("isolates trigger-disabling teardown as local-only", () => {
    expect(LOCAL_TEARDOWN).toContain("LOCAL-ONLY");
    expect(LOCAL_TEARDOWN.toLowerCase()).toContain("disable trigger");
    expect(LOCAL_TEARDOWN.toLowerCase()).toContain("enable trigger");
    expect(WRAPPER).toContain("canary-fixture-local-teardown.sql");
    expect(WRAPPER).toContain("canary-fixture-hosted-create.sql");
    expect(WRAPPER).toContain("Do NOT use this file against hosted");
  });

  it("documents hosted create path and forbids trigger changes in the runbook", () => {
    expect(RUNBOOK).toContain("canary-fixture-hosted-create.sql");
    expect(RUNBOOK).toMatch(/FORBIDDEN.*DISABLE.*TRIGGER/i);
    expect(RUNBOOK).toContain("FINGERPRINT_BEFORE");
    expect(RUNBOOK).toContain("Stage");
  });

  it("requires approval, expected grain, owner, claim token, and generation in the runner", () => {
    expect(RUNNER).toContain("expectedGrain");
    expect(RUNNER).toContain("expectedOwnerId");
    expect(RUNNER).toContain("expectedClaimToken");
    expect(RUNNER).toContain("expectedClaimedGeneration");
    expect(RUNNER).toContain("M56E4_CANARY_APPROVAL_PHRASE");
  });

  it("pins Stage 3 oneshot to hosted project credentials and forbids worker activation", () => {
    expect(HOSTED_TARGET).toContain("qlsqminsfdntpqdkhxjx");
    expect(HOSTED_TARGET).toContain("M56E4_HOSTED_SUPABASE_URL");
    expect(HOSTED_TARGET).toContain("M56E4_HOSTED_SERVICE_ROLE_KEY");
    expect(ONESHOT).toContain("M56E4_HOSTED_URL_ENV");
    expect(ONESHOT).toContain("M56E4_HOSTED_*");
    expect(ONESHOT).toContain("redactSecretMeta");
    expect(ONESHOT).toContain("lease is expired");
    expect(ONESHOT).toContain("runM56E4Stage3PreflightOnlyFromEnv");
    expect(ONESHOT).toContain("M56E4_STAGE3_PREFLIGHT_TIMEOUT_MS");
    expect(ONESHOT).toContain("M56E4_STAGE3_NETWORK_TIMEOUT_MS");
    expect(ONESHOT).toContain("STAGE3_EXECUTE_APPROVED");
    expect(ONESHOT).toContain("M56E4_REVOKED_CLAIM_TOKENS");
    expect(ONESHOT).toContain("sanitizeM56E4Stage3ErrorMessage");
    expect(ONESHOT).not.toContain("METRIC_RECOMPUTE_WORKER_ENABLED");
    expect(ONESHOT).not.toContain("/api/internal/metric-");
    expect(ONESHOT).not.toContain("createSupabaseAdminClient");
    expect(ONESHOT).not.toContain("readServerEnvironment");
    expect(RUNBOOK).toContain("M56E4_HOSTED_SUPABASE_URL");
    expect(RUNBOOK).toContain("org-scoped recover");
    expect(RUNBOOK).toContain("M56E4_STAGE3_MODE");
    expect(RUNBOOK).toContain("runM56E4Stage3PreflightOnlyFromEnv");
    expect(RUNBOOK).toContain("M56E4_STAGE3_EXECUTE_OK");
  });
});
