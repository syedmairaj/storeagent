import type {
  StoreAgentEvaluationRisk,
  StoreAgentEvaluationScenario,
} from "@/tests/evaluation/types";

import {
  tenancyV1Fixture,
  type TenancyV1EvaluationInput,
} from "@/tests/fixtures/tenancy/cross-tenant-v1-matrix";

import {
  tenancyV1Goldens,
} from "@/tests/golden/tenancy/cross-tenant-v1-matrix";

const metadata:
  Readonly<
    Record<
      string,
      {
        title: string;
        risk:
          StoreAgentEvaluationRisk;
        protects:
          readonly string[];
      }
    >
  > =
{
  "tenancy/unauthenticated-request-v1": {
    "title": "Unauthenticated Request",
    "risk": "critical",
    "protects": [
      "Tenant data cannot be entered without authenticated identity."
    ]
  },
  "tenancy/missing-organization-v1": {
    "title": "Missing Organization",
    "risk": "critical",
    "protects": [
      "StoreAgent must never auto-select the first organization for an authenticated user."
    ]
  },
  "tenancy/foreign-organization-claim-v1": {
    "title": "Foreign Organization Claim",
    "risk": "critical",
    "protects": [
      "A request-supplied organization ID cannot grant membership in another organization."
    ]
  },
  "tenancy/reuse-other-users-membership-v1": {
    "title": "Reuse Other Users Membership",
    "risk": "critical",
    "protects": [
      "A valid membership belonging to another user cannot authorize the attacker."
    ]
  },
  "tenancy/foreign-store-under-authorized-org-v1": {
    "title": "Foreign Store Under Authorized Org",
    "risk": "critical",
    "protects": [
      "Authorization to one organization cannot be combined with a store belonging to another organization."
    ]
  },
  "tenancy/nonexistent-store-v1": {
    "title": "Nonexistent Store",
    "risk": "high",
    "protects": [
      "Unknown store identifiers fail closed rather than creating implicit scope."
    ]
  },
  "tenancy/matching-org-store-control-v1": {
    "title": "Matching Org Store Control",
    "risk": "medium",
    "protects": [
      "The adversarial matrix also proves that correctly owned organization/store scope remains usable."
    ]
  },
  "tenancy/context-cannot-cross-selected-store-v1": {
    "title": "Context Cannot Cross Selected Store",
    "risk": "critical",
    "protects": [
      "An already-resolved store-scoped context cannot be reused against a different selected store."
    ]
  },
  "tenancy/operator-membership-escalation-v1": {
    "title": "Operator Membership Escalation",
    "risk": "critical",
    "protects": [
      "Operator role cannot escalate into membership administration."
    ]
  },
  "tenancy/operator-ownership-escalation-v1": {
    "title": "Operator Ownership Escalation",
    "risk": "critical",
    "protects": [
      "Operator role cannot transfer organization ownership."
    ]
  },
  "tenancy/analyst-action-escalation-v1": {
    "title": "Analyst Action Escalation",
    "risk": "high",
    "protects": [
      "Read-only analyst role cannot execute inventory decisions."
    ]
  },
  "tenancy/service-operation-null-scope-v1": {
    "title": "Service Operation Null Scope",
    "risk": "critical",
    "protects": [
      "Privileged service-role work cannot execute without explicit trusted tenant scope."
    ]
  },
  "tenancy/service-operation-blank-org-v1": {
    "title": "Service Operation Blank Org",
    "risk": "critical",
    "protects": [
      "A structurally present but blank organization scope is not trusted tenant scope."
    ]
  },
  "tenancy/provider-same-external-id-cross-org-v1": {
    "title": "Provider Same External Id Cross Org",
    "risk": "critical",
    "protects": [
      "The same provider external ID in different organizations must produce different durable binding identities."
    ]
  },
  "tenancy/provider-same-external-id-cross-integration-v1": {
    "title": "Provider Same External Id Cross Integration",
    "risk": "critical",
    "protects": [
      "The same external ID from different integrations cannot collapse into one canonical provider identity."
    ]
  },
  "tenancy/provider-silent-rebind-conflict-v1": {
    "title": "Provider Silent Rebind Conflict",
    "risk": "critical",
    "protects": [
      "An existing external identity cannot silently rebind to another canonical entity."
    ]
  },
  "tenancy/provider-cross-org-replay-rejected-v1": {
    "title": "Provider Cross Org Replay Rejected",
    "risk": "critical",
    "protects": [
      "An existing binding from one organization cannot be compared as if it belonged to another tenant namespace."
    ]
  },
  "tenancy/provider-ambiguous-canonical-binding-v1": {
    "title": "Provider Ambiguous Canonical Binding",
    "risk": "critical",
    "protects": [
      "One provider resource mapping to multiple canonical entities must be detected as ambiguous."
    ]
  },
  "tenancy/membership-client-mutation-denied-v1": {
    "title": "Membership Client Mutation Denied",
    "risk": "critical",
    "protects": [
      "Membership control cannot be mutated through an ordinary client path."
    ]
  },
  "tenancy/membership-requires-trusted-server-v1": {
    "title": "Membership Requires Trusted Server",
    "risk": "critical",
    "protects": [
      "Membership changes remain behind the trusted server boundary."
    ]
  }
};

const goldenByScenarioId =
  new Map(
    tenancyV1Goldens.map(
      (golden) => [
        golden.scenarioId,
        golden,
      ],
    ),
  );

export const CROSS_TENANT_V1_SCENARIOS:
  readonly StoreAgentEvaluationScenario<
    TenancyV1EvaluationInput,
    unknown
  >[] =
  tenancyV1Fixture.input.cases.map(
    (fixtureCase) => {
      const scenarioMetadata =
        metadata[
          fixtureCase.id
        ];

      if (!scenarioMetadata) {
        throw new Error(
          `Missing evaluation metadata for "${fixtureCase.id}".`,
        );
      }

      const golden =
        goldenByScenarioId.get(
          fixtureCase.id,
        );

      if (!golden) {
        throw new Error(
          `Missing approved golden for "${fixtureCase.id}".`,
        );
      }

      return {
        schemaVersion: 1,

        id:
          fixtureCase.id,

        title:
          scenarioMetadata.title,

        domain:
          "tenancy",

        risk:
          scenarioMetadata.risk,

        configurationVersion:
          golden.configurationVersion,

        input:
          fixtureCase.evaluation,

        expected:
          golden.expected,

        protects:
          scenarioMetadata.protects,
      };
    },
  );
