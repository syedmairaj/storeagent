import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const MIGRATION = fs.readFileSync(
  path.join(
    ROOT,
    "supabase/migrations/20261028220000_m5_7_claim_busy_grain_exclusion.sql",
  ),
  "utf8",
);

describe("M5.7 Phase 3B claim busy-grain exclusion architecture", () => {
  it("only replaces claim_sku_daily_metric_recompute_requests forward-only", () => {
    expect(MIGRATION).toContain(
      "create or replace function public.claim_sku_daily_metric_recompute_requests(",
    );
    expect(MIGRATION).toContain("p_organization_id uuid default null");
    expect(MIGRATION).not.toContain("create or replace function public.recover_");
    expect(MIGRATION).not.toContain("create or replace function public.complete_");
    expect(MIGRATION).not.toContain("create or replace function public.fail_");
    expect(MIGRATION).not.toContain("create or replace function public.start_");
    expect(MIGRATION.toLowerCase()).not.toContain("drop table");
    expect(MIGRATION.toLowerCase()).not.toContain("alter table");
  });

  it("excludes busy grains before LIMIT and keeps in-loop defense", () => {
    const notExists = MIGRATION.indexOf("and not exists (");
    const limit = MIGRATION.indexOf("limit 500");
    const loopExists = MIGRATION.indexOf(
      "if exists (\n      select 1\n      from public.sku_daily_metric_recompute_requests as active",
      limit,
    );

    expect(notExists).toBeGreaterThan(0);
    expect(limit).toBeGreaterThan(notExists);
    expect(loopExists).toBeGreaterThan(limit);
    expect(MIGRATION).toContain("pg_catalog.pg_advisory_xact_lock(5606003)");
    expect(MIGRATION).toContain("for update skip locked");
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
