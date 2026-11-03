import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

import {
  demoActionShowsRecommendedQuantity,
  getM7DecisionDemoFixtureRoot,
} from "@/lib/demo/m7-decision-demo-fixtures";

const ROOT = process.cwd();

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

describe("M7.4e E3.3-R2.a compact merchant queue", () => {
  it("keeps fixture order and grounded REORDER quantity rules", () => {
    const root = getM7DecisionDemoFixtureRoot();
    const ids = root.actions.map((action) => action.id);

    expect(ids).toEqual([
      "demo-action-reorder-001",
      "demo-action-reduce-001",
      "demo-action-promote-001",
      "demo-action-watch-001",
      "demo-action-watch-stale-001",
    ]);

    for (const action of root.actions) {
      if (action.actionType === "REORDER") {
        expect(
          demoActionShowsRecommendedQuantity(action),
        ).toBe(true);
        expect(action.recommendedQuantity).toBeGreaterThan(0);
      } else {
        expect(
          demoActionShowsRecommendedQuantity(action),
        ).toBe(false);
      }
    }

    expect(root.healthySkim.length).toBeGreaterThan(0);
  });

  it("encodes compact queue hierarchy: priority → action → product → qty/why/watch", () => {
    const workspace = read(
      "components/actions-demo/actions-demo-workspace.tsx",
    );

    const rowStart = workspace.indexOf("function ActionRow(");
    expect(rowStart).toBeGreaterThan(-1);
    const rowSlice = workspace.slice(rowStart);

    expect(rowSlice).toContain('data-actions-queue-row="true"');
    expect(rowSlice).toContain("min-h-11");
    expect(rowSlice).toContain("PriorityBadge");
    expect(rowSlice).toContain("ActionTypeChip");
    expect(rowSlice).toContain("ConfidenceBadge");
    expect(rowSlice).toContain('data-actions-queue-qty="true"');
    expect(rowSlice).toContain('data-actions-queue-watch="true"');
    expect(rowSlice).toContain("Incomplete evidence — watch only");
    expect(rowSlice).toContain("demoActionShowsRecommendedQuantity");
    expect(rowSlice).toContain("line-clamp-2");

    // Priority precedes action type in the row markup.
    const priorityIndex = rowSlice.indexOf("<PriorityBadge");
    const typeIndex = rowSlice.indexOf("<ActionTypeChip");
    const qtyIndex = rowSlice.indexOf('data-actions-queue-qty="true"');
    const watchIndex = rowSlice.indexOf('data-actions-queue-watch="true"');
    const whyIndex = rowSlice.indexOf("action.conciseReason");

    expect(priorityIndex).toBeGreaterThan(-1);
    expect(typeIndex).toBeGreaterThan(priorityIndex);
    expect(qtyIndex).toBeGreaterThan(typeIndex);
    expect(watchIndex).toBeGreaterThan(qtyIndex);
    expect(whyIndex).toBeGreaterThan(qtyIndex);

    // No search/sort/micro-evidence in R2.a.
    expect(workspace).not.toContain("QueueTools");
    expect(workspace).not.toContain("searchQuery");
    expect(workspace).not.toContain("sortKey");
    expect(workspace).not.toContain("micro-evidence");
  });

  it("tightens queue density without regressing split / stack / sheet contracts", () => {
    const workspace = read(
      "components/actions-demo/actions-demo-workspace.tsx",
    );

    expect(workspace).toContain('data-actions-decision-queue="true"');
    expect(workspace).toContain('data-actions-healthy-skim="true"');
    expect(workspace).toContain("space-y-2");
    expect(workspace).toContain(
      "xl:grid-cols-[minmax(18rem,0.42fr)_minmax(0,0.58fr)]",
    );
    expect(workspace).toContain("(min-width: 1280px)");
    expect(workspace).toContain("(min-width: 768px)");
    expect(workspace).toContain("tabletInspectorRef");
    expect(workspace).toContain('heightMode="flow"');
    expect(workspace).toContain('heightMode="contained"');
    expect(workspace).toContain('role="dialog"');
    expect(workspace).toContain("md:hidden");
  });

  it("preserves R1 scroll owner, banner clearance, sheet a11y, and filter swipe", () => {
    const workspace = read(
      "components/actions-demo/actions-demo-workspace.tsx",
    );
    const banner = read(
      "components/actions-demo/demo-data-banner.tsx",
    );
    const panel = read(
      "components/actions-demo/decision-brief-panel.tsx",
    );

    expect(banner).toContain('data-actions-synthetic-banner="true"');
    expect(banner).toContain("lg:top-0");
    expect(banner).toContain("lg:z-20");

    expect(workspace).toContain('data-actions-inspector-shell="true"');
    expect(workspace).toContain("top-[4.25rem]");
    expect(workspace).toContain("h-[calc(100dvh-5rem)]");
    expect(workspace).toContain("briefScroll.scrollTop = 0");
    expect(workspace).toContain('data-actions-brief-scroll="true"');
    expect(workspace).toContain('data-actions-sheet-scroll="true"');
    expect(workspace).toContain('event.key === "Escape"');
    expect(workspace).toContain("row?.focus()");
    expect(workspace).toContain("Swipe for more");
    expect(workspace).toContain('data-actions-filter-scroll="true"');
    expect(workspace).toContain("min-h-11");

    expect(panel).toContain('data-actions-brief-scroll="true"');
    expect(panel).toContain("<DemoApprovalCluster");
    expect(panel).toContain("Technical details");
  });

  it("keeps HEALTHY skim-only and filter chip membership contract in source", () => {
    const workspace = read(
      "components/actions-demo/actions-demo-workspace.tsx",
    );

    expect(workspace).toContain('key: "HEALTHY"');
    expect(workspace).toContain("Healthy — no intervention");
    expect(workspace).toContain(
      "Healthy items are not inventory actions and cannot be approved.",
    );
    expect(workspace).toContain("setSelectedId(null)");
    expect(workspace).toContain("ALL: dataset.actions.length");
    expect(workspace).toContain(
      'REORDER: countType(dataset.actions, "REORDER")',
    );
    expect(workspace).toContain(
      "HEALTHY: dataset.healthySkim.length",
    );
  });
});
