import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

const ROOT = process.cwd();
const MIGRATION =
  "supabase/migrations/20261030150000_m6_p3d1_forecast_publication.sql";

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

function normalized(relative: string): string {
  return read(relative).replace(/\s+/g, " ").toLowerCase();
}

describe("M6 P3d.1 forecast publication architecture", () => {
  it("adds immutable publications and one current pointer per grain", () => {
    const source = read(MIGRATION);

    expect(source).toContain("create table public.sku_forecast_publications");
    expect(source).toContain("create table public.sku_forecast_current");
    expect(source).toContain("sku_forecast_current_pk");
    expect(source).toContain("sku_forecast_publications_published_run_uidx");
    expect(source).toContain("prevent_forecast_publication_mutation");
    expect(source).toContain(
      "before update or delete on public.sku_forecast_publications",
    );
    expect(source).toContain("m7_eligible boolean not null");
    expect(source).toContain("check (m7_eligible = false)");
  });

  it("defines SECURITY DEFINER service_role publish RPC with empty search_path", () => {
    const source = read(MIGRATION);
    const sql = normalized(MIGRATION);

    expect(source).toContain(
      "create or replace function public.publish_sku_forecast(",
    );
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(source).toContain(
      "grant execute\non function public.publish_sku_forecast(uuid)",
    );
    expect(source).toContain("to service_role");
    expect(source).toContain("from public, anon, authenticated");
  });

  it("serializes per grain, revalidates after lock, and never claims freshness", () => {
    const source = read(MIGRATION);

    expect(source).toContain("pg_advisory_xact_lock");
    expect(source).toContain("1347765297");
    expect(source).toContain("AFTER the lock");
    expect(source).toContain("forecast_sku_demand_source_snapshot(");
    expect(source).toContain("STALE_SOURCE_TOKEN");
    expect(source).toContain("PENDING_CORRECTION");
    expect(source).toContain("OLDER_AS_OF_THAN_CURRENT");
    expect(source).toContain("OLDER_SOURCE_VERSION");
    expect(source).toContain("completed_at");
    expect(source).toMatch(/source_token differences never override/i);
    expect(source).toContain("statement_timeout");
    expect(source).toContain("lock_timeout");
    expect(source.toLowerCase()).not.toContain("lock table");
    expect(source.toLowerCase()).not.toContain("in share mode");
    expect(source).toMatch(/NOT a freshness claim|not claimed solved/i);
    expect(source).toContain("persistClaimsPostCommitFreshness");
    expect(source).toContain("'m7Eligible', false");
    expect(source).toContain("pointerAdvanced");
  });

  it("denies direct DML and keeps RLS member SELECT only", () => {
    const source = read(MIGRATION);

    expect(source).toContain(
      "revoke all\non table public.sku_forecast_publications\nfrom public, anon, authenticated, service_role",
    );
    expect(source).toContain(
      "revoke all\non table public.sku_forecast_current\nfrom public, anon, authenticated, service_role",
    );
    expect(source).toContain("sku_forecast_publications_select_member");
    expect(source).toContain("sku_forecast_current_select_member");
    expect(source).not.toContain("create table public.forecast_publications_ci");
  });
});
