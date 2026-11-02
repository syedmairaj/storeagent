import {
  describe,
  expect,
  it,
} from "vitest";

import {
  composeDemoDecisionBrief,
  mapDemoActionToGrounding,
  type DecisionBriefGroundingInput,
} from "@/lib/decision-brief";

import {
  composeDemoDecisionBriefWithAi,
  createOfflineStubAdapter,
  createRecordedReplayAdapter,
  disabledAiExplanationOptions,
  explainDecisionBriefFromGrounding,
  resolveServerAiExplanationEnablement,
  serverResolvedAiExplanationOptions,
  testInjectedAiExplanationOptions,
  toPrivacySafeAiExplanationLog,
  buildTemplatedOfflineStubCandidate,
  buildDeterministicGroundingEnvelope,
  validateAiExplanationCandidate,
} from "@/lib/decision-brief/ai";

import {
  mergeAiValidatedBrief,
} from "@/lib/decision-brief/ai/merge-ai-brief";

import {
  getM7DecisionDemoFixtureRoot,
  type DemoActionItem,
} from "@/lib/demo/m7-decision-demo-fixtures";

const GENERATED_AT =
  "2026-11-02T12:00:00.000Z";

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

function trustedGrounding(
  actionType: DemoActionItem["actionType"],
): {
  action: DemoActionItem;
  grounding: DecisionBriefGroundingInput;
} {
  const action =
    fixtureAction(
      actionType,
    );
  const root =
    getM7DecisionDemoFixtureRoot();
  const trusted =
    root.actions.find(
      (item) =>
        item.id === action.id,
    );

  if (
    !trusted
  ) {
    throw new Error(
      "trusted missing",
    );
  }

  return {
    action: trusted,
    grounding: mapDemoActionToGrounding(
      trusted,
      {
        organizationId: "org-allowlisted",
        trustedDemoAttestation:
          root.demoAttestation,
      },
    ),
  };
}

describe("M7.4e E3.3 server enablement", () => {
  it("defaults OFF with empty allowlist", () => {
    const resolved =
      resolveServerAiExplanationEnablement(
        "org-any",
        {
          enabled: false,
          organizationAllowlist: [],
        },
      );

    expect(
      resolved.aiExplanationEnabled,
    ).toBe(false);
    expect(
      resolved.allowlistMatch,
    ).toBe(false);
    expect(
      resolved.enablementSource,
    ).toBe(
      "disabled_default",
    );
  });

  it("requires both flag and allowlist match", () => {
    const enabledNoList =
      resolveServerAiExplanationEnablement(
        "org-a",
        {
          enabled: true,
          organizationAllowlist: [],
        },
      );

    expect(
      enabledNoList.allowlistMatch,
    ).toBe(false);

    const matched =
      resolveServerAiExplanationEnablement(
        "org-a",
        {
          enabled: true,
          organizationAllowlist: [
            "org-a",
          ],
        },
      );

    expect(
      matched.aiExplanationEnabled,
    ).toBe(true);
    expect(
      matched.allowlistMatch,
    ).toBe(true);
    expect(
      matched.enablementSource,
    ).toBe(
      "server_resolved_config",
    );
  });
});

