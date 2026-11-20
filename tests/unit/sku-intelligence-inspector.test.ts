import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { buildSkuEvidence } from "@/lib/inventory-intelligence/sku-attention-presentation";
import type { MerchantInventoryIntelligenceRow } from "@/lib/inventory-intelligence/types";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function row(
  overrides: Partial<MerchantInventoryIntelligenceRow> & {
    grainKey: string;
    coverStatus: MerchantInventoryIntelligenceRow["coverStatus"];
  },
): MerchantInventoryIntelligenceRow {
  return {
    snapshotId: "s",
    organizationId: "o",
    storeId: "st",
    locationId: "l",
    variantId: "v",
    sku: overrides.sku ?? overrides.grainKey,
    productTitle: "Product",
    storeName: "snapstore",
    locationName: "Main",
    availableQuantity: 10,
    onHandQuantity: 10,
    observedAt: "2026-11-18T12:00:00.000Z",
    asOfMetricDate: "2026-11-20",
    metricDate: "2026-11-18",
    salesVelocity30d: 1,
    salesVelocity30dReasonCode: null,
    eligibleDays30d: 4,
    coverageRatio30d: null,
    daysOfStock: null,
    daysOfStockReasonCode: null,
    safetyStock: null,
    safetyStockReasonCode: null,
    reorderPoint: null,
    reorderPointReasonCode: null,
    targetStock: null,
    targetStockReasonCode: null,
    evidenceLabel: "x",
    ...overrides,
  };
}

