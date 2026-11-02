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

const ROOT = process.cwd();

function read(
  relative: string,
): string {
  return fs.readFileSync(
    path.join(ROOT, relative),
    "utf8",
  );
}

function fixtureAction(
  actionType: DemoActionItem["actionType"],
): DemoActionItem {
  const action =
    getM7DecisionDemoFixtureRoot().actions.find(
      (item) =>
        item.actionType === actionType,
    );

  if (
    !action
  ) {
    throw new Error(
      `Missing ${actionType}`,
    );
  }

  return action;
}

describe("M7.4e E2 Decision Brief UX integration", () => {
  it("wires DecisionBriefPanel through the Actions inspector and sheet", () => {
    const workspace = read(
      "components/actions-demo/actions-demo-workspace.tsx",
    );
    const panel = read(
      "components/actions-demo/decision-brief-panel.tsx",
    );

    expect(workspace).toContain(
      "DecisionBriefPanel",
    );
    expect(workspace).toContain(
      "heightMode=\"flow\"",
    );
    expect(workspace).toContain(
      "heightMode=\"contained\"",
    );
    expect(workspace).toContain(
      "Decision brief",
    );
    expect(panel).toContain(
      "composeDemoDecisionBrief",
    );
    expect(panel).toContain(
      "DemoApprovalCluster",
    );
  });

  it("renders the required merchant brief sections and provenance chrome", () => {
    const panel = read(
      "components/actions-demo/decision-brief-panel.tsx",
    );

    for (const required of [
      "Why now",
      "Key evidence",
      "Confidence & uncertainty",
      "Suggested next step",
      "Technical details",
      "Synthetic demonstration",
      "StoreAgent explanation",
      "How this brief was built",
      "Uncertainty first",
      "Recommended quantity",
      "role=\"status\"",
      "Decision brief unavailable",
    ]) {
      expect(panel).toContain(required);
    }

    expect(panel).not.toContain(
      "AI decided",
    );
    expect(panel).not.toContain(
      "AI-generated",
    );
    expect(panel).not.toContain(
      "cash at risk",
    );
    expect(panel).not.toContain(
      "openai",
    );
  });

  it("renders human uncertainty explanations, not raw snake_case codes, in the main strip", () => {
    const panel = read(
      "components/actions-demo/decision-brief-panel.tsx",
    );

    expect(panel).toContain(
      "uniqueExplanationsForCodes",
    );
    expect(panel).toContain(
      "explainDemoReasonCode",
    );
    expect(panel).toContain(
      "Raw reason codes",
    );
    // Merchant Confidence & uncertainty strip must not dump joined raw codes.
    expect(panel).not.toContain(
      'uncertainty.codes.slice(0, 4).join(" · ")',
    );
    expect(panel).not.toContain(
      'uncertainty.codes.slice(0, 3).join(" · ")',
    );
    // WATCH excludes Grounded signals reason codes from the strip.
    expect(panel).toContain(
      "action.evidence.reasonCodes",
    );
    expect(panel).toContain(
      "excludeCodes",
    );
  });

  it("preserves WATCH uncertainty-first semantics without purchase CTAs", () => {
    const panel = read(
      "components/actions-demo/decision-brief-panel.tsx",
    );
    const cluster = read(
      "components/actions-demo/demo-approval-cluster.tsx",
    );

    expect(panel).toContain(
      "No buy, reduce, or promote recommendation",
    );
    expect(panel).toContain(
      "Uncertainty first",
    );
    expect(panel).toContain(
      "Grounded signals",
    );
    expect(panel).not.toContain(
      "Material uncertainty remains primary for this watch — see the note above.",
    );

    const watchBrief =
      composeDemoDecisionBrief(
        fixtureAction("WATCH"),
        {
          role: "owner",
        },
      );

    expect(watchBrief.ok).toBe(true);
    if (
      watchBrief.ok
    ) {
      expect(
        watchBrief.brief.uncertainty.hasMaterialUncertainty,
      ).toBe(true);
      expect(
        watchBrief.brief.suggestedNextStep.code,
      ).toBe("investigate_watch");
      expect(
        watchBrief.brief.recommendation.recommendedQuantity.state,
      ).toBe("not_applicable");
      expect(
        watchBrief.brief.generator,
      ).toBe("deterministic_fallback");
      expect(
        watchBrief.brief.humanControls.productionApprovalEligible,
      ).toBe(false);
      expect(
        watchBrief.brief.humanControls.controlCopy.primaryLabel.toLowerCase(),
      ).toContain("acknowledge");
    }

    expect(cluster).toContain(
      "demoPrimaryControlLabel",
    );
    expect(cluster).not.toContain(
      "buy now",
    );

    const controls = read(
      "lib/demo/m7-decision-demo-controls.ts",
    );
    expect(controls).toContain(
      "Try demo acknowledge",
    );
  });

  it("keeps REORDER quantity editing and demo no-save controls available", () => {
    const panel = read(
      "components/actions-demo/decision-brief-panel.tsx",
    );
    const cluster = read(
      "components/actions-demo/demo-approval-cluster.tsx",
    );

    expect(panel).toContain(
      "DemoApprovalCluster",
    );
    expect(cluster).toContain(
      "demoActionShowsRecommendedQuantity",
    );
    expect(cluster).toContain(
      "DEMO_NO_SAVE_MESSAGE",
    );
    expect(cluster).toContain(
      "DEMO_VIEW_ONLY_MESSAGE",
    );
    expect(cluster).toContain(
      "validateDemoReorderEditQuantity",
    );
    // One contextual live feedback path — not a permanent duplicate status strip.
    expect(cluster).toContain(
      'aria-live="polite"',
    );
    expect(
      cluster.split("{DEMO_NO_SAVE_MESSAGE}").length - 1,
    ).toBeLessThanOrEqual(3);

    const reorder =
      composeDemoDecisionBrief(
        fixtureAction("REORDER"),
        {
          role: "owner",
        },
      );

    expect(reorder.ok).toBe(true);
    if (
      reorder.ok
    ) {
      expect(
        reorder.brief.recommendation.recommendedQuantity.state,
      ).toBe("known");
      expect(
        reorder.brief.humanControls.demoEditQuantityAllowed,
      ).toBe(true);
      expect(
        reorder.brief.humanControls.demoNoSaveRequired,
      ).toBe(true);
    }

    const analyst =
      composeDemoDecisionBrief(
        fixtureAction("REORDER"),
        {
          role: "analyst",
        },
      );

    expect(analyst.ok).toBe(true);
    if (
      analyst.ok
    ) {
      expect(
        analyst.brief.humanControls.analystViewOnly,
      ).toBe(true);
      expect(
        analyst.brief.humanControls.demoPrimaryInteractionAllowed,
      ).toBe(false);
    }
  });

  it("preserves accepted responsive split / stack / sheet contracts in the workspace", () => {
    const workspace = read(
      "components/actions-demo/actions-demo-workspace.tsx",
    );

    expect(workspace).toContain(
      "(min-width: 1280px)",
    );
    expect(workspace).toContain(
      "(min-width: 768px)",
    );
    expect(workspace).toContain(
      "xl:grid-cols-",
    );
    expect(workspace).toContain(
      "tabletInspectorRef",
    );
    expect(workspace).toContain(
      'role="dialog"',
    );
    expect(workspace).toContain(
      'aria-modal="true"',
    );
    expect(workspace).toContain(
      'event.key === "Escape"',
    );
    expect(workspace).toContain(
      "motion-reduce:",
    );
    expect(workspace).toContain(
      "size-11",
    );
    expect(workspace).toContain(
      'data-actions-sheet-scroll="true"',
    );
    expect(workspace).toContain(
      'heightMode="flow"',
    );
    expect(workspace).toContain(
      'heightMode="contained"',
    );
  });

  it("fail-closes the brief UI path when composition is unavailable", () => {
    const panel = read(
      "components/actions-demo/decision-brief-panel.tsx",
    );

    expect(panel).toContain(
      "BriefCompositionError",
    );
    expect(panel).toContain(
      "Decision brief unavailable",
    );
    expect(panel).toContain(
      "failed closed",
    );
    expect(panel).toContain(
      'role="alert"',
    );
  });
});

