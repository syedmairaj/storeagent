import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

const ROOT = process.cwd();
const DIAGNOSTIC_FILE =
  "lib/decision-engine/metric-decision-diagnostic.ts";
const BINDING_FILE = "lib/decision-engine/metric-decision-binding.ts";

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
  "openai",
  "@ai-sdk",
  "workers/",
  "app/",
  "@supabase/supabase-js",
  "@supabase/ssr",
  "createClient",
  "next/server",
  "next/headers",
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

const ALLOWED_SPECIFIER_FRAGMENTS = [
  "./decide",
  "./evidence-snapshot",
  "./metric-decision-binding",
  "./reproducibility",
  "./types",
  "commerce-domain",
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

describe("M7-PB1.b metric-decision-diagnostic architecture", () => {
  it("allows decide/evidence/binding only and forbids DB/HTTP/UI/AI/persist/lifecycle", () => {
    const text = source(DIAGNOSTIC_FILE);
    const specifiers = importSpecifiers(text);
    const joined = specifiers.join("\n");

    for (const fragment of FORBIDDEN_SPECIFIER_FRAGMENTS) {
      expect(
        specifiers.some((specifier) => specifier.includes(fragment)),
        `must not import specifier containing ${fragment}`,
      ).toBe(false);
    }

    expect(text.includes("evaluateFixtureInventoryDecision")).toBe(false);
    expect(text.includes("persistInventoryAction")).toBe(false);
    expect(text.includes("inventory_action_is_merchant_approvable")).toBe(
      false,
    );

    for (const allowed of ALLOWED_SPECIFIER_FRAGMENTS) {
      expect(joined).toContain(allowed);
    }

    expect(text).toContain("decideInventoryAction");
    expect(text).toContain("buildInventoryActionEvidence");
    expect(text).toContain("isPb1TrustedMetricBindingSuccess");
    expect(text).toContain("bindMetricToDecisionInput");
  });

  it("never sets production/merchant eligibility true", () => {
    const text = source(DIAGNOSTIC_FILE);

    for (const literal of FORBIDDEN_TRUE_ELIGIBILITY) {
      expect(text.includes(literal), `must not contain ${literal}`).toBe(
        false,
      );
    }

    expect(text).toContain("productionApprovalEligible: false");
    expect(text).toContain("productionDecisionCreationEligible: false");
    expect(text).toContain('forecastEligibility: "ineligible"');
  });

  it("leaves engine rule math files untouched and does not import fixture evaluation", () => {
    const text = source(DIAGNOSTIC_FILE);
    const specifiers = importSpecifiers(text);

    expect(specifiers.some((s) => s.includes("fixture-evaluation"))).toBe(
      false,
    );
    expect(text.includes("evaluateFixtureInventoryDecision")).toBe(false);

    for (const ruleFile of ENGINE_RULE_FILES) {
      expect(fs.existsSync(path.join(ROOT, ruleFile))).toBe(true);
    }

    const dirty = execFileSync(
      "git",
      ["status", "--porcelain", "--", ...ENGINE_RULE_FILES, "lib/metrics"],
      { cwd: ROOT, encoding: "utf8" },
    ).trim();
    expect(dirty).toBe("");
  });

  it("keeps PB1.a mapper free of decide/engine orchestration imports", () => {
    const text = source(BINDING_FILE);
    const specifiers = importSpecifiers(text);

    expect(
      specifiers.some((s) => s.endsWith("/decide") || s === "./decide"),
    ).toBe(false);
    expect(
      specifiers.some(
        (s) => s.endsWith("/evidence-snapshot") || s === "./evidence-snapshot",
      ),
    ).toBe(false);
    expect(text.includes("decideInventoryAction")).toBe(false);
    expect(text.includes("buildInventoryActionEvidence")).toBe(false);
    expect(text.includes("mintTrustedBindingSuccess")).toBe(true);
    expect(text.includes("isPb1TrustedMetricBindingSuccess")).toBe(true);
  });

  it("is not wired into Actions UI, API routes, workers, or persistence", () => {
    const roots = [
      path.join(ROOT, "app"),
      path.join(ROOT, "workers"),
      path.join(ROOT, "lib/persistence"),
      path.join(ROOT, "lib/demo"),
      path.join(ROOT, "lib/decision-brief"),
      path.join(ROOT, "lib/providers"),
      path.join(ROOT, "lib/canary"),
      path.join(ROOT, "components"),
    ];

    const markers = [
      "metric-decision-diagnostic",
      "evaluatePb1OfflineDiagnosticDecision",
      "evaluatePb1OfflineDiagnosticFromBindingRequest",
      "metric-decision-binding",
      "bindMetricToDecisionInput",
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
