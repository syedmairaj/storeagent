import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const MIGRATION = fs.readFileSync(
  path.join(
    ROOT,
    "supabase/migrations/20261028210000_m5_7_deferred_completion_attempt_reset.sql",
  ),
  "utf8",
);

function deferredBranch(): string {
  const start = MIGRATION.indexOf("consumed_at is null");
  expect(start).toBeGreaterThanOrEqual(0);
  const end = MIGRATION.indexOf("return 'deferred'", start);
  expect(end).toBeGreaterThan(start);

  return MIGRATION.slice(start, end);
}

describe("M5.7 Phase 2 deferred attempt reset architecture", () => {
  it("only replaces complete_sku_daily_metric_recompute forward-only", () => {
    expect(MIGRATION).toContain(
      "create or replace function public.complete_sku_daily_metric_recompute(",
    );
    expect(MIGRATION).not.toContain("create or replace function public.fail_");
    expect(MIGRATION).not.toContain("create or replace function public.claim_");
    expect(MIGRATION).not.toContain("create or replace function public.start_");
    expect(MIGRATION).not.toContain("create or replace function public.recover_");
    expect(MIGRATION.toLowerCase()).not.toContain("drop table");
    expect(MIGRATION.toLowerCase()).not.toContain("alter table");
  });

  it("resets attempt_count on deferred after fencing and supersession checks", () => {
    const completeStart = MIGRATION.indexOf(
      "create or replace function public.complete_sku_daily_metric_recompute(",
    );
    const fence = MIGRATION.indexOf("return 'fenced'", completeStart);
    const superseded = MIGRATION.indexOf("return 'superseded'", completeStart);
    const deferred = MIGRATION.indexOf("return 'deferred'", completeStart);
    const succeeded = MIGRATION.indexOf("return 'succeeded'", completeStart);

    expect(fence).toBeGreaterThan(completeStart);
    expect(superseded).toBeGreaterThan(fence);
    expect(deferred).toBeGreaterThan(superseded);
    expect(succeeded).toBeGreaterThan(deferred);

    const branch = deferredBranch();
    expect(branch).toContain("attempt_count = 0");
    expect(branch).toContain("status = 'queued'");
  });

  it("keeps security definer, empty search_path, and service_role-only execute", () => {
    expect(MIGRATION).toContain("security definer");
    expect(MIGRATION).toContain("set search_path = ''");
    expect(MIGRATION).toContain("from public, anon, authenticated");
    expect(MIGRATION).toContain("to service_role");
    expect(MIGRATION).not.toMatch(
      /grant execute[\s\S]*to (anon|authenticated)/i,
    );
  });
});
