import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

const ROOT = process.cwd();
const MODULE_FILE = "lib/decision-engine/metric-decision-binding.ts";

const ENGINE_RULE_FILES = [
  "lib/decision-engine/reorder-rule.ts",
  "lib/decision-engine/reduce-rule.ts",
  "lib/decision-engine/promote-rule.ts",
  "lib/decision-engine/watch-healthy-rule.ts",
  "lib/decision-engine/conflict-resolution.ts",
  "lib/decision-engine/confidence.ts",
  "lib/decision-engine/priority.ts",
] as const;

const FORBIDDEN_SPECIFIER_FRAGMENTS = [
  "lib/decision-brief",
  "lib/demo",
  "persist-inventory-action",
  "fixture-evaluation",
  "/decide",
  "openai",
  "@ai-sdk",
  "workers/",
  "app/",
  "@supabase/supabase-js",
  "@supabase/ssr",
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

describe("M7-PB1.a metric-decision-binding architecture", () => {
  it("forbids AI, demo, persist, workers, app, fixture, and decide imports", () => {
    const text = source(MODULE_FILE);
    const specifiers = importSpecifiers(text);

    for (const fragment of FORBIDDEN_SPECIFIER_FRAGMENTS) {
      expect(
        specifiers.some((specifier) => specifier.includes(fragment)),
        `must not import specifier containing ${fragment}`,
      ).toBe(false);
    }

    expect(text.includes("evaluateFixtureInventoryDecision")).toBe(false);
    expect(text.includes("decideInventoryAction")).toBe(false);

    expect(specifiers.join("\n")).toContain("inventory-math");
    expect(specifiers.join("\n")).toContain("sku-daily-metric-record");
    expect(specifiers.join("\n")).toContain("./types");
  });

  it("never sets production/merchant eligibility true", () => {
    const text = source(MODULE_FILE);

    for (const literal of FORBIDDEN_TRUE_ELIGIBILITY) {
      expect(text.includes(literal), `must not contain ${literal}`).toBe(
        false,
      );
    }

    expect(text).toContain("productionApprovalEligible: false");
    expect(text).toContain("productionDecisionCreationEligible: false");
    expect(text).toContain('forecastEligibility: "ineligible"');
  });

  it("does not import fixture evaluation or decide, and leaves engine rules intact", () => {
    const text = source(MODULE_FILE);
    const specifiers = importSpecifiers(text);

    expect(specifiers.some((s) => s.includes("fixture-evaluation"))).toBe(
      false,
    );
    expect(specifiers.some((s) => s.endsWith("/decide") || s === "./decide")).toBe(
      false,
    );
    expect(text.includes("evaluateFixtureInventoryDecision")).toBe(false);
    expect(text.includes("decideInventoryAction")).toBe(false);

    for (const ruleFile of ENGINE_RULE_FILES) {
      expect(fs.existsSync(path.join(ROOT, ruleFile))).toBe(true);
    }

    // PB1.a must not dirty M0.6/M7 rule sources (working tree vs HEAD).
    const dirty = execFileSync(
      "git",
      ["status", "--porcelain", "--", ...ENGINE_RULE_FILES, "lib/metrics"],
      { cwd: ROOT, encoding: "utf8" },
    ).trim();
    expect(dirty).toBe("");
  });

  it("is not wired into app routes, workers, or persistence adapters", () => {
    const roots = [
      path.join(ROOT, "app"),
      path.join(ROOT, "workers"),
      path.join(ROOT, "lib/persistence"),
      path.join(ROOT, "lib/demo"),
      path.join(ROOT, "lib/decision-brief"),
      path.join(ROOT, "lib/providers"),
      path.join(ROOT, "lib/canary"),
    ];

    const offenders: string[] = [];

    for (const root of roots) {
      for (const file of walkTsFiles(root)) {
        const text = fs.readFileSync(file, "utf8");
        if (
          text.includes("metric-decision-binding") ||
          text.includes("bindMetricToDecisionInput")
        ) {
          offenders.push(path.relative(ROOT, file));
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
