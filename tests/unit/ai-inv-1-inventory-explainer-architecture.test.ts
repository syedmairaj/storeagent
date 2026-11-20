import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

const PROVIDER_FRAGMENTS = [
  "openai",
  "@anthropic",
  "@google/generative-ai",
  "anthropic",
  "generativelanguage.googleapis",
  "api.openai.com",
] as const;

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

function listSourceFiles(relativeRoot: string): string[] {
  const absolute = path.join(ROOT, relativeRoot);
  if (!fs.existsSync(absolute)) {
    return [];
  }
  const out: string[] = [];
  function walk(dir: string): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name));
        continue;
      }
      if (!SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
        continue;
      }
      out.push(path.relative(ROOT, path.join(dir, entry.name)));
    }
  }
  walk(absolute);
  return out.sort();
}

describe("AI-INV-1 inventory explainer architecture", () => {
  it("keeps inventory explainer offline — no live provider SDKs", () => {
    const files = [
      ...listSourceFiles("lib/inventory-explainer"),
      "components/inventory/sku-explainer-panel.tsx",
    ];
    for (const file of files) {
      const source = read(file);
      for (const fragment of PROVIDER_FRAGMENTS) {
        expect(source.toLowerCase()).not.toContain(fragment.toLowerCase());
      }
      expect(source).not.toContain("supportsLiveNetwork: true");
      expect(source).not.toContain('adapterId: "live_provider"');
    }
  });

  it("separates inventory explainer enablement from Actions AI flags", () => {
    const enablement = read("lib/inventory-explainer/server-enablement.ts");
    expect(enablement).toContain("STOREAGENT_INVENTORY_EXPLAINER_ENABLED");
    expect(enablement).toContain("STOREAGENT_INVENTORY_EXPLAINER_ORG_ALLOWLIST");
    expect(enablement).not.toContain("STOREAGENT_AI_EXPLANATION_ENABLED");

    const envExample = read(".env.example");
    expect(envExample).toContain("STOREAGENT_INVENTORY_EXPLAINER_ENABLED");
  });

  it("binds questions through a server action with membership + inventory.read", () => {
    const actions = read("lib/inventory-explainer/actions.ts");
    expect(actions).toContain('"use server"');
    expect(actions).toContain("requireAppIdentity");
    expect(actions).toContain("resolveServerOrganizationContext");
    expect(actions).toContain('inventory.read');
    expect(actions).toContain("loadMerchantInventoryIntelligence");
    expect(actions).toContain("buildInventoryExplainerEvidence");
    expect(actions).toContain("INVALID_QUESTION");
    expect(actions).toContain("UNAUTHORIZED");
    expect(actions).toContain("PERMISSION_DENIED");
    expect(actions).toContain("TENANT_SCOPE_MISMATCH");
    expect(actions).toContain("GRAIN_NOT_FOUND");
    expect(actions).toContain("isInventoryExplainerQuestionId");
    expect(actions).toContain("UUID_RE");
    expect(actions).not.toContain("decideInventoryAction");
    expect(actions).not.toContain("createInventoryAction");
  });

  it("attaches contextual questions to the SKU inspector (not a free chatbot)", () => {
    const inspector = read(
      "components/inventory/sku-intelligence-inspector.tsx",
    );
    const panel = read("components/inventory/sku-explainer-panel.tsx");

    expect(inspector).toContain("SkuExplainerPanel");
    expect(panel).toContain('data-inspector-section="explainer"');
    expect(panel).toContain('data-sku-explainer="true"');
    expect(panel).toContain("rankInventoryExplainerQuestions");
    expect(panel).toContain("classifyGuidanceSituation");
    expect(panel).toContain("data-sku-explainer-primary");
    expect(panel).toContain("explainInventorySkuAction");
    expect(panel).not.toContain("textarea");
    expect(panel).not.toContain("contenteditable");
    expect(panel).not.toContain("fetch(");
  });

  it("does not unlock M6/M7 create, workers, or formula changes", () => {
    const files = listSourceFiles("lib/inventory-explainer");
    for (const file of files) {
      const source = read(file);
      expect(source).not.toContain("PRODUCTION_SOURCE_OF_CREATE");
      expect(source).not.toContain("METRIC_RECOMPUTE_WORKER_ENABLED");
      expect(source).not.toContain("calculateSafetyStock(");
      expect(source).not.toContain("calculateReorderPoint(");
    }
  });

  it("documents the AI-INV-1 contract", () => {
    const contract = read("docs/AI_INV_1_GROUNDED_INVENTORY_EXPLAINER_CONTRACT.md");
    expect(contract).toContain("AI-INV-1");
    expect(contract).toContain("unknown ≠ zero");
    expect(contract).toContain("Deterministic");
  });
});
