import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

const ROOT = process.cwd();
const FILE = "lib/persistence/persist-inventory-action.ts";

function source(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
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
      files.push(...walkTsFiles(full));
      continue;
    }
    if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      files.push(full);
    }
  }

  return files;
}

describe("M7.2c dormant inventory action persist adapter architecture", () => {
  it("is server-only and writes only through the inventory action persist RPC", () => {
    const text = source(FILE);

    expect(text.startsWith('import "server-only"')).toBe(true);
    expect(text).toContain(
      'const RPC_NAME = "persist_inventory_action_recommendation"',
    );
    expect(text).toContain("client.rpc(RPC_NAME");
    expect(text).not.toMatch(/\.from\(/);
    expect(text).not.toMatch(
      /\.(select|insert|update|delete)\(\s*['"`]/,
    );
    expect(text).not.toContain(".from(\"inventory_actions");
    expect(text).toContain("m7_persistence_contract_harness_v1");
    expect(text).toContain("PRODUCTION_SOURCE_OF_CREATE_UNAVAILABLE");
    expect(text).toContain("FIXTURE_EVIDENCE_REJECTED");
  });

  it("requires trusted TenantContext grain and forbids client org overrides", () => {
    const text = source(FILE);

    expect(text).toContain("TenantContext");
    expect(text).toContain("FORBIDDEN_INPUT_KEYS");
    expect(text).toContain('"organizationId"');
    expect(text).toContain('"storeId"');
    expect(text).toContain('"fixtureAttestation"');
    expect(text).toContain('"claimsMerchantFacing"');
    expect(text).toContain('"forecastRunId"');
    expect(text).toContain("requires a trusted TenantContext");
    expect(text).toContain("requires an authorized store on TenantContext");
  });

  it("never imports fixture evaluation or invents production source-of-create", () => {
    const text = source(FILE);
    const importLines = text
      .split("\n")
      .filter((line) => /^\s*import\b/.test(line))
      .join("\n");

    expect(importLines).not.toContain("fixture-evaluation");
    expect(importLines).not.toContain("evaluateFixtureInventoryDecision");
    expect(importLines).not.toContain("decideInventoryAction");
    expect(importLines).not.toContain("inventory-math");
    expect(importLines).not.toContain("load-forecast-sku-demand");
    expect(importLines).not.toContain("publish-forecast");
    expect(text).not.toContain("m7-controlled-local-fixture-v1");
    expect(text).toContain("forecastRunId: null");
    expect(text).toContain("claimsMerchantFacing: false");
    expect(text).toContain("claimsM7ProductionEligibility: false");
    expect(text).toContain("sha256");
  });

  it("is not wired into app routes, workers, cron, or commerce adapters", () => {
    const roots = [
      path.join(ROOT, "app"),
      path.join(ROOT, "lib/providers"),
      path.join(ROOT, "lib/canary"),
    ];

    const offenders: string[] = [];

    for (const root of roots) {
      for (const file of walkTsFiles(root)) {
        const text = fs.readFileSync(file, "utf8");
        if (
          text.includes("persist-inventory-action") ||
          text.includes("persistInventoryActionRecommendation")
        ) {
          offenders.push(path.relative(ROOT, file));
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
