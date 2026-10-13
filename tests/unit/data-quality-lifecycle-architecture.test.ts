import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(
    path.join(ROOT, relativePath),
    "utf8",
  );
}

describe("data quality lifecycle architecture", () => {
  const migration = read(
    "supabase/migrations/20261013120000_m4_6_data_quality_issue_lifecycle.sql",
  );
  const lifecycle = read("lib/data-quality/lifecycle.ts");
  const normalized = migration.replace(/\s+/g, " ").toLowerCase();

  it("locks the trusted organization issue before changing status", () => {
    expect(normalized).toContain(
      "where issue.organization_id = p_organization_id and issue.id = p_issue_id for update",
    );
    expect(normalized).toContain("set search_path = ''");
    expect(lifecycle).toContain("p_organization_id");
    expect(lifecycle).toContain("p_issue_id");
    expect(lifecycle).not.toContain("sourceContext");
    expect(lifecycle).not.toContain("Date.now");
  });

  it("updates only status and resolved_at", () => {
    expect(normalized).toContain(
      "update public.data_quality_issues issue set status = next_status, resolved_at = next_resolved_at",
    );
    expect(normalized).not.toContain("set organization_id");
    expect(normalized).not.toContain("set issue_key");
    expect(normalized).not.toContain("set detected_at");
    expect(normalized).not.toContain("occurrence_count =");
  });

  it("uses dedicated sqlstates and service-role execution", () => {
    expect(normalized).toContain("errcode = 'sa005'");
    expect(normalized).toContain("errcode = 'sa006'");
    expect(normalized).toContain(
      "if p_occurred_at < existing.detected_at then raise exception using errcode = 'sa007'",
    );
    expect(normalized.indexOf("errcode = 'sa007'")).toBeLessThan(
      normalized.indexOf("existing.status is distinct from 'open'"),
    );
    expect(lifecycle).toContain("SA005");
    expect(lifecycle).toContain("SA006");
    expect(lifecycle).toContain(
      'DATA_QUALITY_LIFECYCLE_BEFORE_DETECTION_SQLSTATE = "SA007"',
    );
    expect(normalized).toContain(
      "revoke all on function public.transition_data_quality_issue",
    );
    expect(normalized).toContain("from public, anon, authenticated");
    expect(normalized).toContain("to service_role");
    expect(normalized).not.toContain("create policy");
    expect(normalized).not.toContain("grant insert");
    expect(normalized).not.toContain("grant update");
    expect(lifecycle).not.toContain("@/lib/metrics");
    expect(lifecycle).not.toContain("@/lib/forecasting");
    expect(lifecycle).not.toContain("@/lib/decision-engine");
  });
});
