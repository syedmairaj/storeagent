import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

const ROOT = process.cwd();
const MODULE_FILE =
  "lib/decision-engine/pb1-evidence-qualified-promote-diagnostic.ts";

const ENGINE_RULE_FILES = [
  "lib/decision-engine/reorder-rule.ts",
  "lib/decision-engine/reduce-rule.ts",
  "lib/decision-engine/promote-rule.ts",
  "lib/decision-engine/watch-healthy-rule.ts",
  "lib/decision-engine/conflict-resolution.ts",
  "lib/decision-engine/confidence.ts",
  "lib/decision-engine/priority.ts",
  "lib/metrics/inventory-math.ts",
] as const;

const FORBIDDEN_SPECIFIER_FRAGMENTS = [
  "lib/decision-brief",
  "lib/demo",
  "persist-inventory-action",
  "fixture-evaluation",
  "openai",
  "@ai-sdk",
  "workers/",
  "app/",
  "@supabase/supabase-js",
  "@supabase/ssr",
  "createClient",
  "next/server",
  "next/headers",
  "planning-inputs",
] as const;

const FORBIDDEN_TRUE_ELIGIBILITY = [
  "productionApprovalEligible: true",
  "productionDecisionCreationEligible: true",
  "claimsMerchantFacing: true",
  "claimsProductionForecastApproval: true",
  "claimsM7ProductionEligibility: true",
  "algorithmApproved: true",
  "isScoredMerchantDecision: true",
  "engineBoundBriefEligible: true",
  "commercialActionsEligible: true",
] as const;

function source(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

function importSpecifiers(text: string): string[] {
  return [
    ...text.matchAll(
      /(?:import|export)\s+(?:type\s+)?(?:[^'"()]*?\s+from\s+|)\s*['"]([^'"]+)['"]/g,
    ),
  ].map((match) => match[1]);
}

function walkTsFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name === "node_modules" ||
        entry.name === ".git" ||
        entry.name === ".next" ||
        entry.name.startsWith(".")
      ) {
        continue;
      }
      files.push(...walkTsFiles(full));
      continue;
    }
    if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      files.push(full);
    }
  }

  return files;
}

describe("M7-PB1.b evidence-qualified PROMOTE diagnostic architecture", () => {
  it("reuses binder/diagnostic and resolveEligibleIncoming only", () => {
    const text = source(MODULE_FILE);
    const specifiers = importSpecifiers(text);

    for (const fragment of FORBIDDEN_SPECIFIER_FRAGMENTS) {
      expect(
        specifiers.some((specifier) => specifier.includes(fragment)),
        `must not import specifier containing ${fragment}`,
      ).toBe(false);
    }

    expect(text).toContain("evaluatePb1OfflineDiagnosticFromBindingRequest");
    expect(text).toContain("resolveEligibleIncoming");
    expect(text).toContain("deriveOverstockRisk: true");
    expect(text).toContain("deriveRecommendedOrderQuantity: false");
    expect(text).toContain("deriveStockoutRisk: false");
    expect(text).toContain("runDiagnosticDecision: true");
    expect(text.includes("decideInventoryAction(")).toBe(false);
    expect(text.includes("evaluatePromoteRule")).toBe(false);
    expect(text.includes("persistInventoryAction")).toBe(false);
  });

  it("keeps commercial gates hard-false and never unlocks Actions", () => {
    const text = source(MODULE_FILE);

    for (const literal of FORBIDDEN_TRUE_ELIGIBILITY) {
      expect(text.includes(literal), `must not contain ${literal}`).toBe(
        false,
      );
    }

    expect(text).toContain("productionApprovalEligible: false");
    expect(text).toContain("productionDecisionCreationEligible: false");
    expect(text).toContain('forecastEligibility: "ineligible"');
    expect(text).toContain("supplierPlanning?: never");
  });

  it("does not mutate frozen engine formulas or invent empty-set zero", () => {
    const text = source(MODULE_FILE);
    expect(text).toContain("incomingEvidenceComplete");
    expect(text).toMatch(/empty set becomes known-zero only when/i);

    const dirty = execFileSync(
      "git",
      ["status", "--porcelain", "--", ...ENGINE_RULE_FILES],
      { cwd: ROOT, encoding: "utf8" },
    ).trim();
    expect(dirty).toBe("");
  });

  it("is not wired into Actions UI, API routes, workers, or persistence", () => {
    const roots = [
      path.join(ROOT, "app"),
      path.join(ROOT, "workers"),
      path.join(ROOT, "lib/persistence"),
      path.join(ROOT, "lib/demo"),
      path.join(ROOT, "lib/decision-brief"),
      path.join(ROOT, "components"),
    ];

    const markers = [
      "pb1-evidence-qualified-promote-diagnostic",
      "evaluatePb1EvidenceQualifiedPromoteDiagnostic",
    ];

    const offenders: string[] = [];

    for (const root of roots) {
      for (const file of walkTsFiles(root)) {
        const text = fs.readFileSync(file, "utf8");
        if (markers.some((marker) => text.includes(marker))) {
          offenders.push(path.relative(ROOT, file));
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("documents empty-set attestation fencing prerequisites as already present", () => {
    const migration = source(
      "supabase/migrations/20261108180000_trusted_incoming_evidence_v1.sql",
    );
    expect(migration).toContain("store_incoming_evidence_attestations");
    expect(migration).toContain("evidence_complete");
    expect(migration).toContain("capture_purchase_order_item_update_metric_source_events");
    expect(migration).toContain(
      "lock table public.store_incoming_evidence_attestations",
    );
    expect(migration).toContain("errcode = 'SA008'");
  });
});
