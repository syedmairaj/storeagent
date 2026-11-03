import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

const ROOT = process.cwd();

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

describe("M7.4e E3.3-R2.d premium visual polish", () => {
  it("adds sheet and inline chrome modes without changing decision truth paths", () => {
    const panel = read(
      "components/actions-demo/decision-brief-panel.tsx",
    );
    const workspace = read(
      "components/actions-demo/actions-demo-workspace.tsx",
    );

    expect(panel).toContain('chrome?: DecisionBriefChrome');
    expect(panel).toContain('"standard"');
    expect(panel).toContain('"sheet"');
    expect(panel).toContain('"inline"');
    expect(panel).toContain('data-actions-brief-chrome={chrome}');
    expect(panel).toContain("composeDemoDecisionBrief");
    expect(panel).not.toContain("openai");
    expect(panel).not.toContain("transition_inventory_action_merchant");

    expect(workspace).toContain('chrome="sheet"');
    expect(workspace).toContain('chrome="inline"');
    expect(workspace).toContain('data-actions-inline-brief="true"');
    expect(workspace).toContain('data-actions-sheet-header="true"');
  });

  it("improves mobile sheet header composition and keeps ≥44px close target", () => {
    const workspace = read(
      "components/actions-demo/actions-demo-workspace.tsx",
    );
    const sheetStart = workspace.indexOf(
      "function ActionDetailSheet(",
    );
    expect(sheetStart).toBeGreaterThan(-1);
    const sheet = workspace.slice(sheetStart);

    expect(sheet).toContain('data-actions-sheet-header="true"');
    expect(sheet).toContain("Decision brief");
    expect(sheet).toContain("action.productTitle");
    expect(sheet).toContain("action.variantTitle");
    expect(sheet).toContain("size-11");
    expect(sheet).toContain('aria-label="Close decision detail"');
    expect(sheet).toContain(
      "Synthetic demonstration data — not live inventory",
    );
    expect(sheet).toContain('data-actions-sheet-scroll="true"');
    expect(sheet).toContain('heightMode="flow"');
    expect(sheet).toContain('chrome="sheet"');
    expect(sheet).toContain('event.key === "Escape"');
  });

  it("reduces tablet/laptop duplicate decision chrome under selected queue row", () => {
    const panel = read(
      "components/actions-demo/decision-brief-panel.tsx",
    );
    const workspace = read(
      "components/actions-demo/actions-demo-workspace.tsx",
    );

    expect(workspace).toContain('chrome="inline"');
    expect(workspace).toContain("isTabletStack");
    expect(panel).toContain("!isInline");
    expect(panel).toContain(
      "selected queue row already shows them",
    );
    // Inline still keeps product confirmation + generator provenance.
    expect(panel).toContain("brief.recommendation.productTitle");
    expect(panel).toContain(
      'data-actions-brief-provenance="generator"',
    );
  });

  it("preserves R1 scroll owners, desktop contained brief, and R2.a queue density", () => {
    const workspace = read(
      "components/actions-demo/actions-demo-workspace.tsx",
    );
    const panel = read(
      "components/actions-demo/decision-brief-panel.tsx",
    );

    expect(workspace).toContain('data-actions-brief-scroll="true"');
    expect(workspace).toContain('data-actions-sheet-scroll="true"');
    expect(workspace).toContain("top-[4.25rem]");
    expect(workspace).toContain("briefScroll.scrollTop = 0");
    expect(workspace).toContain('heightMode="contained"');
    expect(workspace).toContain("space-y-2");
    expect(workspace).toContain(
      "xl:grid-cols-[minmax(18rem,0.42fr)_minmax(0,0.58fr)]",
    );
    expect(workspace).not.toContain("QueueTools");
    expect(workspace).not.toContain("searchQuery");
    expect(panel).toContain('data-actions-brief-scroll="true"');
    expect(panel).toContain("<DemoApprovalCluster");
    expect(panel).toContain("Technical details");
    expect(panel).toContain(
      'data-actions-brief-watch="uncertainty-first"',
    );
  });

  it("disables Next.js Dev Tools indicator for cleaner local screenshot review", () => {
    const config = read("next.config.ts");
    expect(config).toContain("devIndicators: false");
  });
});