describe("SKU intelligence inspector (UX-INV-1b.2)", () => {
  it("wires a Base UI dialog inspector with focus return and Escape-capable close", () => {
    const inspector = read(
      "components/inventory/sku-intelligence-inspector.tsx",
    );
    const workspace = read(
      "components/inventory/inventory-intelligence-workspace.tsx",
    );

    expect(inspector).toContain('from "@base-ui/react/dialog"');
    expect(inspector).toContain("Dialog.Root");
    expect(inspector).toContain("modal");
    expect(inspector).toContain("Dialog.Title");
    expect(inspector).toContain("Dialog.Close");
    expect(inspector).toContain("returnFocusRef");
    expect(inspector).toContain("queueMicrotask");
    expect(inspector).toContain('data-sku-inspector="true"');
    expect(inspector).toContain("data-sku-inspector-scroll");
    expect(inspector).toContain("md:right-0");
    expect(inspector).toContain("inset-0");
    expect(inspector).not.toContain("decideInventoryAction");
    expect(inspector).not.toContain("confidence");
    expect(inspector).not.toContain("profit");

    expect(workspace).toContain("SkuIntelligenceInspector");
    expect(workspace).toContain("openInspector");
    expect(workspace).toContain("selectedGrainKey");
    expect(workspace).toContain("resolveInspectorSelectionAfterFilter");
    expect(workspace).toContain('aria-haspopup="dialog"');
    expect(workspace).not.toContain("EvidenceDisclosure");
  });

  it("puts stock condition and next step first, then explainer, facts and provenance", () => {
    const inspector = read(
      "components/inventory/sku-intelligence-inspector.tsx",
    );
    const stockIdx = inspector.indexOf('data-inspector-section="stock"');
    const nextIdx = inspector.indexOf('data-inspector-section="next"');
    const explainerIdx = inspector.indexOf("<SkuExplainerPanel");
    const factsIdx = inspector.indexOf('data-inspector-section="facts"');
    const provenanceIdx = inspector.indexOf(
      'data-inspector-section="provenance"',
    );
    expect(stockIdx).toBeGreaterThan(-1);
    expect(nextIdx).toBeGreaterThan(stockIdx);
    expect(explainerIdx).toBeGreaterThan(nextIdx);
    expect(factsIdx).toBeGreaterThan(explainerIdx);
    expect(provenanceIdx).toBeGreaterThan(factsIdx);
    expect(inspector).toContain("<details");
    expect(inspector).toContain("Metric provenance");
    expect(inspector).toContain("not buy quantities");
    expect(inspector).not.toContain('data-inspector-section="identity"');
    expect(inspector).not.toContain('data-inspector-section="interpretation"');
  });

  it("keeps selected SKU evidence identity and stale provenance correct", () => {
    const selected = row({
      grainKey: "st:loc:bag",
      sku: "BAG-TOTE",
      productTitle: "Canvas tote",
      coverStatus: "stale",
      availableQuantity: 0,
      salesVelocity30d: 1.25,
      eligibleDays30d: 4,
      metricDate: "2026-11-18",
      asOfMetricDate: "2026-11-20",
      safetyStock: 2,
      safetyStockReasonCode: null,
      reorderPoint: 5,
      reorderPointReasonCode: null,
      targetStock: 11,
      targetStockReasonCode: null,
    });

    const evidence = buildSkuEvidence(selected, {
      stockObservationsStale: true,
    });

    expect(evidence.identityLine).toBe(
      "BAG-TOTE · Canvas tote · snapstore / Main",
    );
    expect(evidence.facts.find((f) => f.id === "available")?.value).toMatch(
      /Last recorded 0 on/,
    );
    expect(evidence.facts.find((f) => f.id === "provenance")?.value).toContain(
      "metric 2026-11-18",
    );
    expect(evidence.facts.find((f) => f.id === "provenance")?.value).toContain(
      "store-local as-of 2026-11-20",
    );
    expect(evidence.facts.find((f) => f.id === "thresholds")?.label).toMatch(
      /Historical/,
    );
    expect(evidence.nextStep).toMatch(/Upload updated stock/i);
  });

  it("safe-closes without inventing commercial recommendations in inspector chrome", () => {
    const inspector = read(
      "components/inventory/sku-intelligence-inspector.tsx",
    );
    const presentation = read(
      "lib/inventory-intelligence/sku-attention-presentation.ts",
    );
    expect(inspector).toContain('aria-label="Close product inspector"');
    expect(inspector).toContain("onOpenChange");
    expect(inspector).toContain("decisionEligibilityLabel");
    expect(presentation).toContain(
      "Commercial recommendations stay unauthorized — not a REORDER / REDUCE / PROMOTE / WATCH queue.",
    );
    expect(inspector).not.toContain("Approve");
    expect(inspector).not.toContain("Purchase");
    expect(inspector).not.toContain("decideInventoryAction");
  });

  it("uses a single focus-visible ring on Inspect and Close without stacked outlines", () => {
    const inspector = read(
      "components/inventory/sku-intelligence-inspector.tsx",
    );
    const workspace = read(
      "components/inventory/inventory-intelligence-workspace.tsx",
    );

    const closeIdx = inspector.indexOf('data-sku-inspector-close="true"');
    expect(closeIdx).toBeGreaterThan(-1);
    const closeClassBlock = inspector.slice(
      inspector.lastIndexOf("className=", closeIdx),
      closeIdx,
    );
    expect(closeClassBlock).toContain("outline-none");
    expect(closeClassBlock).toContain("focus:outline-none");
    expect(closeClassBlock).toContain("focus-visible:ring-2");
    expect(closeClassBlock).toContain("focus-visible:ring-zinc-950");
    expect(closeClassBlock).toContain("focus-visible:ring-offset-2");
    expect(closeClassBlock).toContain("size-11");
    expect(closeClassBlock).not.toContain("focus-visible:outline-2");
    expect(closeClassBlock).not.toContain("focus-visible:outline-zinc-950");

    const inspectIdx = workspace.indexOf("data-sku-inspect={grainKey}");
    expect(inspectIdx).toBeGreaterThan(-1);
    const inspectClassBlock = workspace.slice(
      workspace.lastIndexOf("className=", inspectIdx),
      inspectIdx,
    );
    expect(inspectClassBlock).toContain("outline-none");
    expect(inspectClassBlock).toContain("focus:outline-none");
    expect(inspectClassBlock).toContain("focus-visible:ring-2");
    expect(inspectClassBlock).toContain("focus-visible:ring-zinc-950");
    expect(inspectClassBlock).toContain("min-h-11");
    expect(inspectClassBlock).toContain("min-w-11");
    expect(inspectClassBlock).not.toContain("focus-visible:outline-2");
    expect(inspectClassBlock).not.toContain("focus-visible:outline-zinc-950");
  });
});