describe("M7.4e E3.3 soft-enable delivery", () => {
  it("keeps flag-off path byte-equivalent to E2 compose", async () => {
    const {
      action,
      grounding,
    } =
      trustedGrounding(
        "REORDER",
      );

    const e2 =
      composeDemoDecisionBrief(
        action,
        {
          role: "owner",
          generatedAt: GENERATED_AT,
          organizationId: "org-allowlisted",
        },
      );

    const explained =
      await explainDecisionBriefFromGrounding(
        grounding,
        disabledAiExplanationOptions({
          briefId: action.id,
          role: "owner",
          generatedAt: GENERATED_AT,
        }),
      );

    expect(
      e2.ok && explained.ok,
    ).toBe(true);

    if (
      e2.ok &&
      explained.ok
    ) {
      expect(
        explained.brief,
      ).toEqual(
        e2.brief,
      );
      expect(
        explained.brief.generator,
      ).toBe(
        "deterministic_fallback",
      );
    }
  });

  it("delivers ai_validated for allowlisted synthetic stub after full validation", async () => {
    const {
      action,
      grounding,
    } =
      trustedGrounding(
        "REORDER",
      );

    const result =
      await explainDecisionBriefFromGrounding(
        grounding,
        serverResolvedAiExplanationOptions({
          briefId: action.id,
          role: "owner",
          generatedAt: GENERATED_AT,
          adapter: createOfflineStubAdapter({
            behavior: {
              mode: "templated_valid",
            },
          }),
          aiExplanationEnabled: true,
          allowlistMatch: true,
        }),
      );

    expect(
      result.ok,
    ).toBe(true);

    if (
      !result.ok
    ) {
      return;
    }

    expect(
      result.brief.generator,
    ).toBe(
      "ai_validated",
    );
    expect(
      result.brief.validationStatus,
    ).toBe(
      "accepted",
    );
    expect(
      result.brief.provenance.ai?.provider,
    ).toBe(
      "stub",
    );
    expect(
      result.brief.humanControls
        .productionApprovalEligible,
    ).toBe(
      false,
    );
    expect(
      result.brief.recommendation.actionType,
    ).toBe(
      "REORDER",
    );
    expect(
      result.diagnostics.candidateDiscarded,
    ).toBe(
      false,
    );
  });

  it("blocks allowlist bypass and client-style enablement pretenders", async () => {
    const {
      action,
      grounding,
    } =
      trustedGrounding(
        "WATCH",
      );

    const bypass =
      await explainDecisionBriefFromGrounding(
        grounding,
        {
          briefId: action.id,
          role: "owner",
          generatedAt: GENERATED_AT,
          aiExplanationEnabled: true,
          allowlistMatch: false,
          enablementSource:
            "server_resolved_config",
          adapter: createOfflineStubAdapter({
            behavior: {
              mode: "templated_valid",
            },
          }),
          forceDeterministicFallback: false,
        },
      );

    expect(
      bypass.ok,
    ).toBe(true);

    if (
      bypass.ok
    ) {
      expect(
        bypass.brief.generator,
      ).toBe(
        "deterministic_fallback",
      );
      expect(
        bypass.diagnostics.aiAttempted,
      ).toBe(
        false,
      );
    }

    const disabledSource =
      await explainDecisionBriefFromGrounding(
        grounding,
        {
          briefId: action.id,
          role: "owner",
          generatedAt: GENERATED_AT,
          aiExplanationEnabled: true,
          allowlistMatch: true,
          enablementSource: "disabled_default",
          adapter: createOfflineStubAdapter({
            behavior: {
              mode: "templated_valid",
            },
          }),
          forceDeterministicFallback: false,
        },
      );

    expect(
      disabledSource.ok,
    ).toBe(true);

    if (
      disabledSource.ok
    ) {
      expect(
        disabledSource.diagnostics.aiAttempted,
      ).toBe(
        false,
      );
    }
  });

  it("rejects forged attestation before AI attempt", async () => {
    const {
      grounding,
    } =
      trustedGrounding(
        "REORDER",
      );
    const forged =
      structuredClone(
        grounding,
      );
    delete forged.demoAttestation;

    const result =
      await explainDecisionBriefFromGrounding(
        forged,
        serverResolvedAiExplanationOptions({
          briefId: "forged",
          role: "owner",
          generatedAt: GENERATED_AT,
          adapter: createOfflineStubAdapter({
            behavior: {
              mode: "templated_valid",
            },
          }),
          aiExplanationEnabled: true,
          allowlistMatch: true,
        }),
      );

    expect(
      result.ok,
    ).toBe(false);

    if (
      !result.ok
    ) {
      expect(
        result.diagnostics.aiAttempted,
      ).toBe(
        false,
      );
    }
  });

  it("falls back with rejected chrome on invalid claims, injection, timeout and cost cap", async () => {
    const {
      action,
      grounding,
    } =
      trustedGrounding(
        "PROMOTE",
      );

    const invalid =
      await explainDecisionBriefFromGrounding(
        grounding,
        serverResolvedAiExplanationOptions({
          briefId: action.id,
          role: "owner",
          generatedAt: GENERATED_AT,
          adapter: createOfflineStubAdapter({
            behavior: {
              mode: "rejected_claims",
            },
          }),
          aiExplanationEnabled: true,
          allowlistMatch: true,
        }),
      );

    expect(
      invalid.ok,
    ).toBe(true);

    if (
      invalid.ok
    ) {
      expect(
        invalid.brief.generator,
      ).toBe(
        "deterministic_fallback",
      );
      expect(
        invalid.brief.validationStatus,
      ).toBe(
        "rejected_used_fallback",
      );
      expect(
        invalid.brief.recommendation.actionType,
      ).toBe(
        "PROMOTE",
      );
    }

    const timeout =
      await explainDecisionBriefFromGrounding(
        grounding,
        serverResolvedAiExplanationOptions({
          briefId: action.id,
          role: "owner",
          generatedAt: GENERATED_AT,
          adapter: createOfflineStubAdapter({
            behavior: {
              mode: "ignore_abort_late",
              delayMs: 200,
            },
          }),
          aiExplanationEnabled: true,
          allowlistMatch: true,
          timeoutMs: 40,
        }),
      );

    expect(
      timeout.ok,
    ).toBe(true);

    if (
      timeout.ok
    ) {
      expect(
        timeout.brief.validationStatus,
      ).toBe(
        "rejected_used_fallback",
      );
      expect(
        timeout.diagnostics.lateResultDiscarded,
      ).toBe(
        true,
      );
      expect(
        timeout.diagnostics.adapterFailureReason,
      ).toBe(
        "AI_TIMEOUT",
      );
    }

    const costCap =
      await explainDecisionBriefFromGrounding(
        grounding,
        serverResolvedAiExplanationOptions({
          briefId: action.id,
          role: "owner",
          generatedAt: GENERATED_AT,
          adapter: createOfflineStubAdapter({
            behavior: {
              mode: "templated_valid",
            },
          }),
          aiExplanationEnabled: true,
          allowlistMatch: true,
          maxOutputTokens: 1,
        }),
      );

    expect(
      costCap.ok,
    ).toBe(true);

    if (
      costCap.ok
    ) {
      expect(
        costCap.brief.validationStatus,
      ).toBe(
        "rejected_used_fallback",
      );
      expect(
        costCap.diagnostics.costCapExceeded,
      ).toBe(
        true,
      );
      expect(
        costCap.brief.generator,
      ).toBe(
        "deterministic_fallback",
      );
    }
  });

  it("supports recorded_replay accept and preserves WATCH restrictions", async () => {
    const {
      action,
      grounding,
    } =
      trustedGrounding(
        "WATCH",
      );

    const envelope =
      buildDeterministicGroundingEnvelope(
        grounding,
        {
          briefId: action.id,
        },
      );
    const candidate =
      buildTemplatedOfflineStubCandidate(
        envelope,
      );

    expect(
      candidate,
    ).not.toBeNull();

    const replay =
      createRecordedReplayAdapter({
        recordings: new Map([
          [
            envelope.groundingHash,
            candidate!,
          ],
        ]),
      });

    const result =
      await explainDecisionBriefFromGrounding(
        grounding,
        serverResolvedAiExplanationOptions({
          briefId: action.id,
          role: "owner",
          generatedAt: GENERATED_AT,
          adapter: replay,
          aiExplanationEnabled: true,
          allowlistMatch: true,
        }),
      );

    expect(
      result.ok,
    ).toBe(true);

    if (
      !result.ok
    ) {
      return;
    }

    expect(
      result.brief.generator,
    ).toBe(
      "ai_validated",
    );
    expect(
      result.brief.recommendation.actionType,
    ).toBe(
      "WATCH",
    );
    expect(
      result.brief.suggestedNextStep.code,
    ).toBe(
      "investigate_watch",
    );
    expect(
      result.brief.humanControls
        .productionApprovalEligible,
    ).toBe(
      false,
    );
  });

  it("keeps cross-org enablement isolated to allowlisted organization ids", async () => {
    const serverConfig = {
      enabled: true,
      organizationAllowlist: [
        "org-allowlisted",
      ],
    } as const;

    const other =
      resolveServerAiExplanationEnablement(
        "org-other",
        serverConfig,
      );

    expect(
      other.allowlistMatch,
    ).toBe(false);

    const composed =
      await composeDemoDecisionBriefWithAi(
        fixtureAction("REORDER"),
        {
          role: "owner",
          generatedAt: GENERATED_AT,
          organizationId: "org-other",
          serverConfig,
        },
      );

    expect(
      composed.ok,
    ).toBe(true);

    if (
      composed.ok
    ) {
      expect(
        composed.brief.generator,
      ).toBe(
        "deterministic_fallback",
      );
    }

    const allowlisted =
      await composeDemoDecisionBriefWithAi(
        fixtureAction("REORDER"),
        {
          role: "owner",
          generatedAt: GENERATED_AT,
          organizationId: "org-allowlisted",
          serverConfig,
        },
      );

    expect(
      allowlisted.ok,
    ).toBe(true);

    if (
      allowlisted.ok
    ) {
      expect(
        allowlisted.brief.generator,
      ).toBe(
        "ai_validated",
      );
    }
  });

  it("emits privacy-safe diagnostics without prose payloads", async () => {
    const {
      action,
      grounding,
    } =
      trustedGrounding(
        "REDUCE",
      );

    const result =
      await explainDecisionBriefFromGrounding(
        grounding,
        testInjectedAiExplanationOptions({
          briefId: action.id,
          role: "owner",
          generatedAt: GENERATED_AT,
          adapter: createOfflineStubAdapter({
            behavior: {
              mode: "templated_valid",
            },
          }),
          forceDeterministicFallback: false,
        }),
      );

    expect(
      result.ok,
    ).toBe(true);

    if (
      !result.ok
    ) {
      return;
    }

    const safe =
      toPrivacySafeAiExplanationLog({
        briefId: result.brief.briefId,
        briefMode: result.brief.briefMode,
        actionType:
          result.brief.recommendation.actionType,
        generator: result.brief.generator,
        validationStatus:
          result.brief.validationStatus,
        diagnostics: result.diagnostics,
        aiExplanationEnabled: true,
        allowlistMatch: true,
        adapterId: "offline_stub",
        promptVersion: "offline-stub-prompt-v1",
        semanticProfileVersion:
          "ai-brief-semantic-claims-v1",
        latencyMs:
          result.brief.provenance.ai?.latencyMs,
      });

    const serialized =
      JSON.stringify(
        safe,
      );

    expect(
      serialized,
    ).not.toContain(
      result.brief.whyNow.summary.slice(0, 24),
    );
    expect(
      safe.groundingHash,
    ).toBeTruthy();
    expect(
      safe.generator,
    ).toBe(
      "ai_validated",
    );
  });
});

