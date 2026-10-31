import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

const ROOT = process.cwd();

const ACTIONS_PAGE =
  "app/(app)/app/[organizationId]/actions/page.tsx";

const DEMO_DIRS = [
  "app/(app)/app/[organizationId]/actions",
  "components/actions-demo",
  "lib/demo",
] as const;

const FORBIDDEN_IMPORT_FRAGMENTS = [
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

describe("M7.4b Actions demonstration architecture", () => {
  it("ships the demonstration Actions route under the authenticated org shell", () => {
    expect(
      fs.existsSync(path.join(ROOT, ACTIONS_PAGE)),
    ).toBe(true);

    const source = read(ACTIONS_PAGE);
    const banner = read(
      "components/actions-demo/demo-data-banner.tsx",
    );

    expect(source).toContain("DemoDataBanner");
    expect(source).toContain("ActionsDemoWorkspace");
    expect(source).toContain("loadM7DecisionDemoDataset");
    expect(banner).toContain(
      "Synthetic demonstration data — not live inventory",
    );
    expect(banner).toContain('role="status"');
  });

  it("keeps Actions nav disabled until later acceptance", () => {
    for (const file of [
      "components/app-shell/app-shell.tsx",
      "components/app-shell/mobile-app-menu.tsx",
    ]) {
      const source = read(file);

      expect(source).toContain('label: "Actions"');
      expect(source).toContain("Later");
      expect(source).not.toContain(
        "`/app/${organization.id}/actions`",
      );
      expect(source).not.toContain(
        "/actions\"",
      );
    }
  });

  it("keeps Overview free of invented live opportunity counts", () => {
    const source = read(
      "app/(app)/app/[organizationId]/page.tsx",
    );

    expect(source).toContain(
      "No inventory data has been connected yet.",
    );
    expect(source).toContain("will not invent inventory");

    for (const forbidden of [
      "opportunity count",
      "reorder opportunities",
      "cash at risk",
      "ActionsDemoWorkspace",
      "m7-decision-demo-fixtures",
    ]) {
      expect(source.toLowerCase()).not.toContain(
        forbidden.toLowerCase(),
      );
    }
  });

  it("isolates demo modules from persistence, lifecycle RPCs, and live loaders", () => {
    const files = DEMO_DIRS.flatMap((dir) =>
      listSourceFiles(dir),
    );

    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const source = read(file);

      for (const fragment of FORBIDDEN_IMPORT_FRAGMENTS) {
        expect(
          source,
          `${file} must not reference ${fragment}`,
        ).not.toContain(fragment);
      }
    }
  });

  it("does not wire Approve/Edit/Dismiss to production lifecycle semantics", () => {
    const files = [
      "components/actions-demo/actions-demo-workspace.tsx",
      "components/actions-demo/demo-approval-cluster.tsx",
    ];

    for (const file of files) {
      if (!fs.existsSync(path.join(ROOT, file))) {
        continue;
      }

      const source = read(file);

      expect(source).not.toContain(
        "transition_inventory_action_merchant",
      );
      expect(source).not.toContain("PO created");
      expect(source).not.toContain("Purchased");
    }
  });

  it("renders HEALTHY as a separate non-action skim", () => {
    const workspace = read(
      "components/actions-demo/actions-demo-workspace.tsx",
    );

    expect(workspace).toContain("Healthy — no intervention");
    expect(workspace).toContain(
      "Healthy items are not inventory actions",
    );
    expect(workspace).not.toContain(
      'actionType: "HEALTHY"',
    );
  });

  it("supports accessible detail sheet dismissal patterns", () => {
    const workspace = read(
      "components/actions-demo/actions-demo-workspace.tsx",
    );

    expect(workspace).toContain('role="dialog"');
    expect(workspace).toContain('aria-modal="true"');
    expect(workspace).toContain('event.key === "Escape"');
    expect(workspace).toContain("motion-reduce:");
    expect(workspace).toContain("focus-visible:ring-2");
  });

  it("uses fixture attestation constant from the demo module", () => {
    const fixtures = read(
      "lib/demo/m7-decision-demo-fixtures.ts",
    );

    expect(fixtures).toContain(
      'm7-synthetic-demonstration-v1',
    );
    expect(fixtures).toContain(
      "loadM7DecisionDemoDataset",
    );
  });
});
