import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

import {
  composeDemoDecisionBrief,
} from "@/lib/decision-brief";

import {
  getM7DecisionDemoFixtureRoot,
  type DemoActionItem,
} from "@/lib/demo/m7-decision-demo-fixtures";

import {
  explainDemoReasonCode,
  formatDemoUnknownNumber,
} from "@/lib/demo/m7-decision-demo-format";

const ROOT = process.cwd();

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

function fixtureById(id: string): DemoActionItem {
  const action = getM7DecisionDemoFixtureRoot().actions.find(
    (item) => item.id === id,
  );

  if (!action) {
    throw new Error(`Missing fixture ${id}`);
  }

  return action;
}

describe("M7.4e E3.3-R2.b Decision Brief evidence chrome", () => {
  it("keeps merchant section hierarchy and R1 single-scroller control placement", () => {
    const panel = read(
      "components/actions-demo/decision-brief-panel.tsx",
    );

    const recommendation = panel.indexOf(
      'data-actions-brief-section="recommendation"',
    );
    const why = panel.indexOf(
      'data-actions-brief-section="why"',
    );
    const evidence = panel.indexOf(
      'data-actions-brief-section="evidence"',
    );
    const uncertainty = panel.indexOf(
      'data-actions-brief-section="uncertainty"',
    );
    const nextStep = panel.indexOf(
      'data-actions-brief-section="next-step"',
    );
    const controls = panel.indexOf(
      'data-actions-brief-section="controls"',
    );
    const technical = panel.indexOf(
      'data-actions-brief-section="technical"',
    );
    const demoCluster = panel.indexOf("<DemoApprovalCluster");
    const briefScroll = panel.indexOf(
      'data-actions-brief-scroll="true"',
    );

    expect(recommendation).toBeGreaterThan(-1);
    expect(why).toBeGreaterThan(recommendation);
    expect(evidence).toBeGreaterThan(why);
    expect(uncertainty).toBeGreaterThan(evidence);
    expect(nextStep).toBeGreaterThan(uncertainty);
    expect(controls).toBeGreaterThan(nextStep);
    expect(demoCluster).toBeGreaterThan(controls);
    expect(technical).toBeGreaterThan(demoCluster);
    expect(briefScroll).toBeGreaterThan(-1);
    expect(panel).toContain("space-y-3 sm:space-y-4");
    expect(panel).toContain("Technical details");
  });

  it("renders Unknown explicitly with muted chrome and never invents zero fills in evidence cells", () => {
    const panel = read(
      "components/actions-demo/decision-brief-panel.tsx",
    );

    expect(panel).toContain('data-actions-evidence-cell');
    expect(panel).toContain("tabular-nums");
    expect(panel).toContain("text-zinc-400");
    expect(panel).toContain('? "Unknown"');
    expect(panel).not.toContain("fresh live data");
    expect(panel).not.toContain("cash at risk");

    expect(formatDemoUnknownNumber(null)).toBe("Unknown");
    expect(formatDemoUnknownNumber(undefined)).toBe("Unknown");
    expect(formatDemoUnknownNumber(Number.NaN)).toBe("Unknown");
    expect(formatDemoUnknownNumber(0)).toBe("0");

    const watch = composeDemoDecisionBrief(
      fixtureById("demo-action-watch-001"),
      { role: "owner" },
    );
    expect(watch.ok).toBe(true);
    if (watch.ok) {
      const unknownFacts = watch.brief.evidence.keyFacts.filter(
        (fact) => fact.fieldState === "unknown",
      );
      expect(unknownFacts.length).toBeGreaterThan(0);
      for (const fact of unknownFacts) {
        expect(fact.display).toBe("Unknown");
        expect(fact.display).not.toBe("0");
      }

      const knownFacts = watch.brief.evidence.keyFacts.filter(
        (fact) => fact.fieldState === "known",
      );
      expect(knownFacts.some((fact) => /\d/.test(fact.display))).toBe(
        true,
      );
      expect(
        knownFacts.some((fact) =>
          fact.display.includes("days") ||
          fact.display.includes("/day") ||
          fact.display.includes("%"),
        ),
      ).toBe(true);
    }
  });

  it("surfaces stale evidence only from existing reason/confidence codes", () => {
    const panel = read(
      "components/actions-demo/decision-brief-panel.tsx",
    );

    expect(panel).toContain("resolveStaleEvidenceCopy");
    expect(panel).toContain('data-actions-stale-evidence="true"');
    expect(panel).toContain("Stale evidence");
    expect(panel).toContain("stale_evidence");
    expect(panel).toContain("stale_inventory_observation");
    expect(panel).not.toContain("fresh live data");
    expect(panel).not.toContain("KPI");

    const stale = composeDemoDecisionBrief(
      fixtureById("demo-action-watch-stale-001"),
      { role: "owner" },
    );
    expect(stale.ok).toBe(true);
    if (stale.ok) {
      expect(stale.brief.confidence.reasonCodes).toContain(
        "stale_evidence",
      );
      expect(stale.brief.uncertainty.codes).toContain(
        "stale_evidence",
      );
      expect(
        explainDemoReasonCode("stale_evidence"),
      ).toBe("Evidence in this snapshot is stale.");
    }

    const reorder = composeDemoDecisionBrief(
      fixtureById("demo-action-reorder-001"),
      { role: "owner" },
    );
    expect(reorder.ok).toBe(true);
    if (reorder.ok) {
      expect(reorder.brief.confidence.reasonCodes).not.toContain(
        "stale_evidence",
      );
      expect(reorder.brief.uncertainty.codes).not.toContain(
        "stale_evidence",
      );
    }
  });

  it("keeps WATCH uncertainty clear, non-actionable, and provenance unobtrusive", () => {
    const panel = read(
      "components/actions-demo/decision-brief-panel.tsx",
    );

    expect(panel).toContain(
      'data-actions-brief-watch="uncertainty-first"',
    );
    expect(panel).toContain("Watch only");
    expect(panel).toContain(
      "Incomplete evidence — watch only. Not actionable as a purchase.",
    );
    expect(panel).toContain(
      'data-actions-brief-provenance="synthetic"',
    );
    expect(panel).toContain("Synthetic demonstration");
    expect(panel).not.toContain("Order anyway");
    expect(panel).not.toContain("buy now");
    expect(panel).not.toContain("Approve purchase");

    const watch = composeDemoDecisionBrief(
      fixtureById("demo-action-watch-001"),
      { role: "owner" },
    );
    expect(watch.ok).toBe(true);
    if (watch.ok) {
      expect(watch.brief.uncertainty.hasMaterialUncertainty).toBe(
        true,
      );
      expect(
        watch.brief.suggestedNextStep.code,
      ).toBe("investigate_watch");
      expect(
        watch.brief.humanControls.productionApprovalEligible,
      ).toBe(false);
      expect(
        watch.brief.humanControls.controlCopy.primaryLabel.toLowerCase(),
      ).toContain("acknowledge");
    }
  });

  it("preserves R2.a queue contracts and does not enable R2.c search/sort or micro-evidence", () => {
    const workspace = read(
      "components/actions-demo/actions-demo-workspace.tsx",
    );
    const panel = read(
      "components/actions-demo/decision-brief-panel.tsx",
    );

    expect(workspace).toContain('data-actions-queue-row="true"');
    expect(workspace).toContain("Incomplete evidence — watch only");
    expect(workspace).toContain("space-y-2");
    expect(workspace).not.toContain("QueueTools");
    expect(workspace).not.toContain("searchQuery");
    expect(workspace).not.toContain("sortKey");
    expect(workspace).not.toContain("micro-evidence");
    expect(panel).not.toContain("micro-evidence");
    expect(panel).not.toContain("QueueTools");
  });

  it("does not alter E0–E3.3 decision truth, validators, or AI soft-enable paths", () => {
    const panel = read(
      "components/actions-demo/decision-brief-panel.tsx",
    );

    expect(panel).toContain("composeDemoDecisionBrief");
    expect(panel).toContain("precomposedBrief");
    expect(panel).not.toContain("openai");
    expect(panel).not.toContain("@anthropic");
    expect(panel).not.toContain("transition_inventory_action_merchant");
    expect(panel).not.toContain("createSupabaseAdminClient");
    expect(panel).not.toContain("evaluateFixtureInventoryDecision");

    for (const action of getM7DecisionDemoFixtureRoot().actions) {
      const result = composeDemoDecisionBrief(action, {
        role: "owner",
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.brief.generator).toBe(
          "deterministic_fallback",
        );
        expect(
          result.brief.humanControls.productionApprovalEligible,
        ).toBe(false);
      }
    }
  });
});
