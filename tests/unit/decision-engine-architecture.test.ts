import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(
    path.join(ROOT, relativePath),
    "utf8",
  );
}

describe("StoreAgent decision-engine architecture", () => {
  it("defines the canonical decision output states", () => {
    const spec = read(
      "docs/DECISION_ENGINE.md",
    );

    for (const state of [
      "REORDER",
      "REDUCE",
      "PROMOTE",
      "WATCH",
      "HEALTHY",
    ]) {
      expect(spec).toContain(state);
    }
  });

  it("keeps HEALTHY out of persisted InventoryAction action types", () => {
    const domain = read(
      "lib/commerce-domain/types.ts",
    );

    expect(domain).toContain(
      'export type InventoryActionType =',
    );

    expect(domain).toContain(
      '| "HEALTHY";',
    );

    const actionTypeStart =
      domain.indexOf(
        "export type InventoryActionType =",
      );

    const healthStart =
      domain.indexOf(
        "export type InventoryHealthState =",
      );

    const actionTypeBlock =
      domain.slice(
        actionTypeStart,
        healthStart,
      );

    expect(
      actionTypeBlock.includes("HEALTHY"),
    ).toBe(false);
  });

  it("requires contradictory signals to fail closed to WATCH", () => {
    const spec = read(
      "docs/DECISION_ENGINE.md",
    );

    expect(spec).toContain(
      "CONFLICTING_SIGNALS",
    );

    expect(spec).toContain(
      "WATCH takes precedence over incompatible commercial intervention",
    );
  });

  it("forbids AI from determining inventory truth", () => {
    const spec = read(
      "docs/DECISION_ENGINE.md",
    );

    expect(spec).toContain(
      "AI must not:",
    );

    expect(spec).toContain(
      "choose an action type",
    );

    expect(spec).toContain(
      "calculate action quantity",
    );

    expect(spec).toContain(
      "override decision thresholds",
    );
  });

  it("keeps metric formulas owned outside the decision engine", () => {
    const spec = read(
      "docs/DECISION_ENGINE.md",
    );

    expect(spec).toContain(
      "must not reimplement:",
    );

    expect(spec).toContain(
      "recommended order quantity",
    );

    expect(spec).toContain(
      "stockout risk",
    );

    expect(spec).toContain(
      "overstock risk",
    );
  });

  it("defines action-specific evidence gates", () => {
    const spec = read(
      "docs/DECISION_ENGINE.md",
    );

    expect(spec).toContain(
      "Action-specific evidence gates",
    );

    expect(spec).toContain(
      "A missing non-essential metric must not block an otherwise fully supported action.",
    );
  });

  it("requires historical action evidence snapshots", () => {
    const spec = read(
      "docs/DECISION_ENGINE.md",
    );

    expect(spec).toContain(
      "Every persisted InventoryAction must preserve the evidence used at decision time",
    );

    expect(spec).toContain(
      "Later data refreshes must not silently rewrite the evidence",
    );
  });
});
