import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

const migrationPath = path.join(
  ROOT,
  "supabase/migrations/20261012090000_m3_9_csv_sync_run_orchestration.sql",
);

function migration(): string {
  return fs.readFileSync(migrationPath, "utf8");
}

describe("M3.9D-E CSV SyncRun orchestration schema", () => {
  it("defines the three service-side CSV SyncRun RPCs", () => {
    const sql = migration();

    expect(sql).toContain(
      "create or replace function public.csv_begin_sync_run(",
    );

    expect(sql).toContain(
      "create or replace function public.csv_complete_sync_run(",
    );

    expect(sql).toContain(
      "create or replace function public.csv_fail_sync_run(",
    );
  });

  it("keeps replay identity organization integration and idempotency key only", () => {
    const sql = migration();

    expect(sql).toContain("sr.organization_id = p_organization_id");

    expect(sql).toContain("sr.integration_id = p_integration_id");

    expect(sql).toContain("sr.idempotency_key = normalized_key");

    expect(sql).not.toContain("sr.store_id = p_store_id");
  });

  it("distinguishes started replayed and in-progress acquisition", () => {
    const sql = migration();

    expect(sql).toContain("'started'::text");

    expect(sql).toContain("'replayed'::text");

    expect(sql).toContain("'in_progress'::text");
  });

  it("creates newly acquired runs as running", () => {
    const sql = migration();

    expect(sql).toContain("'running'");

    expect(sql).toContain("insert into public.sync_runs");
  });

  it("handles unique races inside the begin RPC", () => {
    const sql = migration();

    expect(sql).toContain("when unique_violation then");
  });

  it("persists all six final counters", () => {
    const sql = migration();

    for (const column of [
      "discovered_count",
      "imported_count",
      "updated_count",
      "skipped_count",
      "quarantined_count",
      "failed_count",
    ]) {
      expect(sql).toContain(column);
    }
  });

  it("uses completed_with_errors only for quarantine or row failure", () => {
    const sql = migration();

    expect(sql).toContain("p_quarantined_count > 0");

    expect(sql).toContain("p_failed_count > 0");

    expect(sql).toContain("'completed_with_errors'");
  });

  it("requires exact discovered versus terminal accounting", () => {
    const sql = migration();

    expect(sql).toContain("terminal_count <> p_discovered_count");
  });

  it("fails only queued or running runs", () => {
    const sql = migration();

    expect(sql).toContain("existing_run.status not in (");

    expect(sql).toContain("'queued'");

    expect(sql).toContain("'running'");
  });

  it("keeps all three RPCs service-role only", () => {
    const sql = migration();

    expect(sql.match(/grant execute[\s\S]*?to service_role;/g)).toHaveLength(3);

    expect(sql.match(/from public, anon, authenticated;/g)).toHaveLength(3);
  });
});
