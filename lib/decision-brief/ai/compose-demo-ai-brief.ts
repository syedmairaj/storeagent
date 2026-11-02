/**
 * M7.4e E3.3 — server-side synthetic demo brief composition with optional AI.
 *
 * Server / test entry only. Client components must not import this module.
 */

import type {
  OrganizationMemberRole,
} from "@/lib/commerce-domain/types";

import {
  getM7DecisionDemoFixtureRoot,
  loadM7DecisionDemoDataset,
  type DemoActionItem,
  type M7DecisionDemoFixtureRoot,
} from "@/lib/demo/m7-decision-demo-fixtures";

import {
  demoActionMatchesTrustedFixture,
  mapDemoActionToGrounding,
} from "@/lib/decision-brief/map-demo-action";

import {
  createOfflineStubAdapter,
} from "@/lib/decision-brief/ai/offline-stub-adapter";

import {
  explainDecisionBriefFromGrounding,
  serverResolvedAiExplanationOptions,
  disabledAiExplanationOptions,
} from "@/lib/decision-brief/ai/orchestrate";

import {
  resolveServerAiExplanationEnablement,
  type ServerAiExplanationConfig,
} from "@/lib/decision-brief/ai/server-enablement";

import {
  DECISION_BRIEF_DEMO_ATTESTATION,
  type DecisionBriefRejectionCode,
  type DecisionBriefV1,
} from "@/lib/decision-brief/types";

export type ComposeDemoDecisionBriefWithAiOptions = {
  role: OrganizationMemberRole;
  generatedAt?: string;
  organizationId?: string | null;
  storeId?: string | null;
  locationId?: string | null;
  variantId?: string | null;
  fixtureRoot?: M7DecisionDemoFixtureRoot;
  /**
   * Trusted server config. Defaults to readServerAiExplanationConfig().
   * Tests may pass an explicit config; never from client body.
   */
  serverConfig?: ServerAiExplanationConfig;
};

export type ComposeDemoDecisionBriefWithAiResult =
  | {
      ok: true;
      brief: DecisionBriefV1;
    }
  | {
      ok: false;
      reasons: readonly DecisionBriefRejectionCode[];
      detail: string;
    };

/**
 * Attested demo fixture → grounding → orchestrator (soft-enable aware).
 */
export async function composeDemoDecisionBriefWithAi(
  action: DemoActionItem,
  options: ComposeDemoDecisionBriefWithAiOptions,
): Promise<ComposeDemoDecisionBriefWithAiResult> {
  const fixtureRoot =
    options.fixtureRoot ??
    getM7DecisionDemoFixtureRoot();

  const loaded =
    loadM7DecisionDemoDataset(
      fixtureRoot,
    );

  if (
    !loaded.ok
  ) {
    return {
      ok: false,
      reasons: [
        "MISSING_ATTESTATION",
      ],
      detail:
        "Demo brief composition requires an attested synthetic demonstration fixture.",
    };
  }

  const trusted =
    loaded.dataset.actions.find(
      (item) =>
        item.id === action.id,
    );

  if (
    !trusted
  ) {
    return {
      ok: false,
      reasons: [
        "TRUST_CLAIMS_INVALID",
      ],
      detail:
        "Caller-supplied action is not part of the attested demo fixture set.",
    };
  }

  if (
    !demoActionMatchesTrustedFixture(
      action,
      trusted,
    )
  ) {
    return {
      ok: false,
      reasons: [
        "TRUST_CLAIMS_INVALID",
      ],
      detail:
        "Caller-supplied action diverges from attested fixture provenance and cannot acquire demo trust.",
    };
  }

  if (
    loaded.dataset.demoAttestation !==
    DECISION_BRIEF_DEMO_ATTESTATION
  ) {
    return {
      ok: false,
      reasons: [
        "MISSING_ATTESTATION",
      ],
      detail:
        "Fixture attestation is not the trusted M7 synthetic demonstration constant.",
    };
  }

  const grounding =
    mapDemoActionToGrounding(
      trusted,
      {
        organizationId:
          options.organizationId,
        storeId: options.storeId,
        locationId: options.locationId,
        variantId: options.variantId,
        trustedDemoAttestation:
          loaded.dataset.demoAttestation,
      },
    );

  const orgId =
    typeof options.organizationId === "string"
      ? options.organizationId
      : "";

  const enablement =
    resolveServerAiExplanationEnablement(
      orgId,
      options.serverConfig,
    );

  const softEnabled =
    enablement.aiExplanationEnabled &&
    enablement.allowlistMatch;

  const explainOptions =
    softEnabled
      ? serverResolvedAiExplanationOptions({
          briefId: trusted.id,
          role: options.role,
          generatedAt: options.generatedAt,
          adapter: createOfflineStubAdapter({
            behavior: {
              mode: "templated_valid",
            },
          }),
          aiExplanationEnabled: true,
          allowlistMatch: true,
        })
      : disabledAiExplanationOptions({
          briefId: trusted.id,
          role: options.role,
          generatedAt: options.generatedAt,
        });

  const explained =
    await explainDecisionBriefFromGrounding(
      grounding,
      explainOptions,
    );

  if (
    !explained.ok
  ) {
    return {
      ok: false,
      reasons: explained.reasons,
      detail: explained.detail,
    };
  }

  return {
    ok: true,
    brief: explained.brief,
  };
}

/**
 * Precompose AI-capable briefs for every attested demo action (server page).
 */
export async function composeAllDemoDecisionBriefsWithAi(
  options: ComposeDemoDecisionBriefWithAiOptions,
): Promise<ReadonlyMap<string, DecisionBriefV1>> {
  const fixtureRoot =
    options.fixtureRoot ??
    getM7DecisionDemoFixtureRoot();

  const loaded =
    loadM7DecisionDemoDataset(
      fixtureRoot,
    );

  const out =
    new Map<string, DecisionBriefV1>();

  if (
    !loaded.ok
  ) {
    return out;
  }

  for (
    const action of loaded.dataset.actions
  ) {
    const composed =
      await composeDemoDecisionBriefWithAi(
        action,
        options,
      );

    if (
      composed.ok
    ) {
      out.set(
        action.id,
        composed.brief,
      );
    }
  }

  return out;
}
