import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

const ROOT = process.cwd();

const MIGRATION =
  "supabase/migrations/20261031130000_m7_3c_trusted_lifecycle_rpcs.sql";
const ADVERSARIAL =
  "tests/sql/m7-3c-trusted-lifecycle-rpc-adversarial.sql";
const M72_MIGRATION =
  "supabase/migrations/20261031100000_m7_2b_inventory_action_persistence.sql";

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

function listMigrationFiles(): string[] {
  const dir = path.join(ROOT, "supabase/migrations");
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .map((name) => path.join(dir, name));
}

function listFilesRecursive(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFilesRecursive(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

describe("M7.3c trusted lifecycle RPC architecture", () => {
  it("gates inventory_actions mutation behind trusted lifecycle token", () => {
    const source = read(MIGRATION);

    expect(source).toContain("storeagent.inventory_action_lifecycle_gate");
    expect(source).toContain("trusted_lifecycle_rpc_v1");
    expect(source).toContain(
      "lifecycle gate allows only status and superseded_by_action_id mutation",
    );
    expect(source).toContain("ACTION_EVENT_INSERT_REQUIRES_LIFECYCLE_RPC");
    expect(source).toContain(
      "create or replace function public.prevent_inventory_action_mutation",
    );
  });

  it("ships merchant and system RPCs with correct EXECUTE grants", () => {
    const source = read(MIGRATION);

    expect(source).toContain(
      "create or replace function public.transition_inventory_action_merchant",
    );
    expect(source).toContain(
      "create or replace function public.expire_inventory_action_system",
    );
    expect(source).toContain(
      "create or replace function public.supersede_inventory_action_system",
    );
    expect(source).toContain("ACTION_NOT_MERCHANT_APPROVABLE");
    expect(source).toContain("inventory_action_require_decide_membership");
    expect(source).toContain("'owner', 'admin', 'operator'");
    expect(source).toContain("auth.uid()");
    expect(source).toContain("for update");

    expect(source).toContain(
      "revoke all\non function public.transition_inventory_action_merchant",
    );
    expect(source).toContain("from public, anon, service_role");
    expect(source).toContain(
      "grant execute\non function public.transition_inventory_action_merchant",
    );
    expect(source).toContain("to authenticated");

    expect(source).toContain(
      "grant execute\non function public.expire_inventory_action_system",
    );
    expect(source).toContain("to service_role");
    expect(source).toContain(
      "revoke all\non function public.expire_inventory_action_system",
    );
    expect(source).toContain("from public, anon, authenticated");
  });

  it("keeps deployable merchant eligibility universally fail-closed", () => {
    const source = read(MIGRATION);
    const m72 = read(M72_MIGRATION);

    expect(source).toContain("inventory_action_is_merchant_approvable");
    expect(source).toMatch(
      /select case when p_action is null then false else false end/i,
    );
    expect(source).toContain("Fail-closed for every current source class");
    expect(source).not.toContain("m7_lifecycle_eligibility_probe_v1");
    expect(source).not.toContain("inventory_actions_trust_flags_check");
    expect(source).not.toMatch(
      /drop constraint inventory_actions_trust_hard_false/i,
    );
    expect(source).not.toMatch(
      /drop constraint inventory_actions_source_class_check/i,
    );

    expect(m72).toContain("inventory_actions_trust_hard_false");
    expect(m72).not.toContain("m7_lifecycle_eligibility_probe_v1");
  });

  it("forbids eligibility probe / test-only override strings in deployable migrations", () => {
    for (const file of listMigrationFiles()) {
      const text = fs.readFileSync(file, "utf8");
      expect(text).not.toContain("m7_lifecycle_eligibility_probe_v1");
      expect(text).not.toMatch(
        /TEST-ONLY override|lifecycle_test_eligibility|eligibility_probe/i,
      );
    }
  });

  it("does not wire HTTP/workers/buying side effects", () => {
    const source = read(MIGRATION);
    expect(source.toLowerCase()).not.toContain("purchase_order");
    expect(source).not.toMatch(/pg_cron|cron\.schedule|create\s+trigger/i);
    expect(source).toContain("no scheduler");

    for (const file of listFilesRecursive(path.join(ROOT, "app/api"))) {
      const text = fs.readFileSync(file, "utf8");
      expect(text).not.toMatch(
        /transition_inventory_action_merchant|expire_inventory_action_system/,
      );
    }
  });

  it("ships SQL adversarial coverage for fail-closed + isolated override restore", () => {
    const source = read(ADVERSARIAL);

    expect(source).toContain("ACTION_NOT_MERCHANT_APPROVABLE");
    expect(source).toContain("ACTION_LIFECYCLE_ROLE_DENIED");
    expect(source).toContain("ACTION_LIFECYCLE_AUTH_REQUIRED");
    expect(source).toContain("ACTION_EVENT_IDEMPOTENCY_BODY_CONFLICT");
    expect(source).toContain("forged trust flags must violate trust_hard_false");
    expect(source).toContain("eligibility probe source class must be rejected");
    expect(source).toContain("TEST-ONLY override");
    expect(source).toContain("eligibility helper was not restored");
    expect(source).toContain("deployed fail-closed eligibility must hold after restore");
    expect(source).not.toMatch(
      /INSERT INTO public\.inventory_actions[\s\S]*m7_lifecycle_eligibility_probe_v1[\s\S]*claims_merchant_facing,\s*true/i,
    );
  });
});
