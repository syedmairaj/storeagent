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

    expect(banner).toContain(
      "Synthetic demonstration data — not live inventory",
    );
    expect(banner).toContain('role="status"');
    expect(banner).toContain("sticky top-16");
    expect(banner).toContain("lg:top-0");
    expect(banner).toContain("py-2");
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

  it("hides mobile filter scrollbars while keeping overflow affordances", () => {
    const workspace = read(
      "components/actions-demo/actions-demo-workspace.tsx",
    );

    expect(workspace).toContain("[scrollbar-width:none]");
    expect(workspace).toContain("[&::-webkit-scrollbar]:hidden");
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
    const workspace = read(
      "components/actions-demo/actions-demo-workspace.tsx",
    );

    expect(workspace).toContain(
      "grid-cols-1 gap-2.5 min-[380px]:grid-cols-2 sm:grid-cols-3",
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
    const workspace = read(
      "components/actions-demo/actions-demo-workspace.tsx",
    );

    expect(workspace).toContain("explainDemoReasonCode");
    expect(workspace).toContain("Technical details");
    expect(workspace).toContain("Raw reason codes");
    expect(workspace).toContain("Key evidence");

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
    const banner = read(
      "components/actions-demo/demo-data-banner.tsx",
    );
    const cluster = read(
      "components/actions-demo/demo-approval-cluster.tsx",
    );

    for (const source of [workspace, banner, cluster]) {
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
