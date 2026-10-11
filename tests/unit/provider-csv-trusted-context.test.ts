import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  Integration,
  IntegrationStatus,
} from "@/lib/commerce-domain/types";

import {
  buildCsvTrustedImportContext,
  requireCsvStoreScopedContext,
} from "@/lib/providers/csv/trusted-context";

function integration(
  overrides:
    Partial<Integration> = {},
): Integration {
  return {
    id:
      "integration-1",

    organizationId:
      "org-1",

    storeId:
      "store-1",

    provider:
      "csv",

    status:
      "active",

    displayName:
      "CSV Import",

    configuration:
      null,

    createdAt:
      "2026-10-11T00:00:00.000Z",

    updatedAt:
      "2026-10-11T00:00:00.000Z",

    ...overrides,
  };
}

describe(
  "CSV trusted import context",
  () => {
    it(
      "builds trusted integration-binding scope from canonical integration",
      () => {
        expect(
          buildCsvTrustedImportContext(
            integration(),
            "org-1",
          ),
        ).toEqual({
          organizationId:
            "org-1",

          integrationId:
            "integration-1",

          storeId:
            "store-1",

          provider:
            "csv",

          scope: {
            organizationId:
              "org-1",

            storeId:
              "store-1",

            source:
              "integration_binding",
          },
        });
      },
    );

    it(
      "rejects cross-organization integration",
      () => {
        expect(() =>
          buildCsvTrustedImportContext(
            integration({
              organizationId:
                "org-2",
            }),
            "org-1",
          ),
        ).toThrow(
          "CSV integration does not belong to the trusted organization.",
        );
      },
    );

    it(
      "rejects non-CSV integration",
      () => {
        expect(() =>
          buildCsvTrustedImportContext(
            integration({
              provider:
                "shopify",
            }),
            "org-1",
          ),
        ).toThrow(
          'CSV import requires integration provider "csv".',
        );
      },
    );

    it.each([
      "pending",
      "degraded",
      "disconnected",
      "revoked",
      "error",
    ] as const satisfies
      readonly IntegrationStatus[])(
      "rejects non-active integration status %s",
      (
        status,
      ) => {
        expect(() =>
          buildCsvTrustedImportContext(
            integration({
              status,
            }),
            "org-1",
          ),
        ).toThrow(
          `CSV integration must be active; received "${status}".`,
        );
      },
    );

    it(
      "permits organization-scoped active CSV integration",
      () => {
        const result =
          buildCsvTrustedImportContext(
            integration({
              storeId:
                null,
            }),
            "org-1",
          );

        expect(
          result.storeId,
        ).toBeNull();

        expect(
          result.scope,
        ).toEqual({
          organizationId:
            "org-1",

          storeId:
            null,

          source:
            "integration_binding",
        });
      },
    );

    it(
      "allows store-scoped canonical work only when integration owns store scope",
      () => {
        const context =
          requireCsvStoreScopedContext(
            buildCsvTrustedImportContext(
              integration(),
              "org-1",
            ),
          );

        expect(
          context.storeId,
        ).toBe(
          "store-1",
        );
      },
    );

    it(
      "does not let organization-scoped integration manufacture store authorization",
      () => {
        const context =
          buildCsvTrustedImportContext(
            integration({
              storeId:
                null,
            }),
            "org-1",
          );

        expect(() =>
          requireCsvStoreScopedContext(
            context,
          ),
        ).toThrow(
          "CSV store-scoped import requires a store-scoped trusted integration.",
        );
      },
    );

    it(
      "rejects blank expected organization",
      () => {
        expect(() =>
          buildCsvTrustedImportContext(
            integration(),
            " ",
          ),
        ).toThrow(
          "organizationId must not be empty.",
        );
      },
    );
  },
);
