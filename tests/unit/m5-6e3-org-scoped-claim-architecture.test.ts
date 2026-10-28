import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const MIGRATION = fs.readFileSync(
  path.join(
    ROOT,
    "supabase/migrations/20261028100000_m5_6e3_org_scoped_claim_recover.sql",
  ),
  "utf8",
);
const QUEUE = fs.readFileSync(
  path.join(ROOT, "lib/persistence/metric-recompute-queue.ts"),
  "utf8",
);
const ROUTE = fs.readFileSync(
  path.join(ROOT, "app/api/internal/metric-recompute/route.ts"),
  "utf8",
);

describe("M5.6E.3 org-scoped claim/recover architecture", () => {
  it("drops prior claim/recover identities without CASCADE", () => {
    expect(MIGRATION).toContain(
      "drop function if exists\n  public.claim_sku_daily_metric_recompute_requests(",
    );
    expect(MIGRATION).toContain(
      "drop function if exists\n  public.recover_expired_sku_daily_metric_recompute_leases(",
    );
    expect(MIGRATION).not.toMatch(/drop\s+[\s\S]*?\bcascade\b/i);
    expect(MIGRATION.toLowerCase()).not.toContain("truncate");
    expect(MIGRATION.toLowerCase()).not.toContain("drop table");
  });

  it("adds trailing p_organization_id with null default and filters candidates", () => {
    expect(MIGRATION).toContain("p_organization_id uuid default null");
    expect(MIGRATION).toContain(
      "or request.organization_id = p_organization_id",
    );
    expect(MIGRATION).toContain(
      "The active-lease ceiling remains GLOBAL",
    );
    expect(MIGRATION).toContain("pg_catalog.pg_advisory_xact_lock(5606003)");
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

  it("exposes optional organizationId on TS claim/recover without changing routes", () => {
    expect(QUEUE).toContain("organizationId?: string | null");
    expect(QUEUE).toContain("p_organization_id: scopedOrganizationId");
    expect(ROUTE).not.toContain("organizationId");
    expect(ROUTE).toContain('METRIC_RECOMPUTE_WORKER_ENABLED');
  });
});
