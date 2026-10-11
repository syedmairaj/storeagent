import {
  describe,
  expect,
  it,
} from "vitest";

import {
  resolveTenantContext,
} from "@/lib/tenancy/resolve-context";

import {
  assertServiceOperationScope,
  serviceOperationHasTrustedScope,
} from "@/lib/tenancy/service-role-policy";

import {
  allowsClientMutation,
  rlsProfileFor,
} from "@/lib/tenancy/rls-policy";

import {
  publicErrorFromUnknown,
} from "@/lib/observability/public-error";

import {
  redactObservabilityValue,
} from "@/lib/observability/redact";

const userA = {
  userId:
    "user-a",
};

const userB = {
  userId:
    "user-b",
};

const memberships = [
  {
    userId:
      "user-a",

    organizationId:
      "org-a",

    role:
      "owner" as const,
  },
  {
    userId:
      "user-b",

    organizationId:
      "org-b",

    role:
      "owner" as const,
  },
];

const stores = [
  {
    id:
      "store-a",

    organizationId:
      "org-a",
  },
  {
    id:
      "store-b",

    organizationId:
      "org-b",
  },
];

describe(
  "M1 foundation integration matrix",
  () => {
    it(
      "denies tenant resolution without authenticated identity",
      () => {
        expect(
          resolveTenantContext({
            identity:
              null,

            requested: {
              organizationId:
                "org-a",
            },

            memberships,
            stores,
          }),
        ).toEqual({
          ok:
            false,

          code:
            "unauthenticated",
        });
      },
    );

    it(
      "requires explicit organization selection",
      () => {
        expect(
          resolveTenantContext({
            identity:
              userA,

            requested:
              null,

            memberships,
            stores,
          }),
        ).toEqual({
          ok:
            false,

          code:
            "organization_required",
        });
      },
    );

    it(
      "allows User A to resolve only matching Org A membership",
      () => {
        expect(
          resolveTenantContext({
            identity:
              userA,

            requested: {
              organizationId:
                "org-a",
            },

            memberships,
            stores,
          }),
        ).toEqual({
          ok:
            true,

          context: {
            userId:
              "user-a",

            organizationId:
              "org-a",

            role:
              "owner",

            storeId:
              null,
          },
        });
      },
    );

    it(
      "rejects forged Org B selection by User A",
      () => {
        expect(
          resolveTenantContext({
            identity:
              userA,

            requested: {
              organizationId:
                "org-b",
            },

            memberships,
            stores,
          }),
        ).toEqual({
          ok:
            false,

          code:
            "membership_not_found",
        });
      },
    );

    it(
      "does not authorize User A using User B membership",
      () => {
        expect(
          resolveTenantContext({
            identity:
              userA,

            requested: {
              organizationId:
                "org-b",
            },

            memberships: [
              memberships[1],
            ],

            stores,
          }),
        ).toEqual({
          ok:
            false,

          code:
            "membership_not_found",
        });
      },
    );

    it(
      "allows Store A only after Org A membership resolves",
      () => {
        expect(
          resolveTenantContext({
            identity:
              userA,

            requested: {
              organizationId:
                "org-a",

              storeId:
                "store-a",
            },

            memberships,
            stores,
          }),
        ).toEqual({
          ok:
            true,

          context: {
            userId:
              "user-a",

            organizationId:
              "org-a",

            role:
              "owner",

            storeId:
              "store-a",
          },
        });
      },
    );

    it(
      "rejects foreign Store B under authorized Org A",
      () => {
        expect(
          resolveTenantContext({
            identity:
              userA,

            requested: {
              organizationId:
                "org-a",

              storeId:
                "store-b",
            },

            memberships,
            stores,
          }),
        ).toEqual({
          ok:
            false,

          code:
            "store_wrong_organization",
        });
      },
    );

    it(
      "does not let foreign store identity establish tenant ownership",
      () => {
        expect(
          resolveTenantContext({
            identity:
              userA,

            requested: {
              organizationId:
                "org-b",

              storeId:
                "store-b",
            },

            memberships,
            stores,
          }),
        ).toEqual({
          ok:
            false,

          code:
            "membership_not_found",
        });
      },
    );

    it(
      "keeps all frozen foundation RLS profiles mutation-denied",
      () => {
        for (
          const tableClass of [
            "tenant_current_state",
            "tenant_immutable_history",
            "membership_control",
            "sensitive_configuration",
          ] as const
        ) {
          expect(
            allowsClientMutation(
              rlsProfileFor(
                tableClass,
              ),
            ),
          ).toBe(false);
        }
      },
    );

    it(
      "requires trusted tenant scope for privileged service operations",
      () => {
        expect(
          serviceOperationHasTrustedScope({
            operation:
              "foundation-test",

            scope:
              null,
          }),
        ).toBe(false);

        expect(() =>
          assertServiceOperationScope({
            operation:
              "foundation-test",

            scope:
              null,
          }),
        ).toThrow(
          "requires trusted tenant scope",
        );
      },
    );

    it(
      "accepts already-trusted explicit service scope",
      () => {
        expect(
          serviceOperationHasTrustedScope({
            operation:
              "foundation-test",

            scope: {
              organizationId:
                "org-a",

              storeId:
                null,

              source:
                "resolved_tenant_context",
            },
          }),
        ).toBe(true);
      },
    );

    it(
      "maps unknown internal failures to safe public errors",
      () => {
        const payload =
          publicErrorFromUnknown(
            new Error(
              "postgres password=secret internal stack",
            ),
            "request-123",
          );

        expect(
          payload,
        ).toEqual({
          error: {
            code:
              "INTERNAL_ERROR",

            message:
              "Something went wrong. Please try again.",

            requestId:
              "request-123",
          },
        });

        expect(
          JSON.stringify(
            payload,
          ),
        ).not.toContain(
          "postgres",
        );
      },
    );

    it(
      "redacts sensitive values while preserving trusted correlation context",
      () => {
        expect(
          redactObservabilityValue({
            requestId:
              "request-123",

            organizationId:
              "org-a",

            authorization:
              "Bearer secret-token",

            cookie:
              "sb-session=secret",

            password:
              "secret-password",
          }),
        ).toEqual({
          requestId:
            "request-123",

          organizationId:
            "org-a",

          authorization:
            "[REDACTED]",

          cookie:
            "[REDACTED]",

          password:
            "[REDACTED]",
        });
      },
    );

    it(
      "applies the same isolation rules symmetrically to User B",
      () => {
        expect(
          resolveTenantContext({
            identity:
              userB,

            requested: {
              organizationId:
                "org-a",
            },

            memberships,
            stores,
          }),
        ).toEqual({
          ok:
            false,

          code:
            "membership_not_found",
        });

        expect(
          resolveTenantContext({
            identity:
              userB,

            requested: {
              organizationId:
                "org-b",
            },

            memberships,
            stores,
          }).ok,
        ).toBe(true);
      },
    );
  },
);
