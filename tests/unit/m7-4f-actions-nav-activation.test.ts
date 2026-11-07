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

describe("M7.4f Actions navigation activation", () => {
  it("exposes tenant-scoped Actions links with a visible Demo distinction", () => {
    const actionsNav = read(
      "components/app-shell/actions-nav-link.tsx",
    );
    const shell = read(
      "components/app-shell/app-shell.tsx",
    );
    const mobile = read(
      "components/app-shell/mobile-app-menu.tsx",
    );

    expect(actionsNav).toContain(
      "`/app/${organizationId}/actions`",
    );
    expect(actionsNav).toContain("usePathname");
    expect(actionsNav).toContain("aria-current");
    expect(actionsNav).toContain("Demo");
    expect(actionsNav).toContain(
      'aria-label="Actions demonstration"',
    );
    expect(actionsNav).toContain(
      "synthetic demonstration",
    );

    expect(shell).toContain("ActionsNavLink");
    expect(mobile).toContain("ActionsNavLink");
    expect(shell).toContain(
      "organizationId={organization.id}",
    );
    expect(mobile).toContain(
      "organizationId={organization.id}",
    );
  });

  it("activates Inventory while keeping Forecasting and Data quality disabled", () => {
    for (const file of [
      "components/app-shell/app-shell.tsx",
      "components/app-shell/mobile-app-menu.tsx",
    ]) {
      const source = read(file);

      expect(source).toContain("InventoryNavLink");
      expect(source).toContain('label: "Forecasting"');
      expect(source).toContain('label: "Data quality"');
      expect(source).toContain("Later");
      expect(source).toContain('aria-disabled="true"');
      expect(source).not.toContain('label: "Actions"');
      expect(source).not.toContain('label: "Inventory"');
    }
  });

  it("activates Overview only on the exact Overview route", () => {
    const overviewNav = read(
      "components/app-shell/overview-nav-link.tsx",
    );
    const actionsNav = read(
      "components/app-shell/actions-nav-link.tsx",
    );

    expect(overviewNav).toContain("pathname === href");
    expect(overviewNav).toContain('aria-current');
    expect(overviewNav).not.toContain("/actions");
    expect(actionsNav).toContain("pathname === href");
    expect(actionsNav).toContain("/actions");
  });

  it("preserves org-switch paths outside the Actions demo workspace", () => {
    const shell = read(
      "components/app-shell/app-shell.tsx",
    );
    const mobile = read(
      "components/app-shell/mobile-app-menu.tsx",
    );

    expect(shell).toContain('href="/app"');
    expect(mobile).toContain('href="/app"');
  });

  it("keeps Actions route authenticated, synthetic, and non-persistent", () => {
    const page = read(
      "app/(app)/app/[organizationId]/actions/page.tsx",
    );
    const cluster = read(
      "components/actions-demo/demo-approval-cluster.tsx",
    );
    const controls = read(
      "lib/demo/m7-decision-demo-controls.ts",
    );
    const workspace = read(
      "components/actions-demo/actions-demo-workspace.tsx",
    );

    expect(page).toContain("requireAppIdentity");
    expect(page).toContain("resolveServerOrganizationContext");
    expect(page).toContain("loadM7DecisionDemoDataset");
    expect(page).toContain("DemoDataBanner");

    expect(cluster).toContain("DEMO_NO_SAVE_MESSAGE");
    expect(cluster).toContain("DEMO_VIEW_ONLY_MESSAGE");
    expect(controls).toContain(
      "Demonstration only — no action was saved.",
    );
    expect(controls).toContain("canInteractWithDemoApprovals");
    expect(controls).not.toContain(
      "transition_inventory_action_merchant",
    );

    expect(workspace).toContain('role="dialog"');
    expect(workspace).toContain('event.key === "Escape"');
    expect(workspace).toContain("row?.focus()");
    expect(workspace).toContain(
      'data-actions-sheet-scroll="true"',
    );
  });

  it("does not invent Overview live opportunity counts after nav enablement", () => {
    const overview = read(
      "app/(app)/app/[organizationId]/page.tsx",
    );

    expect(overview).toContain(
      "does not fabricate SKUs, stock positions, forecasts",
    );

    for (const forbidden of [
      "opportunity count",
      "reorder opportunities",
      "cash at risk",
      "ActionsDemoWorkspace",
      "m7-decision-demo-fixtures",
    ]) {
      expect(overview.toLowerCase()).not.toContain(
        forbidden.toLowerCase(),
      );
    }
  });
});
