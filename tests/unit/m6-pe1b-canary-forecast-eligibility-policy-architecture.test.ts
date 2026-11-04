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
  "lib/decision-engine/canary-forecast-eligibility-policy.ts";
const PE1A_MODULE_FILE =
  "lib/decision-engine/published-forecast-eligibility.ts";

const FORBIDDEN_SPECIFIER_FRAGMENTS = [
  "lib/persistence",
  "lib/supabase",
  "lib/decision-brief",
  "lib/demo",
  "persist-inventory-action",
  "fixture-evaluation",
  "/decide",
  "./decide",
  "openai",
  "@ai-sdk",
  "workers/",
  "app/",
  "@supabase/supabase-js",
  "@supabase/ssr",
  "metric-decision-binding",
  "metric-decision-diagnostic",
  "publish-forecast",
  "persist-forecast",
  "read-fresh-published",
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
  "m7Eligible: true",
  "productionAttestationActive: true",
  'forecastEligibility: "eligible"',
  'forecastEligibility: "fixture_synthetic"',
  "m7_eligible = true",
  "m7_eligible: true",
  'decisionState: "production_eligible"',
  'decisionState: "production_eligible" as',
] as const;

const ENGINE_RULE_FILES = [
  "lib/decision-engine/reorder-rule.ts",
  "lib/decision-engine/reduce-rule.ts",
  "lib/decision-engine/promote-rule.ts",
  "lib/decision-engine/watch-healthy-rule.ts",
  "lib/decision-engine/conflict-resolution.ts",
  "lib/decision-engine/confidence.ts",
  "lib/decision-engine/priority.ts",
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

describe("M6-PE1.b.1 canary-forecast-eligibility-policy architecture", () => {
  it("stays pure offline: no persistence, supabase, decide, publish, or UI imports", () => {
    const text = source(MODULE_FILE);
    const specifiers = importSpecifiers(text);

    for (const fragment of FORBIDDEN_SPECIFIER_FRAGMENTS) {
      expect(
        specifiers.some((specifier) => specifier.includes(fragment)),
        `must not import specifier containing ${fragment}`,
      ).toBe(false);
    }

    const executable = text
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(executable.includes("decideInventoryAction")).toBe(false);
    expect(executable.includes("evaluateFixtureInventoryDecision")).toBe(
      false,
    );
    expect(executable.includes("createSupabaseAdminClient")).toBe(false);
    expect(executable.includes("server-only")).toBe(false);
    expect(executable.includes("publish_sku_forecast")).toBe(false);
    expect(executable.includes("readFreshPublishedSkuForecast")).toBe(false);
    expect(text).toContain('forecastEligibility: "ineligible"');
    expect(text).toContain("m7Eligible: false");
    expect(text).toContain("M6_PRODUCTION_FORECAST_ELIGIBILITY_APPROVED");
    expect(text).toContain("isPe1aTrustedPublishedForecastBindingSuccess");
    expect(text).toContain("fresh_reader_shaped_structural_only");
    expect(text).toContain("productionEligibilityAttestation");
    expect(text).toContain("ineligible_production_unapproved");
    expect(text).toContain("ineligible_age_unapproved");
    expect(text).toContain("ineligible_algorithm_unapproved");
    expect(text).toContain("AGE_POLICY_NOT_APPROVED");
    expect(text).toContain("ALGORITHM_PIN_MISS");
    expect(text).toContain("selectTechnicalIneligibleState");
  });

  it("never sets production/merchant/m7 eligibility true or emits production_eligible", () => {
    const text = source(MODULE_FILE);

    for (const literal of FORBIDDEN_TRUE_ELIGIBILITY) {
      expect(text.includes(literal), `must not contain ${literal}`).toBe(
        false,
      );
    }

    // production_eligible may appear only as an excluded/forbidden type member
    // or defensive string compare — never as an emitted success decisionState.
    expect(text).toContain('Exclude<Pe1bDecisionState, "production_eligible">');
    expect(text).toContain("productionDecisionCreationEligible: false");
    expect(text).toContain("productionApprovalEligible: false");
    expect(text).toContain("productionAttestationActive: false");
    expect(text).toContain("forecastExpectedDemandUnits: null");
    expect(text).toContain('forecastConfidence: "low"');
    expect(text).toContain('forecastAgePolicy: "unapproved"');
    expect(text).toContain('algorithmPinPolicy: "unapproved"');
  });

  it("does not dirty PE1.a, PB1, frozen decision-rule, or forecasting math sources", () => {
    for (const ruleFile of ENGINE_RULE_FILES) {
      expect(fs.existsSync(path.join(ROOT, ruleFile))).toBe(true);
    }

    const dirty = execFileSync(
      "git",
      [
        "status",
        "--porcelain",
        "--",
        ...ENGINE_RULE_FILES,
        PE1A_MODULE_FILE,
        "lib/decision-engine/metric-decision-binding.ts",
        "lib/decision-engine/metric-decision-diagnostic.ts",
        "lib/forecasting",
        "lib/persistence/publish-forecast-sku-demand.ts",
        "lib/persistence/read-fresh-published-sku-forecast.ts",
        "lib/persistence/persist-forecast-sku-demand.ts",
        "supabase/migrations",
      ],
      { cwd: ROOT, encoding: "utf8" },
    ).trim();
    expect(dirty).toBe("");
  });

  it("is not wired into app routes, workers, persistence, demo, or brief surfaces", () => {
    const roots = [
      path.join(ROOT, "app"),
      path.join(ROOT, "workers"),
      path.join(ROOT, "lib/persistence"),
      path.join(ROOT, "lib/demo"),
      path.join(ROOT, "lib/decision-brief"),
      path.join(ROOT, "lib/providers"),
      path.join(ROOT, "lib/canary"),
    ];

    const needles = [
      "canary-forecast-eligibility-policy",
      "evaluateCanaryForecastEligibilityPolicy",
    ];
    for (const root of roots) {
      for (const file of walkTsFiles(root)) {
        const text = fs.readFileSync(file, "utf8");
        for (const needle of needles) {
          expect(
            text.includes(needle),
            `${path.relative(ROOT, file)} must not import PE1.b policy`,
          ).toBe(false);
        }
      }
    }
  });

  it("imports PE1.a binder types/gates only and preserves hard-false create gates", () => {
    const text = source(MODULE_FILE);
    const specifiers = importSpecifiers(text);

    expect(
      specifiers.some((specifier) =>
        specifier.includes("published-forecast-eligibility"),
      ),
    ).toBe(true);
    expect(text).toContain("isPe1aTrustedPublishedForecastBindingSuccess");
    expect(text).toContain("M6_PRODUCTION_FORECAST_ELIGIBILITY_APPROVED");
    expect(text).toContain("TRUSTED_INCOMING_EVIDENCE_AVAILABLE");
    expect(text).toContain("TRUSTED_M5_SOURCE_OF_CREATE_WRITER_APPROVED");
    expect(text).toContain("M7_3_MERCHANT_APPROVABLE_PREDICATE_APPROVED");
    expect(text).toContain("Never upgrade");
  });
});
