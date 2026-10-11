import {
  describe,
  expect,
  it,
} from "vitest";

import {
  resolveTenantContext,
} from "@/lib/tenancy/resolve-context";

const memberships = [
  {
    userId:
      "attacker-a",

    organizationId:
      "org-a",

    role:
      "owner" as const,
  },
  {
    userId:
      "victim-b",

    organizationId:
      "org-b",

    role:
      "admin" as const,
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
  "M1 adversarial tenant matrix",
  () => {
    const attacks = [
      {
        name:
          "anonymous claims Org A",

        identity:
          null,

        requested: {
          organizationId:
            "org-a",
        },

        expected:
          "unauthenticated",
      },
      {
        name:
          "User A claims Org B",

        identity: {
          userId:
            "attacker-a",
        },

        requested: {
          organizationId:
            "org-b",
        },

        expected:
          "membership_not_found",
      },
      {
        name:
          "User A claims Store B through Org A",

        identity: {
          userId:
            "attacker-a",
        },

        requested: {
          organizationId:
            "org-a",

          storeId:
            "store-b",
        },

        expected:
          "store_wrong_organization",
      },
      {
        name:
          "User A claims Store B and Org B",

        identity: {
          userId:
            "attacker-a",
        },

        requested: {
          organizationId:
            "org-b",

          storeId:
            "store-b",
        },

        expected:
          "membership_not_found",
      },
      {
        name:
          "User B claims Org A",

        identity: {
          userId:
            "victim-b",
        },

        requested: {
          organizationId:
            "org-a",
        },

        expected:
          "membership_not_found",
      },
    ] as const;

    for (
      const attack of attacks
    ) {
      it(
        `fails closed: ${attack.name}`,
        () => {
          const result =
            resolveTenantContext({
              identity:
                attack.identity,

              requested:
                attack.requested,

              memberships,
              stores,
            });

          expect(
            result,
          ).toEqual({
            ok:
              false,

            code:
              attack.expected,
          });
        },
      );
    }

    it(
      "does not treat globally known store id as authorization",
      () => {
        const result =
          resolveTenantContext({
            identity: {
              userId:
                "attacker-a",
            },

            requested: {
              organizationId:
                "org-b",

              storeId:
                "store-b",
            },

            memberships,
            stores,
          });

        expect(
          result.ok,
        ).toBe(false);
      },
    );
  },
);
