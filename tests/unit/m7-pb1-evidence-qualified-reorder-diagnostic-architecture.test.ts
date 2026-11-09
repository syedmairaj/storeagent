import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

const MODULES = [
  "lib/decision-engine/pb1-trusted-supplier-planning-facts.ts",
  "lib/decision-engine/pb1-evidence-qualified-reorder-diagnostic.ts",
  "lib/decision-engine/pb1-trusted-supplier-lead-time-loader.ts",
] as const;

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

describe("M7-PB1.f trusted supplier lead-time architecture", () => {
  it("reuses binder/diagnostic and forbids org-default / PO-latency invention", () => {
    const facts = source(MODULES[0]);
    const diagnostic = source(MODULES[1]);
    const loader = source(MODULES[2]);

    expect(facts).toContain("stated_supplier_product_terms");
    expect(facts).toContain("notVerifiedDeliveryPerformance");
    expect(facts).toContain("ORG_PLANNING_DEFAULTS_FORBIDDEN");
    expect(facts).toContain("SUPPLIER_DEFAULT_LEAD_TIME_FORBIDDEN");
    expect(facts.includes("ordered_at")).toBe(false);
    expect(facts.includes("received_at")).toBe(false);

    expect(diagnostic).toContain(
      "evaluatePb1OfflineDiagnosticFromBindingRequest",
    );
    expect(diagnostic).toContain("deriveRecommendedOrderQuantity: true");
    expect(diagnostic).toContain("deriveOverstockRisk: false");
    expect(diagnostic).toContain("deriveStockoutRisk: false");
    expect(diagnostic).toContain("runDiagnosticDecision: true");
    expect(diagnostic).toContain(
      "M5_THRESHOLDS_MAY_USE_ORG_DEFAULT_LEAD_TIME_PB1_USES_SUPPLIER_PRODUCT_STATED_TERMS",
    );
    expect(diagnostic.includes("decideInventoryAction(")).toBe(false);
    expect(diagnostic.includes("evaluateReorderRule")).toBe(false);
    expect(diagnostic.includes("persistInventoryAction")).toBe(false);

    expect(loader).toContain("resolvePb1TrustedSupplierPlanningFacts");
    expect(loader).toContain("from(\"supplier_products\")");
    expect(loader).toContain("organization_members");

    for (const relative of [MODULES[0], MODULES[1]]) {
      const text = source(relative);
      const specifiers = importSpecifiers(text);
      for (const fragment of FORBIDDEN_SPECIFIER_FRAGMENTS) {
        expect(
          specifiers.some((specifier) => specifier.includes(fragment)),
          `${relative} must not import ${fragment}`,
        ).toBe(false);
      }
      expect(specifiers.some((s) => s.includes("@supabase"))).toBe(false);
    }

    const loaderSpecifiers = importSpecifiers(loader);
    for (const fragment of [
      "lib/decision-brief",
      "lib/demo",
      "persist-inventory-action",
      "planning-inputs",
      "workers/",
      "app/",
    ] as const) {
      expect(
        loaderSpecifiers.some((specifier) => specifier.includes(fragment)),
      ).toBe(false);
    }
  });

  it("keeps commercial gates hard-false", () => {
    for (const relative of MODULES) {
      const text = source(relative);
      for (const literal of FORBIDDEN_TRUE_ELIGIBILITY) {
        expect(
          text.includes(literal),
          `${relative} must not contain ${literal}`,
        ).toBe(false);
      }
    }

    const diagnostic = source(MODULES[1]);
    expect(diagnostic).toContain("productionApprovalEligible: false");
    expect(diagnostic).toContain("productionDecisionCreationEligible: false");
    expect(diagnostic).toContain('forecastEligibility: "ineligible"');
  });

  it("does not mutate frozen engine formulas", () => {
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
      "pb1-evidence-qualified-reorder-diagnostic",
      "pb1-trusted-supplier-planning-facts",
      "pb1-trusted-supplier-lead-time-loader",
      "evaluatePb1EvidenceQualifiedReorderDiagnostic",
      "loadPb1TrustedSupplierPlanningFacts",
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
});