describe("M7.4e E3.3 trust-boundary hardening", () => {
  it("has no installable process-global test override in production module", async () => {
    const enablement =
      await import(
        "@/lib/decision-brief/ai/server-enablement"
      );

    expect(
      Object.prototype.hasOwnProperty.call(
        enablement,
        "setTestOnlyServerAiExplanationConfig",
      ),
    ).toBe(
      false,
    );
    expect(
      // @ts-expect-error — production module must not export test override installer
      enablement.setTestOnlyServerAiExplanationConfig,
    ).toBeUndefined();

    const defaults =
      enablement.getDefaultServerAiExplanationConfig();

    expect(
      defaults.enabled,
    ).toBe(
      false,
    );
    expect(
      defaults.organizationAllowlist,
    ).toEqual(
      [],
    );

    // Env reader ignores request-shaped keys.
    const fromRequestShapedEnv =
      enablement.readServerAiExplanationConfig({
        NODE_ENV: "production",
        STOREAGENT_AI_EXPLANATION_ENABLED: "false",
        QUERY_AI_ENABLED: "true",
        BODY_ALLOWLIST: "org-evil",
      });

    expect(
      fromRequestShapedEnv.enabled,
    ).toBe(
      false,
    );
    expect(
      fromRequestShapedEnv.organizationAllowlist,
    ).toEqual(
      [],
    );
  });

  it("ignores browser/request enablement pretenders on the compose path", async () => {
    const action =
      fixtureAction(
        "REORDER",
      );

    // Flag OFF via explicit config — pretend client flags cannot flip it.
    const off =
      await composeDemoDecisionBriefWithAi(
        action,
        {
          role: "owner",
          generatedAt: GENERATED_AT,
          organizationId: "org-allowlisted",
          serverConfig: {
            enabled: false,
            organizationAllowlist: [
              "org-allowlisted",
            ],
          },
        },
      );

    expect(
      off.ok,
    ).toBe(true);

    if (
      off.ok
    ) {
      expect(
        off.brief.generator,
      ).toBe(
        "deterministic_fallback",
      );
      expect(
        off.brief.validationStatus,
      ).toBe(
        "accepted",
      );
    }

    const e2 =
      composeDemoDecisionBrief(
        action,
        {
          role: "owner",
          generatedAt: GENERATED_AT,
          organizationId: "org-allowlisted",
        },
      );

    expect(
      e2.ok && off.ok,
    ).toBe(true);

    if (
      e2.ok &&
      off.ok
    ) {
      expect(
        off.brief,
      ).toEqual(
        e2.brief,
      );
    }
  });

  it("refuses unauthorized direct merge of unvalidated candidate prose", async () => {
    const {
      action,
      grounding,
    } =
      trustedGrounding(
        "REORDER",
      );

    const envelope =
      buildDeterministicGroundingEnvelope(
        grounding,
        {
          briefId: action.id,
        },
      );

    const candidate =
      buildTemplatedOfflineStubCandidate(
        envelope,
      );

    expect(
      candidate,
    ).toBeTruthy();

    if (
      !candidate
    ) {
      return;
    }

    // Forged holder — looks like a validated token but was never minted.
    const forged = {
      candidate,
    };

    const unauthorized =
      mergeAiValidatedBrief(
        grounding,
        forged,
        {
          briefId: action.id,
          role: "owner",
          generatedAt: GENERATED_AT,
        },
      );

    expect(
      unauthorized.ok,
    ).toBe(
      false,
    );

    if (
      unauthorized.ok
    ) {
      return;
    }

    expect(
      unauthorized.reasons,
    ).toContain(
      "AI_UNSUPPORTED_SHAPE",
    );

    // Bare candidate object also refused.
    const bare =
      mergeAiValidatedBrief(
        grounding,
        candidate,
        {
          briefId: action.id,
          role: "owner",
          generatedAt: GENERATED_AT,
        },
      );

    expect(
      bare.ok,
    ).toBe(
      false,
    );

    // After mint via semantic validation, merge is authorized.
    const validated =
      validateAiExplanationCandidate(
        envelope,
        candidate,
      );

    expect(
      validated.ok,
    ).toBe(
      true,
    );

    if (
      !validated.ok
    ) {
      return;
    }

    const authorized =
      mergeAiValidatedBrief(
        grounding,
        validated.validatedCandidate,
        {
          briefId: action.id,
          role: "owner",
          generatedAt: GENERATED_AT,
        },
      );

    expect(
      authorized.ok,
    ).toBe(
      true,
    );

    if (
      authorized.ok
    ) {
      expect(
        authorized.brief.generator,
      ).toBe(
        "ai_validated",
      );
      expect(
        authorized.brief.humanControls
          .productionApprovalEligible,
      ).toBe(
        false,
      );
    }
  });

  it("keeps rejected / timeout / budget failures on fallback with WATCH invariants", async () => {
    const {
      action,
      grounding,
    } =
      trustedGrounding(
        "WATCH",
      );

    const rejected =
      await explainDecisionBriefFromGrounding(
        grounding,
        serverResolvedAiExplanationOptions({
          briefId: action.id,
          role: "owner",
          generatedAt: GENERATED_AT,
          adapter: createOfflineStubAdapter({
            behavior: {
              mode: "rejected_claims",
            },
          }),
          aiExplanationEnabled: true,
          allowlistMatch: true,
        }),
      );

    expect(
      rejected.ok,
    ).toBe(true);

    if (
      rejected.ok
    ) {
      expect(
        rejected.brief.generator,
      ).toBe(
        "deterministic_fallback",
      );
      expect(
        rejected.brief.validationStatus,
      ).toBe(
        "rejected_used_fallback",
      );
      expect(
        rejected.brief.recommendation.actionType,
      ).toBe(
        "WATCH",
      );
      expect(
        rejected.brief.humanControls
          .productionApprovalEligible,
      ).toBe(
        false,
      );
      expect(
        rejected.brief.suggestedNextStep.code,
      ).toBe(
        "investigate_watch",
      );
    }

    const budget =
      await explainDecisionBriefFromGrounding(
        grounding,
        serverResolvedAiExplanationOptions({
          briefId: action.id,
          role: "owner",
          generatedAt: GENERATED_AT,
          adapter: createOfflineStubAdapter({
            behavior: {
              mode: "templated_valid",
            },
          }),
          aiExplanationEnabled: true,
          allowlistMatch: true,
          maxOutputTokens: 1,
        }),
      );

    expect(
      budget.ok,
    ).toBe(true);

    if (
      budget.ok
    ) {
      expect(
        budget.brief.generator,
      ).toBe(
        "deterministic_fallback",
      );
      expect(
        budget.diagnostics.costCapExceeded,
      ).toBe(
        true,
      );
      expect(
        budget.brief.humanControls
          .productionApprovalEligible,
      ).toBe(
        false,
      );
    }
  });
});