describe("M7.4e E2 architecture isolation", () => {
  it("keeps Actions demo graph free of LLM providers, lifecycle RPCs, and live loaders", () => {
    const files = [
      "components/actions-demo/decision-brief-panel.tsx",
      "components/actions-demo/actions-demo-workspace.tsx",
      "components/actions-demo/demo-approval-cluster.tsx",
      "app/(app)/app/[organizationId]/actions/page.tsx",
    ];

    const forbidden = [
      "openai",
      "@anthropic",
      "@google/generative-ai",
      "transition_inventory_action_merchant",
      "persistInventoryAction",
      "createSupabaseAdminClient",
      "lib/persistence",
      "lib/metrics/",
      "lib/forecast/",
      "evaluateFixtureInventoryDecision",
      "ai_validated",
    ] as const;

    for (const file of files) {
      const source = read(file);

      for (const fragment of forbidden) {
        // Generator label may mention ai_validated only inside typed brief rendering
        // of "How this brief was built" — allow validationStatus display strings,
        // but ban provider SDK and production wiring fragments.
        if (
          fragment === "ai_validated" &&
          file.endsWith("decision-brief-panel.tsx")
        ) {
          // Panel may compare generator === "ai_validated" for labeling; must not
          // import providers or claim AI-generated fallback copy.
          expect(source).not.toContain("openai");
          expect(source).toContain(
            "StoreAgent explanation",
          );
          continue;
        }

        expect(
          source,
          `${file} must not contain ${fragment}`,
        ).not.toContain(fragment);
      }
    }
  });

  it("labels deterministic fallback as StoreAgent explanation, never AI-generated", () => {
    const panel = read(
      "components/actions-demo/decision-brief-panel.tsx",
    );

    expect(panel).toContain(
      'brief.generator === "ai_validated"',
    );
    expect(panel).toContain(
      "StoreAgent explanation",
    );
    expect(panel).toContain(
      "AI-assisted explanation",
    );

    for (const actionType of [
      "REORDER",
      "REDUCE",
      "PROMOTE",
      "WATCH",
    ] as const) {
      const result =
        composeDemoDecisionBrief(
          fixtureAction(actionType),
          {
            role: "owner",
          },
        );

      expect(result.ok).toBe(true);
      if (
        result.ok
      ) {
        expect(result.brief.generator).toBe(
          "deterministic_fallback",
        );
        expect(result.brief.provenance.ai).toBeUndefined();
      }
    }
  });
});
