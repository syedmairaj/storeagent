import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

const ROOT = process.cwd();

const DEMO_DIRS = [
  "app/(app)/app/[organizationId]/actions",
  "components/actions-demo",
  "lib/demo",
] as const;

const FORBIDDEN_FRAGMENTS = [
  "lib/persistence",
  "transition_inventory_action_merchant",
  "expire_inventory_action_system",
  "supersede_inventory_action_system",
  "persistInventoryAction",
  "inventory_action_is_merchant_approvable",
  "lib/metrics/",
  "lib/forecast/",
  "evaluateFixtureInventoryDecision",
  "createSupabaseAdminClient",
  "SERVICE_ROLE",
  ".rpc(",
  "from(\"inventory_actions\")",
] as const;

const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
]);

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
    for (const entry of fs.readdirSync(dir, {
      withFileTypes: true,
    })) {
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

describe("M7.4c demonstration approval architecture", () => {
  it("ships demo approval cluster with no-save messaging", () => {
    const cluster = read(
      "components/actions-demo/demo-approval-cluster.tsx",
    );
    const controls = read(
      "lib/demo/m7-decision-demo-controls.ts",
    );

    expect(cluster).toContain("DemoApprovalCluster");
    expect(cluster).toContain("DEMO_NO_SAVE_MESSAGE");
    expect(cluster).toContain("demoPrimaryControlLabel");
    expect(controls).toContain(
      "Demonstration only — no action was saved.",
    );
    expect(controls).toContain("Acknowledge review");
    expect(controls).toContain("View only — demonstration");
    expect(cluster).toContain("Apply demo edit");
    expect(cluster).toContain("DEMO_VIEW_ONLY_MESSAGE");
  });

  it("wires organization role into the Actions demo page", () => {
    const page = read(
      "app/(app)/app/[organizationId]/actions/page.tsx",
    );

    expect(page).toContain("requireAppIdentity");
    expect(page).toContain("resolveServerOrganizationContext");
    expect(page).toContain("role={resolution.context.role}");
    expect(page).toContain("getM7DecisionDemoFixtureRoot");
  });

  it("isolates demo modules from persistence and lifecycle RPCs", () => {
    const files = DEMO_DIRS.flatMap((dir) =>
      listSourceFiles(dir),
    );

    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const source = read(file);

      for (const fragment of FORBIDDEN_FRAGMENTS) {
        expect(
          source,
          `${file} must not reference ${fragment}`,
        ).not.toContain(fragment);
      }
    }
  });

  it("forbids durable Approved/Purchased/Completed success copy in demo controls", () => {
    const cluster = read(
      "components/actions-demo/demo-approval-cluster.tsx",
    );

    for (const forbidden of [
      "Approved",
      "Purchased",
      "Completed",
      "PO created",
      "purchase order",
      "supplier",
      "payment",
    ]) {
      expect(cluster).not.toContain(forbidden);
    }
  });

  it("gates quantity editor behind REORDER recommended-quantity helper", () => {
    const cluster = read(
      "components/actions-demo/demo-approval-cluster.tsx",
    );

    expect(cluster).toContain(
      "demoActionShowsRecommendedQuantity",
    );
    expect(cluster).toContain(
      "validateDemoReorderEditQuantity",
    );
    expect(cluster).toContain(
      "canInteractWithDemoApprovals",
    );
  });

  it("keeps Actions nav disabled", () => {
    for (const file of [
      "components/app-shell/app-shell.tsx",
      "components/app-shell/mobile-app-menu.tsx",
    ]) {
      const source = read(file);

      expect(source).toContain('label: "Actions"');
      expect(source).toContain("Later");
      expect(source).not.toContain("/actions");
    }
  });

  it("preserves accessible demo feedback and motion reduction hooks", () => {
    const cluster = read(
      "components/actions-demo/demo-approval-cluster.tsx",
    );
    const workspace = read(
      "components/actions-demo/actions-demo-workspace.tsx",
    );

    expect(cluster).toContain('role="status"');
    expect(cluster).toContain("aria-live");
    expect(cluster).toContain("motion-reduce:");
    expect(cluster).toContain("focus-visible:ring-2");
    expect(workspace).toContain("DemoApprovalCluster");
    expect(workspace).toContain('event.key === "Escape"');
  });

  it("does not invent Overview live metrics", () => {
    const overview = read(
      "app/(app)/app/[organizationId]/page.tsx",
    );

    expect(overview).toContain(
      "will not invent inventory",
    );
    expect(overview).not.toContain("DemoApprovalCluster");
  });
});
