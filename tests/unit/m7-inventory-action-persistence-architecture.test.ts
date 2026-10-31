import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

const ROOT = process.cwd();
const MIGRATION =
  "supabase/migrations/20261031100000_m7_2b_inventory_action_persistence.sql";
const ADVERSARIAL =
  "tests/sql/m7-inventory-action-persistence-adversarial.sql";

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

function normalized(relative: string): string {
  return read(relative).replace(/\s+/g, " ").toLowerCase();
}

describe("M7.2b dormant inventory action persistence architecture", () => {
  it("adds immutable inventory_actions with composite grain FKs", () => {
    const source = read(MIGRATION);

    expect(source).toContain("create table public.inventory_actions");
    expect(source).toContain("inventory_actions_idempotency_uidx");
    expect(source).toContain("evidence_provenance_fingerprint");
    expect(source).toContain("decision_body_hash");
    expect(source).toContain("decision_reproducibility_fingerprint");
    expect(source).toContain("inventory_actions_location_fk");
    expect(source).toContain("inventory_actions_variant_fk");
    expect(source).toContain("location_id uuid not null");
    expect(source).not.toContain("create table public.action_events");
  });

  it("freezes status=new, forecast null, and hard-false trust flags", () => {
    const source = read(MIGRATION);
    const sql = normalized(MIGRATION);

    expect(source).toContain("inventory_actions_status_new_only");
    expect(sql).toContain("check (status = 'new')");
    expect(source).toContain("inventory_actions_forecast_run_null");
    expect(sql).toContain("check (forecast_run_id is null)");
    expect(source).toContain("inventory_actions_trust_hard_false");
    expect(sql).toContain("claims_merchant_facing = false");
    expect(sql).toContain("claims_m7_production_eligibility = false");
    expect(sql).toContain("algorithm_approved = false");
    expect(sql).toContain("is_scored_merchant_decision = false");
  });

  it("enforces action quantity rules and rejects HEALTHY persistence", () => {
    const source = read(MIGRATION);

    expect(source).toContain("inventory_actions_quantity_by_action");
    expect(source).toContain("'REORDER'");
    expect(source).toContain("'REDUCE'");
    expect(source).toContain("'PROMOTE'");
    expect(source).toContain("'WATCH'");
    expect(source).toContain("inventory_actions_watch_requires_reasons");
    expect(source).toContain("v_action_type = 'HEALTHY'");
    expect(source).toContain("DECISION_PERSISTENCE_INVALID_PAYLOAD");
  });

  it("rejects fixture and reserved production source classes", () => {
    const source = read(MIGRATION);

    expect(source).toContain("m7_persistence_contract_harness_v1");
    expect(source).toContain("m5_sku_daily_metric_bound_v1");
    expect(source).toContain("controlled_fixture_only");
    expect(source).toContain("FIXTURE_EVIDENCE_REJECTED");
    expect(source).toContain("PRODUCTION_SOURCE_OF_CREATE_UNAVAILABLE");
    expect(source).toContain("PRODUCTION_TRUST_CLAIM_REJECTED");
    expect(source).toContain("FORECAST_RUN_FORBIDDEN");
    expect(source).toContain("fixtureAttestation");
  });

  it("derives SHA-256 body hash in SQL and conflicts on material divergence", () => {
    const source = read(MIGRATION);
    const sql = normalized(MIGRATION);

    expect(source).toContain("inventory_action_stable_serialize");
    expect(source).toContain("inventory_action_sha256_hex");
    expect(source).toContain("inventory_action_derive_hashes");
    expect(source).toContain("extensions.digest");
    expect(source).toContain("'sha256'");
    expect(source).toContain("DECISION_BODY_HASH_MISMATCH");
    expect(source).toContain("DECISION_IDEMPOTENCY_BODY_CONFLICT");
    expect(source).toContain("'created'");
    expect(source).toContain("'replayed'");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
  });

  it("blocks mutation and denies direct client/service_role DML", () => {
    const source = read(MIGRATION);

    expect(source).toContain("prevent_inventory_action_mutation");
    expect(source).toContain(
      "before update or delete on public.inventory_actions",
    );
    expect(source).toContain(
      "revoke all\non table public.inventory_actions\nfrom public, anon, authenticated, service_role",
    );
    expect(source).toContain(
      "grant select\non table public.inventory_actions\nto authenticated, service_role",
    );
    expect(source).toContain("inventory_actions_select_member");
    expect(source).toContain(
      "grant execute\non function public.persist_inventory_action_recommendation",
    );
    expect(source).toContain("to service_role");
    expect(source).toContain("from public, anon, authenticated");
  });

  it("ships local adversarial SQL covering contract failure matrix", () => {
    const source = read(ADVERSARIAL);

    expect(source).toContain("DECISION_IDEMPOTENCY_BODY_CONFLICT");
    expect(source).toContain("FIXTURE_EVIDENCE_REJECTED");
    expect(source).toContain("PRODUCTION_SOURCE_OF_CREATE_UNAVAILABLE");
    expect(source).toContain("PRODUCTION_TRUST_CLAIM_REJECTED");
    expect(source).toContain("FORECAST_RUN_FORBIDDEN");
    expect(source).toContain("DECISION_BODY_HASH_MISMATCH");
    expect(source).toContain("immutable");
    expect(source).toContain("SET LOCAL ROLE authenticated");
  });

  it("allows only the dormant M7.2c harness adapter, not a production writer", () => {
    const adapterPath = path.join(
      ROOT,
      "lib/persistence/persist-inventory-action.ts",
    );
    expect(fs.existsSync(adapterPath)).toBe(true);

    const adapter = fs.readFileSync(adapterPath, "utf8");
    const importLines = adapter
      .split("\n")
      .filter((line) => /^\s*import\b/.test(line))
      .join("\n");
    expect(adapter.startsWith('import "server-only"')).toBe(true);
    expect(adapter).toContain("m7_persistence_contract_harness_v1");
    expect(adapter).toContain("PRODUCTION_SOURCE_OF_CREATE_UNAVAILABLE");
    expect(importLines).not.toContain("fixture-evaluation");
    expect(importLines).not.toContain("evaluateFixtureInventoryDecision");
    expect(importLines).not.toContain("decideInventoryAction");

    const decisionDir = path.join(ROOT, "lib/decision-engine");
    const decisionFiles = fs.readdirSync(decisionDir);
    expect(
      decisionFiles.some((name) =>
        /persist|writer|production/i.test(name),
      ),
    ).toBe(false);
  });
});
