import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

import {
  canTransitionActionStatus,
} from "@/lib/commerce-domain/history-policy";
import type { InventoryActionStatus } from "@/lib/commerce-domain/types";

const ROOT = process.cwd();

const LIVE =
  "tests/unit/m7-3d-lifecycle-e2e.live.test.ts";
const ADVERSARIAL =
  "tests/sql/m7-3c-trusted-lifecycle-rpc-adversarial.sql";
const MIGRATION =
  "supabase/migrations/20261031130000_m7_3c_trusted_lifecycle_rpcs.sql";

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

describe("M7.3d dormant lifecycle verification architecture", () => {
  it("ships local-only live E2E with hardcoded PG17 endpoint and org-scoped wipe", () => {
    const source = read(LIVE);

    expect(source).toContain('"127.0.0.1"');
    expect(source).toContain('"55322"');
    expect(source).toContain("RUN_SUPABASE_LIVE");
    expect(source).toContain("DATABASE_URL");
    expect(source).toMatch(/not\.toMatch\(/);
    expect(source).toContain("wipeOrgScoped");
    expect(source).toContain("organization_id");
    expect(source).not.toMatch(/\btruncate\b/i);
    expect(source).toContain("baselineEligibilityHash");
    expect(source).toContain("restoreEligibility");
    expect(source).toContain("assertImmutabilityTriggersEnabled");
    expect(source).toContain("ACTION_NOT_MERCHANT_APPROVABLE");
    expect(source).toContain("compete-dismiss");
    expect(source).toContain("idem-1");
  });

  it("keeps deployable migrations free of eligibility probes and test overrides", () => {
    const migration = read(MIGRATION);
    expect(migration).toMatch(
      /select case when p_action is null then false else false end/i,
    );
    expect(migration).not.toContain("m7_lifecycle_eligibility_probe_v1");

    for (const file of listMigrationFiles()) {
      const text = fs.readFileSync(file, "utf8");
      expect(text).not.toContain("m7_lifecycle_eligibility_probe_v1");
    }
  });

  it("preserves SQL adversarial restore/fail-closed proofs", () => {
    const source = read(ADVERSARIAL);
    expect(source).toContain("eligibility helper was not restored");
    expect(source).toContain(
      "deployed fail-closed eligibility must hold after restore",
    );
    expect(source).toContain("TEST-ONLY override");
    expect(source).toContain("forged trust flags must violate trust_hard_false");
  });

  it("history-policy legal matrix matches M7.3c SQL transition helper vocabulary", () => {
    const sql = read(MIGRATION);
    const statuses: InventoryActionStatus[] = [
      "new",
      "accepted",
      "accepted_with_edit",
      "dismissed",
      "completed",
      "expired",
      "superseded",
    ];

    for (const from of statuses) {
      for (const to of statuses) {
        const allowed = canTransitionActionStatus(from, to);
        if (!allowed || from === to) {
          continue;
        }
        // Every non-identity legal edge must be expressible in SQL helper.
        expect(sql).toContain(`'${to}'`);
        expect(sql).toContain(`p_from = '${from}'`);
      }
    }

    expect(canTransitionActionStatus("new", "accepted")).toBe(true);
    expect(canTransitionActionStatus("new", "accepted_with_edit")).toBe(true);
    expect(canTransitionActionStatus("new", "dismissed")).toBe(true);
    expect(canTransitionActionStatus("accepted", "completed")).toBe(true);
    expect(canTransitionActionStatus("accepted_with_edit", "completed")).toBe(
      true,
    );
    expect(canTransitionActionStatus("dismissed", "accepted")).toBe(false);
    expect(canTransitionActionStatus("completed", "new")).toBe(false);
  });

  it("does not introduce merchant HTTP/worker/purchase wiring for lifecycle", () => {
    const live = read(LIVE);
    expect(live.toLowerCase()).not.toContain("purchase_order");
    expect(live).not.toMatch(/app\/api|worker|cron/i);

    const apiDir = path.join(ROOT, "app/api");
    if (!fs.existsSync(apiDir)) {
      return;
    }
    for (const file of fs.readdirSync(apiDir, { recursive: true })) {
      const full = path.join(apiDir, String(file));
      if (!fs.statSync(full).isFile()) {
        continue;
      }
      const text = fs.readFileSync(full, "utf8");
      expect(text).not.toMatch(
        /transition_inventory_action_merchant|expire_inventory_action_system/,
      );
    }
  });
});
