import type {
  StoreAgentEvaluationFixture,
} from "@/tests/evaluation/fixture";

export interface TenancyV1EvaluationInput {
  readonly operation: string;
  readonly input: unknown;
}

export interface TenancyV1EvaluationInputCase {
  readonly id: string;
  readonly evaluation:
    TenancyV1EvaluationInput;
}

export const tenancyV1Fixture:
  StoreAgentEvaluationFixture<{
    cases:
      readonly TenancyV1EvaluationInputCase[];
  }> = {
  "fixtureSchemaVersion": 1,
  "id": "tenancy/cross-tenant-v1-matrix",
  "domain": "tenancy",
  "fixtureVersion": 1,
  "description": "Deterministic tenancy V1 evaluation inputs.",
  "input": {
    "cases": [
      {
        "id": "tenancy/unauthenticated-request-v1",
        "evaluation": {
          "operation": "resolve_tenant",
          "input": {
            "identity": null,
            "requested": {
              "organizationId": "org-a"
            },
            "memberships": [
              {
                "userId": "attacker-user",
                "organizationId": "org-a",
                "role": "operator"
              },
              {
                "userId": "other-user",
                "organizationId": "org-b",
                "role": "owner"
              }
            ],
            "stores": [
              {
                "id": "store-a",
                "organizationId": "org-a"
              },
              {
                "id": "store-b",
                "organizationId": "org-b"
              }
            ]
          }
        }
      },
      {
        "id": "tenancy/missing-organization-v1",
        "evaluation": {
          "operation": "resolve_tenant",
          "input": {
            "identity": {
              "userId": "attacker-user"
            },
            "requested": null,
            "memberships": [
              {
                "userId": "attacker-user",
                "organizationId": "org-a",
                "role": "operator"
              },
              {
                "userId": "other-user",
                "organizationId": "org-b",
                "role": "owner"
              }
            ],
            "stores": [
              {
                "id": "store-a",
                "organizationId": "org-a"
              },
              {
                "id": "store-b",
                "organizationId": "org-b"
              }
            ]
          }
        }
      },
      {
        "id": "tenancy/foreign-organization-claim-v1",
        "evaluation": {
          "operation": "resolve_tenant",
          "input": {
            "identity": {
              "userId": "attacker-user"
            },
            "requested": {
              "organizationId": "org-b"
            },
            "memberships": [
              {
                "userId": "attacker-user",
                "organizationId": "org-a",
                "role": "operator"
              },
              {
                "userId": "other-user",
                "organizationId": "org-b",
                "role": "owner"
              }
            ],
            "stores": [
              {
                "id": "store-a",
                "organizationId": "org-a"
              },
              {
                "id": "store-b",
                "organizationId": "org-b"
              }
            ]
          }
        }
      },
      {
        "id": "tenancy/reuse-other-users-membership-v1",
        "evaluation": {
          "operation": "resolve_tenant",
          "input": {
            "identity": {
              "userId": "attacker-user"
            },
            "requested": {
              "organizationId": "org-b"
            },
            "memberships": [
              {
                "userId": "attacker-user",
                "organizationId": "org-a",
                "role": "operator"
              },
              {
                "userId": "other-user",
                "organizationId": "org-b",
                "role": "owner"
              }
            ],
            "stores": [
              {
                "id": "store-a",
                "organizationId": "org-a"
              },
              {
                "id": "store-b",
                "organizationId": "org-b"
              }
            ]
          }
        }
      },
      {
        "id": "tenancy/foreign-store-under-authorized-org-v1",
        "evaluation": {
          "operation": "resolve_tenant",
          "input": {
            "identity": {
              "userId": "attacker-user"
            },
            "requested": {
              "organizationId": "org-a",
              "storeId": "store-b"
            },
            "memberships": [
              {
                "userId": "attacker-user",
                "organizationId": "org-a",
                "role": "operator"
              },
              {
                "userId": "other-user",
                "organizationId": "org-b",
                "role": "owner"
              }
            ],
            "stores": [
              {
                "id": "store-a",
                "organizationId": "org-a"
              },
              {
                "id": "store-b",
                "organizationId": "org-b"
              }
            ]
          }
        }
      },
      {
        "id": "tenancy/nonexistent-store-v1",
        "evaluation": {
          "operation": "resolve_tenant",
          "input": {
            "identity": {
              "userId": "attacker-user"
            },
            "requested": {
              "organizationId": "org-a",
              "storeId": "missing-store"
            },
            "memberships": [
              {
                "userId": "attacker-user",
                "organizationId": "org-a",
                "role": "operator"
              },
              {
                "userId": "other-user",
                "organizationId": "org-b",
                "role": "owner"
              }
            ],
            "stores": [
              {
                "id": "store-a",
                "organizationId": "org-a"
              },
              {
                "id": "store-b",
                "organizationId": "org-b"
              }
            ]
          }
        }
      },
      {
        "id": "tenancy/matching-org-store-control-v1",
        "evaluation": {
          "operation": "resolve_tenant",
          "input": {
            "identity": {
              "userId": "attacker-user"
            },
            "requested": {
              "organizationId": "org-a",
              "storeId": "store-a"
            },
            "memberships": [
              {
                "userId": "attacker-user",
                "organizationId": "org-a",
                "role": "operator"
              },
              {
                "userId": "other-user",
                "organizationId": "org-b",
                "role": "owner"
              }
            ],
            "stores": [
              {
                "id": "store-a",
                "organizationId": "org-a"
              },
              {
                "id": "store-b",
                "organizationId": "org-b"
              }
            ]
          }
        }
      },
      {
        "id": "tenancy/context-cannot-cross-selected-store-v1",
        "evaluation": {
          "operation": "requested_scope_matches",
          "input": {
            "context": {
              "userId": "attacker-user",
              "organizationId": "org-a",
              "role": "operator",
              "storeId": "store-a"
            },
            "requested": {
              "organizationId": "org-a",
              "storeId": "store-b"
            }
          }
        }
      },
      {
        "id": "tenancy/operator-membership-escalation-v1",
        "evaluation": {
          "operation": "role_permission",
          "input": {
            "role": "operator",
            "permission": "members.manage"
          }
        }
      },
      {
        "id": "tenancy/operator-ownership-escalation-v1",
        "evaluation": {
          "operation": "role_permission",
          "input": {
            "role": "operator",
            "permission": "ownership.transfer"
          }
        }
      },
      {
        "id": "tenancy/analyst-action-escalation-v1",
        "evaluation": {
          "operation": "role_permission",
          "input": {
            "role": "analyst",
            "permission": "actions.decide"
          }
        }
      },
      {
        "id": "tenancy/service-operation-null-scope-v1",
        "evaluation": {
          "operation": "service_scope",
          "input": {
            "operation": "export_inventory",
            "scope": null
          }
        }
      },
      {
        "id": "tenancy/service-operation-blank-org-v1",
        "evaluation": {
          "operation": "service_scope",
          "input": {
            "operation": "calculate_forecast",
            "scope": {
              "organizationId": "   ",
              "storeId": null,
              "source": "scheduled_job"
            }
          }
        }
      },
      {
        "id": "tenancy/provider-same-external-id-cross-org-v1",
        "evaluation": {
          "operation": "provider_keys_distinct",
          "input": {
            "first": {
              "organizationId": "org-a",
              "integrationId": "integration-a",
              "provider": "shopify",
              "resourceType": "product_variant",
              "externalId": "gid://shopify/ProductVariant/123"
            },
            "second": {
              "organizationId": "org-b",
              "integrationId": "integration-a",
              "provider": "shopify",
              "resourceType": "product_variant",
              "externalId": "gid://shopify/ProductVariant/123"
            }
          }
        }
      },
      {
        "id": "tenancy/provider-same-external-id-cross-integration-v1",
        "evaluation": {
          "operation": "provider_keys_distinct",
          "input": {
            "first": {
              "organizationId": "org-a",
              "integrationId": "integration-a",
              "provider": "csv",
              "resourceType": "product_variant",
              "externalId": "SKU-123"
            },
            "second": {
              "organizationId": "org-a",
              "integrationId": "integration-b",
              "provider": "csv",
              "resourceType": "product_variant",
              "externalId": "SKU-123"
            }
          }
        }
      },
      {
        "id": "tenancy/provider-silent-rebind-conflict-v1",
        "evaluation": {
          "operation": "provider_replay",
          "input": {
            "existing": {
              "id": "binding-1",
              "organizationId": "org-a",
              "integrationId": "integration-a",
              "provider": "shopify",
              "resourceType": "product_variant",
              "canonicalEntityId": "variant-a",
              "externalId": "gid://shopify/ProductVariant/123",
              "externalParentId": "gid://shopify/Product/10",
              "sourceMetadata": null,
              "createdAt": "2026-10-08T00:00:00.000Z",
              "updatedAt": "2026-10-08T00:00:00.000Z"
            },
            "incoming": {
              "organizationId": "org-a",
              "integrationId": "integration-a",
              "provider": "shopify",
              "resourceType": "product_variant",
              "externalId": "gid://shopify/ProductVariant/123",
              "canonicalEntityId": "variant-b"
            }
          }
        }
      },
      {
        "id": "tenancy/provider-cross-org-replay-rejected-v1",
        "evaluation": {
          "operation": "provider_replay",
          "input": {
            "existing": {
              "id": "binding-1",
              "organizationId": "org-a",
              "integrationId": "integration-a",
              "provider": "shopify",
              "resourceType": "product_variant",
              "canonicalEntityId": "variant-a",
              "externalId": "gid://shopify/ProductVariant/123",
              "externalParentId": "gid://shopify/Product/10",
              "sourceMetadata": null,
              "createdAt": "2026-10-08T00:00:00.000Z",
              "updatedAt": "2026-10-08T00:00:00.000Z"
            },
            "incoming": {
              "organizationId": "org-b",
              "integrationId": "integration-a",
              "provider": "shopify",
              "resourceType": "product_variant",
              "externalId": "gid://shopify/ProductVariant/123",
              "canonicalEntityId": "variant-a"
            }
          }
        }
      },
      {
        "id": "tenancy/provider-ambiguous-canonical-binding-v1",
        "evaluation": {
          "operation": "ambiguous_bindings",
          "input": [
            {
              "integrationId": "integration-a",
              "resourceType": "product_variant",
              "externalId": "123",
              "canonicalEntityId": "variant-a"
            },
            {
              "integrationId": "integration-a",
              "resourceType": "product_variant",
              "externalId": "123",
              "canonicalEntityId": "variant-b"
            }
          ]
        }
      },
      {
        "id": "tenancy/membership-client-mutation-denied-v1",
        "evaluation": {
          "operation": "rls_client_mutation",
          "input": "membership_control"
        }
      },
      {
        "id": "tenancy/membership-requires-trusted-server-v1",
        "evaluation": {
          "operation": "rls_trusted_server_required",
          "input": "membership_control"
        }
      }
    ]
  }
};
