import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const MODULE_FILE =
  "lib/decision-engine/pb1-trusted-persisted-metric-promote-loader.ts";

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
  "decideInventoryAction",
  "evaluatePromoteRule",
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

describe("M7-PB1.c trusted persisted-metric PROMOTE loader architecture", () => {
  it("is server-only and reuses PB1.b diagnostic without forking rules", () => {
    const text = source(MODULE_FILE);
    expect(text.startsWith('import "server-only"')).toBe(true);

    const specifiers = importSpecifiers(text);
    for (const fragment of FORBIDDEN_SPECIFIER_FRAGMENTS) {
      expect(
        specifiers.some((specifier) => specifier.includes(fragment)),
        `must not import specifier containing ${fragment}`,
      ).toBe(false);
    }

    expect(text).toContain("evaluatePb1EvidenceQualifiedPromoteDiagnostic");
    expect(text).toContain('kind: "persisted_eligible_incoming"');
    expect(text).toContain("supplierPlanning?: never");
    expect(text).toContain("countPendingMetricWorkForOrganization");
    expect(text).toContain("storeLocalAsOfDate");
    expect(text).toContain("organization_members");
    expect(text).toContain("sku_daily_metrics");
    expect(text.includes("decideInventoryAction(")).toBe(false);
    expect(text.includes("persistInventoryAction")).toBe(false);
    expect(text.includes("evaluatePromoteRule")).toBe(false);
  });

  it("keeps commercial gates hard-false and never invents inventory age", () => {
    const text = source(MODULE_FILE);

    for (const literal of FORBIDDEN_TRUE_ELIGIBILITY) {
      expect(text.includes(literal), `must not contain ${literal}`).toBe(
        false,
      );
    }

    expect(text).toContain("productionApprovalEligible: false");
    expect(text).toContain("productionDecisionCreationEligible: false");
    expect(text).toContain('forecastEligibility: "ineligible"');
    expect(text).toMatch(/inventoryAgeDays\s*=\s*null/);
    expect(text).toMatch(/Never invents? a non-null age|never invents? a non-null age/i);
    expect(text.includes("inventoryAgeDays: 90")).toBe(false);
    expect(text.includes("inventoryAgeDays: 120")).toBe(false);
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
      "pb1-trusted-persisted-metric-promote-loader",
      "loadPb1TrustedPersistedMetricPromoteDiagnostic",
      "evaluatePb1TrustedPersistedMetricPromoteFromLoadedRow",
      "M7_PB1_TRUSTED_PERSISTED_METRIC_PROMOTE_LOADER_VERSION_V1",
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
