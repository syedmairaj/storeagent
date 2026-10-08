import type {
  StoreAgentGoldenOutput,
} from "@/tests/evaluation/golden";

export const tenancyV1Goldens:
  readonly StoreAgentGoldenOutput<unknown>[] =
[
  {
    "goldenSchemaVersion": 1,
    "id": "tenancy/unauthenticated-request-v1",
    "scenarioId": "tenancy/unauthenticated-request-v1",
    "configurationVersion": "tenancy-config-v1",
    "fixture": {
      "fixtureId": "tenancy/cross-tenant-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "ok": false,
      "code": "unauthenticated"
    },
    "review": {
      "status": "approved",
      "rationale": "Tenant data cannot be entered without authenticated identity."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "tenancy/missing-organization-v1",
    "scenarioId": "tenancy/missing-organization-v1",
    "configurationVersion": "tenancy-config-v1",
    "fixture": {
      "fixtureId": "tenancy/cross-tenant-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "ok": false,
      "code": "organization_required"
    },
    "review": {
      "status": "approved",
      "rationale": "StoreAgent must never auto-select the first organization for an authenticated user."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "tenancy/foreign-organization-claim-v1",
    "scenarioId": "tenancy/foreign-organization-claim-v1",
    "configurationVersion": "tenancy-config-v1",
    "fixture": {
      "fixtureId": "tenancy/cross-tenant-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "ok": false,
      "code": "membership_not_found"
    },
    "review": {
      "status": "approved",
      "rationale": "A request-supplied organization ID cannot grant membership in another organization."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "tenancy/reuse-other-users-membership-v1",
    "scenarioId": "tenancy/reuse-other-users-membership-v1",
    "configurationVersion": "tenancy-config-v1",
    "fixture": {
      "fixtureId": "tenancy/cross-tenant-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "ok": false,
      "code": "membership_not_found"
    },
    "review": {
      "status": "approved",
      "rationale": "A valid membership belonging to another user cannot authorize the attacker."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "tenancy/foreign-store-under-authorized-org-v1",
    "scenarioId": "tenancy/foreign-store-under-authorized-org-v1",
    "configurationVersion": "tenancy-config-v1",
    "fixture": {
      "fixtureId": "tenancy/cross-tenant-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "ok": false,
      "code": "store_wrong_organization"
    },
    "review": {
      "status": "approved",
      "rationale": "Authorization to one organization cannot be combined with a store belonging to another organization."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "tenancy/nonexistent-store-v1",
    "scenarioId": "tenancy/nonexistent-store-v1",
    "configurationVersion": "tenancy-config-v1",
    "fixture": {
      "fixtureId": "tenancy/cross-tenant-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "ok": false,
      "code": "store_not_found"
    },
    "review": {
      "status": "approved",
      "rationale": "Unknown store identifiers fail closed rather than creating implicit scope."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "tenancy/matching-org-store-control-v1",
    "scenarioId": "tenancy/matching-org-store-control-v1",
    "configurationVersion": "tenancy-config-v1",
    "fixture": {
      "fixtureId": "tenancy/cross-tenant-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "ok": true,
      "context": {
        "userId": "attacker-user",
        "organizationId": "org-a",
        "role": "operator",
        "storeId": "store-a"
      }
    },
    "review": {
      "status": "approved",
      "rationale": "The adversarial matrix also proves that correctly owned organization/store scope remains usable."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "tenancy/context-cannot-cross-selected-store-v1",
    "scenarioId": "tenancy/context-cannot-cross-selected-store-v1",
    "configurationVersion": "tenancy-config-v1",
    "fixture": {
      "fixtureId": "tenancy/cross-tenant-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": false,
    "review": {
      "status": "approved",
      "rationale": "An already-resolved store-scoped context cannot be reused against a different selected store."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "tenancy/operator-membership-escalation-v1",
    "scenarioId": "tenancy/operator-membership-escalation-v1",
    "configurationVersion": "tenancy-config-v1",
    "fixture": {
      "fixtureId": "tenancy/cross-tenant-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": false,
    "review": {
      "status": "approved",
      "rationale": "Operator role cannot escalate into membership administration."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "tenancy/operator-ownership-escalation-v1",
    "scenarioId": "tenancy/operator-ownership-escalation-v1",
    "configurationVersion": "tenancy-config-v1",
    "fixture": {
      "fixtureId": "tenancy/cross-tenant-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": false,
    "review": {
      "status": "approved",
      "rationale": "Operator role cannot transfer organization ownership."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "tenancy/analyst-action-escalation-v1",
    "scenarioId": "tenancy/analyst-action-escalation-v1",
    "configurationVersion": "tenancy-config-v1",
    "fixture": {
      "fixtureId": "tenancy/cross-tenant-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": false,
    "review": {
      "status": "approved",
      "rationale": "Read-only analyst role cannot execute inventory decisions."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "tenancy/service-operation-null-scope-v1",
    "scenarioId": "tenancy/service-operation-null-scope-v1",
    "configurationVersion": "tenancy-config-v1",
    "fixture": {
      "fixtureId": "tenancy/cross-tenant-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": false,
    "review": {
      "status": "approved",
      "rationale": "Privileged service-role work cannot execute without explicit trusted tenant scope."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "tenancy/service-operation-blank-org-v1",
    "scenarioId": "tenancy/service-operation-blank-org-v1",
    "configurationVersion": "tenancy-config-v1",
    "fixture": {
      "fixtureId": "tenancy/cross-tenant-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": false,
    "review": {
      "status": "approved",
      "rationale": "A structurally present but blank organization scope is not trusted tenant scope."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "tenancy/provider-same-external-id-cross-org-v1",
    "scenarioId": "tenancy/provider-same-external-id-cross-org-v1",
    "configurationVersion": "tenancy-config-v1",
    "fixture": {
      "fixtureId": "tenancy/cross-tenant-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": true,
    "review": {
      "status": "approved",
      "rationale": "The same provider external ID in different organizations must produce different durable binding identities."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "tenancy/provider-same-external-id-cross-integration-v1",
    "scenarioId": "tenancy/provider-same-external-id-cross-integration-v1",
    "configurationVersion": "tenancy-config-v1",
    "fixture": {
      "fixtureId": "tenancy/cross-tenant-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": true,
    "review": {
      "status": "approved",
      "rationale": "The same external ID from different integrations cannot collapse into one canonical provider identity."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "tenancy/provider-silent-rebind-conflict-v1",
    "scenarioId": "tenancy/provider-silent-rebind-conflict-v1",
    "configurationVersion": "tenancy-config-v1",
    "fixture": {
      "fixtureId": "tenancy/cross-tenant-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "kind": "result",
      "disposition": "conflict"
    },
    "review": {
      "status": "approved",
      "rationale": "An existing external identity cannot silently rebind to another canonical entity."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "tenancy/provider-cross-org-replay-rejected-v1",
    "scenarioId": "tenancy/provider-cross-org-replay-rejected-v1",
    "configurationVersion": "tenancy-config-v1",
    "fixture": {
      "fixtureId": "tenancy/cross-tenant-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": {
      "kind": "error",
      "message": "Existing provider binding does not match the incoming binding identity."
    },
    "review": {
      "status": "approved",
      "rationale": "An existing binding from one organization cannot be compared as if it belonged to another tenant namespace."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "tenancy/provider-ambiguous-canonical-binding-v1",
    "scenarioId": "tenancy/provider-ambiguous-canonical-binding-v1",
    "configurationVersion": "tenancy-config-v1",
    "fixture": {
      "fixtureId": "tenancy/cross-tenant-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": true,
    "review": {
      "status": "approved",
      "rationale": "One provider resource mapping to multiple canonical entities must be detected as ambiguous."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "tenancy/membership-client-mutation-denied-v1",
    "scenarioId": "tenancy/membership-client-mutation-denied-v1",
    "configurationVersion": "tenancy-config-v1",
    "fixture": {
      "fixtureId": "tenancy/cross-tenant-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": false,
    "review": {
      "status": "approved",
      "rationale": "Membership control cannot be mutated through an ordinary client path."
    }
  },
  {
    "goldenSchemaVersion": 1,
    "id": "tenancy/membership-requires-trusted-server-v1",
    "scenarioId": "tenancy/membership-requires-trusted-server-v1",
    "configurationVersion": "tenancy-config-v1",
    "fixture": {
      "fixtureId": "tenancy/cross-tenant-v1-matrix",
      "fixtureVersion": 1
    },
    "expected": true,
    "review": {
      "status": "approved",
      "rationale": "Membership changes remain behind the trusted server boundary."
    }
  }
];
