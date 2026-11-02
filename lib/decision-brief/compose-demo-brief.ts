/**
 * Convenience path: attested demo fixture action → validate → fallback brief.
 *
 * Only actions present in a load-attested fixture root receive trust.
 * Caller-supplied mutations / unknown ids fail closed.
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
  buildDeterministicFallbackBrief,
} from "@/lib/decision-brief/fallback-brief";

import {
  demoActionMatchesTrustedFixture,
  mapDemoActionToGrounding,
  type MapDemoActionToGroundingOptions,
} from "@/lib/decision-brief/map-demo-action";

import {
  DECISION_BRIEF_DEMO_ATTESTATION,
  type DecisionBriefRejectionCode,
  type DecisionBriefV1,
} from "@/lib/decision-brief/types";

export type ComposeDemoDecisionBriefOptions =
  Omit<
    MapDemoActionToGroundingOptions,
    "trustedDemoAttestation"
  > & {
    role: OrganizationMemberRole;
    generatedAt?: string;
    /**
     * Optional fixture root. Defaults to the compile-time M7 demo fixture.
     * Must pass loadM7DecisionDemoDataset attestation.
     */
    fixtureRoot?: M7DecisionDemoFixtureRoot;
  };

export type ComposeDemoDecisionBriefResult =
  | {
      ok: true;
      brief: DecisionBriefV1;
    }
  | {
      ok: false;
      reasons: readonly DecisionBriefRejectionCode[];
      detail: string;
    };

export function composeDemoDecisionBrief(
  action: DemoActionItem,
  options: ComposeDemoDecisionBriefOptions,
): ComposeDemoDecisionBriefResult {
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

  // Map the trusted fixture row (not unverified caller bytes).
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

  return buildDeterministicFallbackBrief(
    grounding,
    {
      briefId: trusted.id,
      role: options.role,
      generatedAt: options.generatedAt,
    },
  );
}
