import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  ProviderBinding,
} from "@/lib/commerce-domain/types";

import {
  planProviderBindingReconciliation,
} from "@/lib/providers/binding-reconciliation";

const existing:
  ProviderBinding = {
    id:
      "binding-1",

    organizationId:
      "org-1",

    integrationId:
      "integration-1",

    provider:
      "csv",

    resourceType:
      "product_variant",

    canonicalEntityId:
      "variant-1",

    externalId:
      "SKU-AbC",

    externalParentId:
      "product-1",

    sourceMetadata: {
      source:
        "original",
    },

    createdAt:
      "2026-10-11T00:00:00.000Z",

    updatedAt:
      "2026-10-11T00:00:00.000Z",
  };

describe(
  "provider binding reconciliation planning",
  () => {
    it(
      "plans create when no binding exists",
      () => {
        const result =
          planProviderBindingReconciliation(
            null,
            {
              organizationId:
                " org-1 ",

              integrationId:
                " integration-1 ",

              provider:
                "csv",

              resourceType:
                "product_variant",

              externalId:
                " SKU-AbC ",

              externalParentId:
                " product-1 ",

              canonicalEntityId:
                " variant-1 ",

              sourceMetadata: {
                file:
                  "catalog.csv",
              },
            },
          );

        expect(
          result.disposition,
        ).toBe(
          "create",
        );

        if (
          result.disposition ===
          "create"
        ) {
          expect(
            result.identity,
          ).toEqual({
            organizationId:
              "org-1",

            integrationId:
              "integration-1",

            provider:
              "csv",

            resourceType:
              "product_variant",

            externalId:
              "SKU-AbC",
          });

          expect(
            result.mutableMetadata
              .externalParentId,
          ).toBe(
            "product-1",
          );
        }
      },
    );

    it(
      "classifies same binding and canonical target as idempotent",
      () => {
        const result =
          planProviderBindingReconciliation(
            existing,
            {
              organizationId:
                "org-1",

              integrationId:
                "integration-1",

              provider:
                "csv",

              resourceType:
                "product_variant",

              externalId:
                "SKU-AbC",

              externalParentId:
                "product-1",

              canonicalEntityId:
                "variant-1",

              sourceMetadata: {
                source:
                  "original",
              },
            },
          );

        expect(
          result,
        ).toMatchObject({
          disposition:
            "idempotent",

          canonicalEntityId:
            "variant-1",

          metadataChanged:
            false,
        });
      },
    );

    it(
      "allows external parent metadata reconciliation without changing identity",
      () => {
        const result =
          planProviderBindingReconciliation(
            existing,
            {
              organizationId:
                "org-1",

              integrationId:
                "integration-1",

              provider:
                "csv",

              resourceType:
                "product_variant",

              externalId:
                "SKU-AbC",

              externalParentId:
                "product-2",

              canonicalEntityId:
                "variant-1",

              sourceMetadata:
                existing.sourceMetadata,
            },
          );

        expect(
          result,
        ).toMatchObject({
          disposition:
            "idempotent",
          metadataChanged:
            true,
          mutableMetadata: {
            externalParentId:
              "product-2",
          },
        });
      },
    );

    it(
      "allows source metadata reconciliation without changing durable identity",
      () => {
        const result =
          planProviderBindingReconciliation(
            existing,
            {
              organizationId:
                "org-1",

              integrationId:
                "integration-1",

              provider:
                "csv",

              resourceType:
                "product_variant",

              externalId:
                "SKU-AbC",

              externalParentId:
                "product-1",

              canonicalEntityId:
                "variant-1",

              sourceMetadata: {
                source:
                  "replayed",
              },
            },
          );

        expect(
          result.disposition,
        ).toBe(
          "idempotent",
        );

        if (
          result.disposition ===
          "idempotent"
        ) {
          expect(
            result.metadataChanged,
          ).toBe(true);
        }
      },
    );

    it(
      "fails closed on attempted canonical rebinding",
      () => {
        const result =
          planProviderBindingReconciliation(
            existing,
            {
              organizationId:
                "org-1",

              integrationId:
                "integration-1",

              provider:
                "csv",

              resourceType:
                "product_variant",

              externalId:
                "SKU-AbC",

              externalParentId:
                "product-1",

              canonicalEntityId:
                "variant-2",

              sourceMetadata:
                null,
            },
          );

        expect(
          result,
        ).toMatchObject({
          disposition:
            "conflict",

          existingCanonicalEntityId:
            "variant-1",

          incomingCanonicalEntityId:
            "variant-2",
        });
      },
    );

    it(
      "rejects unrelated organization comparison",
      () => {
        expect(() =>
          planProviderBindingReconciliation(
            existing,
            {
              organizationId:
                "org-2",

              integrationId:
                "integration-1",

              provider:
                "csv",

              resourceType:
                "product_variant",

              externalId:
                "SKU-AbC",

              externalParentId:
                null,

              canonicalEntityId:
                "variant-1",

              sourceMetadata:
                null,
            },
          ),
        ).toThrow(
          "Existing provider binding does not match the incoming binding identity.",
        );
      },
    );

    it(
      "rejects unrelated integration comparison",
      () => {
        expect(() =>
          planProviderBindingReconciliation(
            existing,
            {
              organizationId:
                "org-1",

              integrationId:
                "integration-2",

              provider:
                "csv",

              resourceType:
                "product_variant",

              externalId:
                "SKU-AbC",

              externalParentId:
                null,

              canonicalEntityId:
                "variant-1",

              sourceMetadata:
                null,
            },
          ),
        ).toThrow();
      },
    );

    it(
      "rejects unrelated resource type comparison",
      () => {
        expect(() =>
          planProviderBindingReconciliation(
            existing,
            {
              organizationId:
                "org-1",

              integrationId:
                "integration-1",

              provider:
                "csv",

              resourceType:
                "product",

              externalId:
                "SKU-AbC",

              externalParentId:
                null,

              canonicalEntityId:
                "variant-1",

              sourceMetadata:
                null,
            },
          ),
        ).toThrow();
      },
    );

    it(
      "preserves external ID case",
      () => {
        const result =
          planProviderBindingReconciliation(
            null,
            {
              organizationId:
                "org-1",

              integrationId:
                "integration-1",

              provider:
                "csv",

              resourceType:
                "product_variant",

              externalId:
                "Sku-AbC",

              externalParentId:
                null,

              canonicalEntityId:
                "variant-1",

              sourceMetadata:
                null,
            },
          );

        expect(
          result.disposition,
        ).toBe("create");

        if (
          result.disposition ===
          "create"
        ) {
          expect(
            result.identity
              .externalId,
          ).toBe(
            "Sku-AbC",
          );
        }
      },
    );
  },
);
