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

describe("data quality persistence architecture", () => {
  const migration = read(
    "supabase/migrations/20261013110000_m4_5_data_quality_issue_persistence.sql",
  );
  const persistence = read(
    "lib/data-quality/persistence.ts",
  );
  const normalized = migration
    .replace(/\s+/g, " ")
    .toLowerCase();

  it("serializes open issue identity with a transaction advisory lock", () => {
    expect(normalized).toContain(
      "pg_catalog.pg_advisory_xact_lock( pg_catalog.hashtextextended( p_organization_id::text || ':' || canonical_key, 0 ) )",
    );

    expect(normalized).toContain("for update");
    expect(normalized).not.toContain("unique_violation");
    expect(persistence).toContain(
      "buildDataQualityIssueKey",
    );
  });

  it("reconciles one open row without rewriting identity or resolved history", () => {
    expect(normalized).toContain(
      "occurrence_count = existing.occurrence_count + 1",
    );

    expect(normalized).toContain(
      "if p_detected_at > existing.last_detected_at then next_last_detected_at := p_detected_at; else next_last_detected_at := existing.last_detected_at; end if;",
    );

    expect(normalized).toContain("'reconciled'::text");
    expect(normalized).toContain("'created'::text");
    expect(normalized).not.toContain(
      "set detected_at",
    );
    expect(normalized).not.toContain(
      "status = 'resolved'",
    );
    expect(normalized).not.toContain(
      "status = 'open' where",
    );
  });

  it("fails closed for ignored and superseded history", () => {
    expect(normalized).toContain("errcode = 'sa003'");
    expect(normalized).toContain("errcode = 'sa004'");
    expect(normalized).toContain("status = 'ignored'");
    expect(normalized).toContain("status = 'superseded'");
    expect(persistence).toContain("SA003");
    expect(persistence).toContain("SA004");
  });

  it("keeps severity monotonic", () => {
    expect(migration).toContain(
      "critical > high > medium > low > info",
    );
    expect(persistence).toContain(
      "critical > high > medium > low > info",
    );

    for (const severity of [
      "critical",
      "high",
      "medium",
      "low",
      "info",
    ]) {
      expect(migration).toContain(`when '${severity}'`);
    }
  });

  it("does not grant browser writes or lifecycle mutations", () => {
    expect(normalized).toContain(
      "revoke all on function public.persist_data_quality_issue",
    );
    expect(normalized).toContain(
      "from public, anon, authenticated",
    );
    expect(normalized).toContain("to service_role");
    expect(normalized).not.toContain("create policy");
    expect(normalized).not.toContain("grant insert");
    expect(normalized).not.toContain("grant update");
    expect(normalized).not.toContain("grant delete");
    expect(migration).toContain("set search_path = ''");
    expect(persistence).toContain(
      "createSupabaseAdminClient",
    );
    expect(persistence).not.toContain(
      "@/lib/supabase/browser",
    );
    expect(persistence).not.toContain("@/lib/metrics");
    expect(persistence).not.toContain("@/lib/forecasting");
    expect(persistence).not.toContain("@/lib/decision-engine");
  });
});
