import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

const ROOT = process.cwd();

const MIGRATION =
  "supabase/migrations/20261031120000_m7_3b_human_approval_lifecycle_schema.sql";
const ADVERSARIAL =
  "tests/sql/m7-3b-action-events-lifecycle-schema-adversarial.sql";
const M72_MIGRATION =
  "supabase/migrations/20261031100000_m7_2b_inventory_action_persistence.sql";
const CONTRACT =
  "docs/M7_3A_HUMAN_APPROVAL_LIFECYCLE_CONTRACT.md";

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

function normalized(relative: string): string {
  return read(relative).replace(/\s+/g, " ").toLowerCase();
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

describe("M7.3b human approval lifecycle schema architecture", () => {
  it("adds action_events and supersede column without rewriting M7.2 migration", () => {
    const source = read(MIGRATION);
    const m72 = read(M72_MIGRATION);

    expect(source).toContain("create table public.action_events");
    expect(source).toContain("superseded_by_action_id");
    expect(source).toContain("inventory_actions_status_check");
    expect(source).toContain("drop constraint inventory_actions_status_new_only");
    expect(source).toContain("action_events_idempotency_uidx");
    expect(source).toContain("validate_action_event_insert");
    expect(source).toContain("ACTION_EVENT_EDIT_REQUIRES_REORDER");

    expect(m72).toContain("inventory_actions_status_new_only");
    expect(m72).not.toContain("create table public.action_events");
  });

  it("preserves full-row inventory_actions immutability (no generic UPDATE path)", () => {
    const source = read(MIGRATION);
    const sql = normalized(MIGRATION);

    expect(source).toContain("Full-row immutability on");
    expect(source).toContain("inventory_actions is PRESERVED");
    expect(sql).not.toContain("drop trigger inventory_actions_immutable");
    expect(sql).not.toContain("prevent_inventory_action_mutation");
    expect(source).not.toMatch(
      /only status and superseded_by_action_id may differ/i,
    );
    expect(source).not.toContain("storeagent.lifecycle_rpc");
  });

  it("does not ship lifecycle transition RPCs or created-event backfill", () => {
    const source = read(MIGRATION);
    const sql = normalized(MIGRATION);

    expect(source).not.toContain("transition_inventory_action_merchant");
    expect(source).not.toContain("expire_inventory_action_system");
    expect(source).not.toContain("supersede_inventory_action_system");
    expect(sql).not.toContain("insert into public.action_events");
    expect(source).toContain("No created-event backfill");
  });

  it("enforces append-only events, member SELECT, and no role DML grants", () => {
    const source = read(MIGRATION);

    expect(source).toContain("prevent_action_event_mutation");
    expect(source).toContain(
      "before update or delete on public.action_events",
    );
    expect(source).toContain("action_events_select_member");
    expect(source).toContain(
      "revoke all\non table public.action_events\nfrom public, anon, authenticated, service_role",
    );
    expect(source).toContain(
      "grant select\non table public.action_events\nto authenticated, service_role",
    );
    expect(source).toContain("inventory_actions_superseded_by_fk");
    expect(source).toContain("inventory_actions_supersede_status_coherence");
  });

  it("keeps inventory-action approval HTTP/API/worker wiring absent", () => {
    const apiFiles = listFilesRecursive(path.join(ROOT, "app/api")).map(
      (file) => path.relative(ROOT, file),
    );

    for (const file of apiFiles) {
      expect(file).not.toMatch(
        /action.?event|inventory.?action|human.?approv/i,
      );
      const text = fs.readFileSync(path.join(ROOT, file), "utf8");
      expect(text).not.toMatch(
        /transition_inventory_action|action_events|accepted_with_edit/,
      );
    }

    const approvalWiring = [
      ...listFilesRecursive(path.join(ROOT, "lib")),
      ...listFilesRecursive(path.join(ROOT, "app")),
    ]
      .map((file) => path.relative(ROOT, file))
      .filter((file) =>
        /action-event|inventory-action-transition|human-approv|approve-inventory-action/i.test(
          file,
        ),
      );

    expect(approvalWiring).toEqual([]);

    expect(fs.existsSync(path.join(ROOT, CONTRACT))).toBe(true);
    expect(read(CONTRACT)).toContain("M7.3a");
  });

  it("ships SQL adversarial coverage for schema foundation", () => {
    const source = read(ADVERSARIAL);

    expect(source).toContain("inventory_actions_status_check");
    expect(source).toContain("immutable");
    expect(source).toContain("ACTION_EVENT_EDIT_REQUIRES_REORDER");
    expect(source).toContain("ACTION_EVENT_EDITED_QUANTITY_INVALID");
    expect(source).toContain("must not backfill created events");
    expect(source).toContain("SET LOCAL ROLE authenticated");
    expect(source).toContain("cross-org superseded_by");
    expect(source).toContain("must not ship lifecycle transition RPCs");
  });
});
