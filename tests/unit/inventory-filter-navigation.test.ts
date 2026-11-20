import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  inventoryFilterHref,
} from "@/lib/inventory-intelligence/attention";
import {
  buildInventoryFilterQuery,
  inventoryFilterPath,
  resolveInspectorSelectionAfterFilter,
  resolveInventoryFilterFromSearch,
} from "@/lib/inventory-intelligence/filter-navigation";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("Inventory filter navigation (UX-INV-1b.3/1b.5)", () => {
  it("builds one-click filter query transitions without dropping unrelated params", () => {
    expect(buildInventoryFilterQuery("", "all")).toBe("");
    expect(buildInventoryFilterQuery("filter=out_of_stock", "all")).toBe("");
    expect(buildInventoryFilterQuery("", "out_of_stock")).toBe(
      "filter=out_of_stock",
    );
    expect(
      buildInventoryFilterQuery("utm=keep&filter=low_cover", "needs_attention"),
    ).toBe("utm=keep&filter=needs_attention");
    expect(buildInventoryFilterQuery("utm=keep&filter=low_cover", "all")).toBe(
      "utm=keep",
    );

    expect(
      inventoryFilterPath("/app/org/inventory", "filter=out_of_stock", "all"),
    ).toBe("/app/org/inventory");
    expect(
      inventoryFilterPath("/app/org/inventory", "utm=1", "pending_or_stale"),
    ).toBe("/app/org/inventory?utm=1&filter=pending_or_stale");
  });

  it("resolves filters from search for reload, Back/Forward and invalid values", () => {
    expect(resolveInventoryFilterFromSearch("filter=out_of_stock")).toBe(
      "out_of_stock",
    );
    expect(resolveInventoryFilterFromSearch("?filter=out_of_stock")).toBe(
      "out_of_stock",
    );
    expect(resolveInventoryFilterFromSearch("utm=1")).toBe("all");
    expect(resolveInventoryFilterFromSearch("filter=bogus")).toBe("all");
    expect(
      resolveInventoryFilterFromSearch("filter=bogus", "needs_attention"),
    ).toBe("needs_attention");
    expect(
      resolveInventoryFilterFromSearch(
        "utm=keep&filter=limited_history",
        "all",
      ),
    ).toBe("limited_history");
  });

  it("keeps Overview deep-link hash while in-page chips sync history without soft-nav", () => {
    expect(inventoryFilterHref("org", "out_of_stock")).toContain(
      "#inventory-evidence",
    );
    expect(inventoryFilterHref("org", "all")).toBe(
      "/app/org/inventory#inventory-evidence",
    );

    const workspace = read(
      "components/inventory/inventory-intelligence-workspace.tsx",
    );
    expect(workspace).toContain("inventoryFilterPath");
    expect(workspace).toContain("setFilterState(next)");
    expect(workspace).toContain("window.history.pushState");
    expect(workspace).toContain('addEventListener("popstate"');
    expect(workspace).toContain("resolveInventoryFilterFromSearch");
    expect(workspace).toContain("resolveInspectorSelectionAfterFilter");
    expect(workspace).not.toContain("useSearchParams");
    expect(workspace).not.toContain("useRouter");
    expect(workspace).not.toContain("router.push");
    expect(workspace).not.toContain("optimisticFilter");
    expect(workspace).not.toContain("baselineUrlFilter");
    expect(workspace).not.toContain("sa-sku-attention-fade");
  });

  it("closes inspector selection when the SKU leaves the filtered result set", () => {
    expect(
      resolveInspectorSelectionAfterFilter("keep", ["keep", "other"]),
    ).toBe("keep");
    expect(
      resolveInspectorSelectionAfterFilter("gone", ["keep", "other"]),
    ).toBeNull();
    expect(resolveInspectorSelectionAfterFilter(null, ["keep"])).toBeNull();
    expect(
      resolveInspectorSelectionAfterFilter("keep", new Set(["keep"])),
    ).toBe("keep");
  });

  it("keeps Inventory section order stable so All never remounts Decision Readiness first", () => {
    const page = read("app/(app)/app/[organizationId]/inventory/page.tsx");
    const evidenceIdx = page.indexOf('data-inventory-evidence="true"');
    const readinessIdx = page.indexOf("<DecisionReadinessPanel");
    expect(evidenceIdx).toBeGreaterThan(-1);
    expect(readinessIdx).toBeGreaterThan(evidenceIdx);
    expect(page).toContain("id={INVENTORY_EVIDENCE_ANCHOR}");
    expect(page).toContain("scroll-mt-24");
    expect(page).toContain("attentionDeepLink");
    expect(page).toContain("data-attention-deep-link");
    expect(page).not.toMatch(
      /attentionDeepLink\s*\?\s*\(\s*<>\s*\{evidenceSection\}/,
    );
    expect(page).not.toContain("{readinessSections}");
    expect(page).not.toContain("{evidenceSection}");
  });

  it("avoids Suspense loading flash and uses one authoritative filter state", () => {
    const page = read("app/(app)/app/[organizationId]/inventory/page.tsx");
    const workspace = read(
      "components/inventory/inventory-intelligence-workspace.tsx",
    );

    expect(page).not.toContain("Suspense");
    expect(page).not.toContain("Loading SKU attention");
    expect(page).not.toContain("data-inventory-filter-suspense");
    expect(workspace).toContain(
      "useState<InventoryIntelligenceFilter>(initialFilter)",
    );
    expect(workspace).toContain("if (next === filter)");
    expect(workspace).toContain("data-inventory-visible-count");
    expect(workspace).toContain("data-inventory-filter-notice");
    // Chip active state + rows share the same `filter` binding.
    expect(workspace).toMatch(/active=\{filter === item\.id\}/);
    expect(workspace).toContain("filterIntelligenceRows(rows, filter)");
  });
});
