import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

import {
  explainDemoReasonCode,
} from "@/lib/demo/m7-decision-demo-format";

import {
  getM7DecisionDemoFixtureRoot,
} from "@/lib/demo/m7-decision-demo-fixtures";

const ROOT = process.cwd();

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

describe("M7.4d Actions UX accessibility and responsive gate", () => {
  it("keeps demo banner sticky below the mobile shell header", () => {
    const banner = read(
      "components/actions-demo/demo-data-banner.tsx",
    );
    const workspace = read(
      "components/actions-demo/actions-demo-workspace.tsx",
    );
    const page = read(
      "app/(app)/app/[organizationId]/actions/page.tsx",
    );

    expect(banner).toContain(
      "Synthetic demonstration data — not live inventory",
    );
    expect(banner).toContain('role="status"');
    expect(banner).toContain("sticky top-16");
    expect(banner).toContain("lg:top-0");
    expect(banner).toContain("lg:z-20");
    expect(banner).toContain("py-1.5");
    // R1: compact sm/lg padding so desktop inspector sticky top clears the banner.
    expect(banner).toContain("sm:py-2");
    expect(banner).toContain("lg:py-2.5");
    // Filter sticks under header+banner on <lg; static on desktop split.
    expect(workspace).toContain("top-[7.5rem]");
    expect(workspace).toContain("md:top-32");
    expect(workspace).toContain("lg:static");
    expect(page).not.toContain("-mt-2");
  });

  it("preserves sheet Esc, focus trap, restore focus, and reduced motion", () => {
    const workspace = read(
      "components/actions-demo/actions-demo-workspace.tsx",
    );

    expect(workspace).toContain('role="dialog"');
    expect(workspace).toContain('aria-modal="true"');
    expect(workspace).toContain('event.key === "Escape"');
    expect(workspace).toContain("tabIndex={-1}");
    expect(workspace).toContain("row?.focus()");
    expect(workspace).toContain("motion-reduce:animate-none");
    expect(workspace).toContain("motion-reduce:transition-none");
    expect(workspace).toContain(
      "Synthetic demonstration data — not live inventory",
    );
    expect(workspace).toContain("md:hidden");
    expect(workspace).toContain("env(safe-area-inset-bottom)");
  });

  it("keeps the mobile sheet as the sole scroll owner for flow inspector content", () => {
    const workspace = read(
      "components/actions-demo/actions-demo-workspace.tsx",
    );

    expect(workspace).toContain('data-actions-sheet-scroll="true"');
    expect(workspace).toContain("touch-pan-y");
    expect(workspace).toContain("heightMode=\"flow\"");
    expect(workspace).toContain("heightMode=\"contained\"");
    expect(workspace).toContain("document.body.style.overflow");

    // Sheet mounts flow mode so WATCH/REORDER content is not trapped in a nested scroller.
    const sheetFnStart = workspace.indexOf(
      "function ActionDetailSheet(",
    );
    const sheetSlice = workspace.slice(sheetFnStart);
    expect(sheetSlice).toContain('heightMode="flow"');
    expect(sheetSlice).toContain('data-actions-sheet-scroll="true"');
    expect(sheetSlice).not.toContain('heightMode="contained"');
  });

  it("keeps mobile filter overflow discoverable with thin scrollbar and edge fades", () => {
    const workspace = read(
      "components/actions-demo/actions-demo-workspace.tsx",
    );

    // R1: thin scrollbar (not hidden) + swipe hint + edge fades for 320–390 discoverability.
    expect(workspace).toContain('data-actions-filter-scroll="true"');
    expect(workspace).toContain("[scrollbar-width:thin]");
    expect(workspace).toContain("Swipe for more");
    expect(workspace).toContain("scrollIntoView");
    expect(workspace).toContain("bg-gradient-to-r");
    expect(workspace).toContain("bg-gradient-to-l");
    expect(workspace).toContain('(min-width: 768px)');
    expect(workspace).toContain('(min-width: 1280px)');
    expect(workspace).toContain("xl:grid-cols-");
    expect(workspace).toContain("tabletInspectorRef");
    expect(workspace).toContain("min-w-0 max-w-full");
  });

  it("uses a single-column evidence grid on the narrowest phones", () => {
    const briefPanel = read(
      "components/actions-demo/decision-brief-panel.tsx",
    );

    expect(briefPanel).toContain(
      "grid-cols-1 gap-2 min-[380px]:grid-cols-2 sm:mt-3 sm:grid-cols-3 sm:gap-2.5",
    );
  });

  it("activates Actions navigation with a visible Demo distinction", () => {
    const actionsNav = read(
      "components/app-shell/actions-nav-link.tsx",
    );

    expect(actionsNav).toContain("/actions");
    expect(actionsNav).toContain("Demo");
    expect(actionsNav).toContain("aria-current");

    for (const file of [
      "components/app-shell/app-shell.tsx",
      "components/app-shell/mobile-app-menu.tsx",
    ]) {
      const source = read(file);
      expect(source).toContain("ActionsNavLink");
      expect(source).toContain("Later");
      expect(source).not.toContain('label: "Actions"');
    }
  });

  it("clears Overview active highlighting off the exact Overview route", () => {
    const overviewNav = read(
      "components/app-shell/overview-nav-link.tsx",
    );
    const actionsNav = read(
      "components/app-shell/actions-nav-link.tsx",
    );
    const shell = read(
      "components/app-shell/app-shell.tsx",
    );
    const mobile = read(
      "components/app-shell/mobile-app-menu.tsx",
    );

    expect(overviewNav).toContain("usePathname");
    expect(overviewNav).toContain('aria-current');
    expect(overviewNav).toContain("pathname === href");
    expect(actionsNav).toContain("pathname === href");
    expect(shell).toContain("OverviewNavLink");
    expect(shell).toContain("ActionsNavLink");
    expect(mobile).toContain("OverviewNavLink");
    expect(mobile).toContain("ActionsNavLink");
    expect(shell).not.toContain('aria-current="page"');
    expect(overviewNav).not.toContain("/actions");
  });

  it("surfaces merchant-friendly reason explanations before raw codes", () => {
    const briefPanel = read(
      "components/actions-demo/decision-brief-panel.tsx",
    );

    expect(briefPanel).toContain("explainDemoReasonCode");
    expect(briefPanel).toContain("Technical details");
    expect(briefPanel).toContain("Raw reason codes");
    expect(briefPanel).toContain("Key evidence");

    const root = getM7DecisionDemoFixtureRoot();
    for (const action of root.actions) {
      for (const code of action.evidence.reasonCodes) {
        const explanation = explainDemoReasonCode(code);
        expect(explanation.length).toBeGreaterThan(8);
        expect(explanation).not.toBe(code);
      }
    }
  });

  it("does not claim dark-theme Actions chrome (shell remains light)", () => {
    const workspace = read(
      "components/actions-demo/actions-demo-workspace.tsx",
    );
    const briefPanel = read(
      "components/actions-demo/decision-brief-panel.tsx",
    );
    const banner = read(
      "components/actions-demo/demo-data-banner.tsx",
    );
    const cluster = read(
      "components/actions-demo/demo-approval-cluster.tsx",
    );

    for (const source of [
      workspace,
      briefPanel,
      banner,
      cluster,
    ]) {
      expect(source).not.toContain("dark:");
      expect(source).not.toContain("className=\"dark");
    }
  });

  it("keeps demo controls free of durable production success copy", () => {
    const cluster = read(
      "components/actions-demo/demo-approval-cluster.tsx",
    );

    expect(cluster).toContain("DEMO_NO_SAVE_MESSAGE");
    expect(cluster).toContain("DEMO_VIEW_ONLY_MESSAGE");
    expect(cluster).toContain("Local demo controls");

    for (const forbidden of [
      "Approved",
      "Purchased",
      "Completed",
      "PO created",
      "Approve recommendation",
    ]) {
      expect(cluster).not.toContain(forbidden);
    }
  });
});
