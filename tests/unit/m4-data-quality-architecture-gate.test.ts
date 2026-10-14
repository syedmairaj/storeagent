import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

const ROOT = process.cwd();

const PRODUCTION_MODULES = [
  "lib/data-quality/types.ts",
  "lib/data-quality/identity.ts",
  "lib/data-quality/qualification.ts",
  "lib/data-quality/persistence.ts",
  "lib/data-quality/lifecycle.ts",
];

const M4_MIGRATIONS = [
  "supabase/migrations/20261013100000_m4_2_data_quality_issues.sql",
  "supabase/migrations/20261013110000_m4_5_data_quality_issue_persistence.sql",
  "supabase/migrations/20261013120000_m4_6_data_quality_issue_lifecycle.sql",
];

const FORBIDDEN_IMPORTS = [
  "@/lib/metrics",
  "@/lib/forecasting",
  "@/lib/decision-engine",
  "@/lib/ai",
  "@/lib/billing",
  "@shopify/",
  "shopify",
  "openai",
  "stripe",
  "react",
  "next/",
  "@/app/",
  "@/components/",
];

function read(relativePath: string): string {
  return fs.readFileSync(
    path.join(ROOT, relativePath),
    "utf8",
  );
}

function importSpecifiers(source: string): string[] {
  return [
    ...source.matchAll(
      /(?:from|import)\s+["']([^"']+)["']/g,
    ),
  ].map((match) => match[1] ?? "");
}

describe("M4 data quality architecture gate", () => {
  const modules = PRODUCTION_MODULES.map((modulePath) => ({
    modulePath,
    source: read(modulePath),
  }));
  const migrations = M4_MIGRATIONS.map(read).join("\n");
  const normalized = migrations.replace(/\s+/g, " ").toLowerCase();
  const invariants = read("docs/DOMAIN_INVARIANTS.md");
  const model = read("docs/DOMAIN_MODEL.md");
  const boundary = read("docs/SERVICE_ROLE_BOUNDARY.md");
  const values = read("docs/VALUE_SEMANTICS.md");
  const status = read("docs/IMPLEMENTATION_STATUS.md");

  it("keeps M4 modules free of later-milestone and browser imports", () => {
    for (const moduleFile of modules) {
      expect(moduleFile.source).not.toContain('"use client"');

      for (const specifier of importSpecifiers(moduleFile.source)) {
        for (const forbidden of FORBIDDEN_IMPORTS) {
          expect(
            specifier,
            `${moduleFile.modulePath} imports ${specifier}`,
          ).not.toContain(forbidden);
        }
      }
    }
  });

  it("keeps issue mutation on the service-role boundary", () => {
    expect(normalized.match(/create policy/g)).toHaveLength(1);
    expect(normalized).toContain(
      "create policy data_quality_issues_select_member on public.data_quality_issues for select to authenticated",
    );
    expect(normalized).toContain(
      "revoke all on table public.data_quality_issues from anon",
    );
    expect(normalized).not.toContain("for insert");
    expect(normalized).not.toContain("for delete");
    expect(normalized).not.toContain("grant insert");
    expect(normalized).not.toContain("grant update");
    expect(normalized).not.toContain("grant delete");
    expect(normalized).toContain(
      "revoke all on function public.persist_data_quality_issue",
    );
    expect(normalized).toContain(
      "revoke all on function public.transition_data_quality_issue",
    );
    expect(normalized).toContain("from public, anon, authenticated");
    expect(normalized).toContain("to service_role");
    expect(
      normalized.match(
        /grant execute on function public\.persist_data_quality_issue/g,
      ),
    ).toHaveLength(1);
    expect(
      normalized.match(
        /grant execute on function public\.transition_data_quality_issue/g,
      ),
    ).toHaveLength(1);
  });

  it("documents milestone ownership, lifecycle codes, and adversarial proof", () => {
    expect(invariants).toContain("M5 owns derived SKU metrics.");
    expect(invariants).toContain("M6 owns forecasting.");
    expect(invariants).toContain("M7 owns inventory decisions.");
    expect(invariants).toContain("SA003");
    expect(invariants).toContain("SA004");
    expect(invariants).toContain("SA005");
    expect(invariants).toContain("SA006");
    expect(invariants).toContain("SA007");
    expect(invariants).toContain("externalParentId");
    expect(invariants).toContain(
      "tests/unit/data-quality-adversarial.live.test.ts",
    );
    expect(model).toContain("critical");
    expect(model).toContain("open");
    expect(model).toContain("resolved");
    expect(model).toContain("ignored");
    expect(model).toContain("superseded");
    expect(boundary).toContain("persist_data_quality_issue");
    expect(boundary).toContain("transition_data_quality_issue");
    expect(boundary).toContain("service_role");
    expect(values).toContain("NEGATIVE_INVENTORY");
    expect(values).toContain("DOMAIN_INVARIANTS.md");
    expect(status).toContain("M5 — derived SKU metrics");
    expect(status).toContain("M6 owns forecasting.");
    expect(status).toContain("M7 owns inventory decisions.");
    expect(status).toContain("cross-tenant reads and persistence");
    expect(status).toContain("forged identity");
    expect(status).toContain("payload and source-context abuse");
    expect(status).toContain("provider subject abuse");
    expect(status).toContain("lifecycle chronology");
    expect(status).toContain(
      "mixed persistence and lifecycle concurrency",
    );
    expect(status).toContain("identity immutability");
  });
});
