import {
  describe,
  expect,
  it,
} from "vitest";

import {
  runTenancyAdversarialCase,
} from "@/tests/evaluation/tenancy-adversarial-runner";

import {
  CROSS_TENANT_V1_MATRIX,
} from "@/tests/evaluation/tenancy-matrix";

describe(
  "StoreAgent cross-tenant adversarial evaluation matrix",
  () => {
    for (
      const scenario
      of CROSS_TENANT_V1_MATRIX
    ) {
      it(
        scenario.id,
        () => {
          expect(
            runTenancyAdversarialCase(
              scenario.evaluation,
            ),
          ).toEqual(
            scenario.evaluation
              .expected,
          );
        },
      );
    }

    it(
      "contains unique stable attack IDs",
      () => {
        const ids =
          CROSS_TENANT_V1_MATRIX.map(
            (scenario) =>
              scenario.id,
          );

        expect(
          new Set(ids).size,
        ).toBe(
          ids.length,
        );
      },
    );

    it(
      "requires every attack scenario to state the invariant it protects",
      () => {
        for (
          const scenario
          of CROSS_TENANT_V1_MATRIX
        ) {
          expect(
            scenario.protects.trim()
              .length,
          ).toBeGreaterThan(0);
        }
      },
    );

    it(
      "covers organization and store boundary attacks",
      () => {
        const ids =
          new Set(
            CROSS_TENANT_V1_MATRIX.map(
              (scenario) =>
                scenario.id,
            ),
          );

        for (
          const id of [
            "tenancy/foreign-organization-claim-v1",
            "tenancy/reuse-other-users-membership-v1",
            "tenancy/foreign-store-under-authorized-org-v1",
            "tenancy/context-cannot-cross-selected-store-v1",
          ]
        ) {
          expect(
            ids.has(id),
            `Missing ${id}`,
          ).toBe(true);
        }
      },
    );

    it(
      "covers provider namespace and rebinding attacks",
      () => {
        const ids =
          new Set(
            CROSS_TENANT_V1_MATRIX.map(
              (scenario) =>
                scenario.id,
            ),
          );

        for (
          const id of [
            "tenancy/provider-same-external-id-cross-org-v1",
            "tenancy/provider-silent-rebind-conflict-v1",
            "tenancy/provider-cross-org-replay-rejected-v1",
            "tenancy/provider-ambiguous-canonical-binding-v1",
          ]
        ) {
          expect(
            ids.has(id),
            `Missing ${id}`,
          ).toBe(true);
        }
      },
    );

    it(
      "covers privilege and service-role escalation attacks",
      () => {
        const ids =
          new Set(
            CROSS_TENANT_V1_MATRIX.map(
              (scenario) =>
                scenario.id,
            ),
          );

        for (
          const id of [
            "tenancy/operator-membership-escalation-v1",
            "tenancy/operator-ownership-escalation-v1",
            "tenancy/analyst-action-escalation-v1",
            "tenancy/service-operation-null-scope-v1",
            "tenancy/service-operation-blank-org-v1",
          ]
        ) {
          expect(
            ids.has(id),
            `Missing ${id}`,
          ).toBe(true);
        }
      },
    );

    it(
      "contains an authorized positive control",
      () => {
        expect(
          CROSS_TENANT_V1_MATRIX.some(
            (scenario) =>
              scenario.id ===
              "tenancy/matching-org-store-control-v1",
          ),
        ).toBe(true);
      },
    );
  },
);
