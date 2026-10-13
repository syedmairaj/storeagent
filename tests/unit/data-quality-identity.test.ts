import {
  describe,
  expect,
  it,
} from "vitest";

import {
  buildDataQualityIssueIdentity,
  buildDataQualityIssueKey,
} from "@/lib/data-quality/identity";

import type {
  DataQualityIssueIdentityInput,
  DataQualityIssueSubject,
  DataQualityLocationSubject,
  DataQualityLocationVariantSubject,
  DataQualityOrganizationSubject,
  DataQualityProviderSubject,
  DataQualityStoreSubject,
  DataQualityVariantSubject,
} from "@/lib/data-quality/types";

type AssertNever<T extends never> = T;

type SubjectKeys<T> = T extends unknown
  ? keyof T
  : never;

type ForbiddenIdentityField =
  | "message"
  | "remediationHint"
  | "severity"
  | "status"
  | "sourceContext"
  | "detectedAt"
  | "lastDetectedAt"
  | "resolvedAt"
  | "occurrenceCount"
  | "createdAt"
  | "updatedAt"
  | "rowNumber"
  | "fileName"
  | "filename"
  | "uploadTime"
  | "uploadedAt"
  | "syncRunId"
  | "organizationId"
  | "externalParentId";

type NonProviderSubject =
  | DataQualityOrganizationSubject
  | DataQualityStoreSubject
  | DataQualityLocationSubject
  | DataQualityVariantSubject
  | DataQualityLocationVariantSubject;

type IdentityContractProof = AssertNever<
  | Extract<
      keyof DataQualityIssueIdentityInput,
      ForbiddenIdentityField
    >
  | Extract<
      SubjectKeys<DataQualityIssueSubject>,
      ForbiddenIdentityField
    >
  | Extract<
      SubjectKeys<NonProviderSubject>,
      "integrationId"
    >
>;

type ProviderRequiresIntegrationId =
  "integrationId" extends keyof DataQualityProviderSubject
    ? true
    : never;

const identityContractProof: IdentityContractProof =
  undefined as never;

const providerRequiresIntegrationId: ProviderRequiresIntegrationId =
  true;

void identityContractProof;
void providerRequiresIntegrationId;

function key(
  issueCode: string,
  subject: DataQualityIssueSubject,
): string {
  return buildDataQualityIssueKey({
    issueCode,
    subject,
  });
}

describe(
  "deterministic data quality issue identity",
  () => {
    it(
      "repeats the same semantic identity as the same key",
      () => {
        const input: DataQualityIssueIdentityInput = {
          issueCode: "  MISSING_COST  ",
          subject: {
            kind: "variant",
            variantId: "  variant-uuid  ",
          },
        };

        expect(
          buildDataQualityIssueKey(input),
        ).toBe(
          buildDataQualityIssueKey(input),
        );

        expect(
          buildDataQualityIssueIdentity(input),
        ).toEqual(
          buildDataQualityIssueIdentity(input),
        );
      },
    );

    it(
      "serializes canonical subject scopes as JSON tuples",
      () => {
        expect(
          key(
            "MISSING_COST",
            {
              kind: "variant",
              variantId: "variant-uuid",
            },
          ),
        ).toBe(
          '["dq-v1","MISSING_COST","variant","variant-uuid"]',
        );

        expect(
          key(
            "NEGATIVE_INVENTORY",
            {
              kind: "location_variant",
              variantId: "variant-uuid",
              locationId: "location-uuid",
            },
          ),
        ).toBe(
          '["dq-v1","NEGATIVE_INVENTORY","location_variant","location-uuid","variant-uuid"]',
        );

        expect(
          key(
            "ORG_SETUP",
            { kind: "organization" },
          ),
        ).toBe(
          '["dq-v1","ORG_SETUP","organization"]',
        );

        expect(
          key(
            "STORE_SETUP",
            {
              kind: "store",
              storeId: "store-uuid",
            },
          ),
        ).toBe(
          '["dq-v1","STORE_SETUP","store","store-uuid"]',
        );

        expect(
          key(
            "LOCATION_SETUP",
            {
              kind: "location",
              locationId: "location-uuid",
            },
          ),
        ).toBe(
          '["dq-v1","LOCATION_SETUP","location","location-uuid"]',
        );

        expect(
          key(
            "RELATIONSHIP_UNRESOLVED",
            {
              kind: "provider",
              integrationId: "integration-uuid",
              provider: "csv",
              resourceType: "product_variant",
              externalId: "external-id",
            },
          ),
        ).toBe(
          '["dq-v1","RELATIONSHIP_UNRESOLVED","provider","integration-uuid","csv","product_variant","external-id"]',
        );
      },
    );

    it(
      "changes the key when the issue code changes",
      () => {
        const subject: DataQualityIssueSubject = {
          kind: "variant",
          variantId: "variant-uuid",
        };

        expect(
          key("MISSING_COST", subject),
        ).not.toBe(
          key("MISSING_PRICE", subject),
        );
      },
    );

    it(
      "changes the key when the subject changes",
      () => {
        expect(
          key(
            "MISSING_COST",
            {
              kind: "variant",
              variantId: "variant-a",
            },
          ),
        ).not.toBe(
          key(
            "MISSING_COST",
            {
              kind: "variant",
              variantId: "variant-b",
            },
          ),
        );

        expect(
          key(
            "MISSING_COST",
            {
              kind: "variant",
              variantId: "same-uuid",
            },
          ),
        ).not.toBe(
          key(
            "MISSING_COST",
            {
              kind: "location",
              locationId: "same-uuid",
            },
          ),
        );
      },
    );

    it(
      "keeps location before variant in a fixed tuple order",
      () => {
        const issueKey = key(
          "NEGATIVE_INVENTORY",
          {
            kind: "location_variant",
            variantId: "variant-uuid",
            locationId: "location-uuid",
          },
        );

        expect(
          JSON.parse(issueKey),
        ).toEqual([
          "dq-v1",
          "NEGATIVE_INVENTORY",
          "location_variant",
          "location-uuid",
          "variant-uuid",
        ]);

        expect(issueKey).not.toBe(
          key(
            "NEGATIVE_INVENTORY",
            {
              kind: "location_variant",
              locationId: "variant-uuid",
              variantId: "location-uuid",
            },
          ),
        );
      },
    );

    it(
      "repeats the same provider binding identity as the same key",
      () => {
        const first = key(
          "RELATIONSHIP_UNRESOLVED",
          {
            kind: "provider",
            integrationId: "integration-uuid",
            provider: "csv",
            resourceType: "product_variant",
            externalId: "external-id",
          },
        );

        const second = key(
          "RELATIONSHIP_UNRESOLVED",
          {
            kind: "provider",
            integrationId: "integration-uuid",
            provider: "csv",
            resourceType: "product_variant",
            externalId: "external-id",
          },
        );

        expect(first).toBe(second);
        expect(first).toBe(
          '["dq-v1","RELATIONSHIP_UNRESOLVED","provider","integration-uuid","csv","product_variant","external-id"]',
        );
      },
    );

    it(
      "separates integration, provider, resource, and external identity",
      () => {
        const base = {
          kind: "provider" as const,
          integrationId: "integration-uuid",
          provider: "csv" as const,
          resourceType: "product_variant" as const,
          externalId: "external-id",
        };

        const original = key(
          "RELATIONSHIP_UNRESOLVED",
          base,
        );

        expect(original).not.toBe(
          key(
            "RELATIONSHIP_UNRESOLVED",
            {
              ...base,
              integrationId: "other-integration",
            },
          ),
        );

        expect(original).not.toBe(
          key(
            "RELATIONSHIP_UNRESOLVED",
            {
              ...base,
              provider: "shopify",
            },
          ),
        );

        expect(original).not.toBe(
          key(
            "RELATIONSHIP_UNRESOLVED",
            {
              ...base,
              resourceType: "product",
            },
          ),
        );

        expect(original).not.toBe(
          key(
            "RELATIONSHIP_UNRESOLVED",
            {
              ...base,
              externalId: "other-external-id",
            },
          ),
        );
      },
    );

    it(
      "normalizes integration id whitespace and preserves case",
      () => {
        expect(
          key(
            "RELATIONSHIP_UNRESOLVED",
            {
              kind: "provider",
              integrationId: "  Integration-UUID  ",
              provider: "csv",
              resourceType: "product_variant",
              externalId: "  External-ID  ",
            },
          ),
        ).toBe(
          '["dq-v1","RELATIONSHIP_UNRESOLVED","provider","Integration-UUID","csv","product_variant","External-ID"]',
        );

        expect(
          key(
            "RELATIONSHIP_UNRESOLVED",
            {
              kind: "provider",
              integrationId: "Integration-UUID",
              provider: "csv",
              resourceType: "product_variant",
              externalId: "External-ID",
            },
          ),
        ).not.toBe(
          key(
            "RELATIONSHIP_UNRESOLVED",
            {
              kind: "provider",
              integrationId: "integration-uuid",
              provider: "csv",
              resourceType: "product_variant",
              externalId: "external-id",
            },
          ),
        );

        expect(() =>
          key(
            "RELATIONSHIP_UNRESOLVED",
            {
              kind: "provider",
              integrationId: "   ",
              provider: "csv",
              resourceType: "product_variant",
              externalId: "external-id",
            },
          ),
        ).toThrow(
          "Integration ID must not be blank.",
        );
      },
    );

    it(
      "trims surrounding whitespace and preserves case",
      () => {
        expect(
          key(
            "  Missing_Cost  ",
            {
              kind: "variant",
              variantId: "  Variant-UUID  ",
            },
          ),
        ).toBe(
          '["dq-v1","Missing_Cost","variant","Variant-UUID"]',
        );

        expect(
          key(
            "Missing_Cost",
            {
              kind: "variant",
              variantId: "Variant-UUID",
            },
          ),
        ).not.toBe(
          key(
            "MISSING_COST",
            {
              kind: "variant",
              variantId: "variant-uuid",
            },
          ),
        );
      },
    );

    it(
      "keeps delimiter characters inside one identity component",
      () => {
        const issueKey = key(
          'CODE","QUOTE',
          {
            kind: "location_variant",
            locationId: 'loc","id',
            variantId: "var]id",
          },
        );

        expect(
          JSON.parse(issueKey),
        ).toEqual([
          "dq-v1",
          'CODE","QUOTE',
          "location_variant",
          'loc","id',
          "var]id",
        ]);

        expect(
          key(
            "CODE",
            {
              kind: "location_variant",
              locationId: "a,b",
              variantId: "c",
            },
          ),
        ).not.toBe(
          key(
            "CODE",
            {
              kind: "location_variant",
              locationId: "a",
              variantId: "b,c",
            },
          ),
        );
      },
    );

    it(
      "rejects blank identity text and invalid scopes",
      () => {
        expect(() =>
          key(
            "   ",
            { kind: "organization" },
          ),
        ).toThrow(
          "Issue code must not be blank.",
        );

        expect(() =>
          key(
            "MISSING_COST",
            {
              kind: "variant",
              variantId: "   ",
            },
          ),
        ).toThrow(
          "Variant ID must not be blank.",
        );

        expect(() =>
          key(
            "RELATIONSHIP_UNRESOLVED",
            {
              kind: "provider",
              integrationId: "integration-uuid",
              provider: "csv",
              resourceType: "product_variant",
              externalId: "  ",
            },
          ),
        ).toThrow(
          "Provider external ID must not be blank.",
        );

        expect(() =>
          key(
            "RELATIONSHIP_UNRESOLVED",
            {
              kind: "provider",
              integrationId: "integration-uuid",
              provider: "CSV" as "csv",
              resourceType: "product_variant",
              externalId: "external-id",
            },
          ),
        ).toThrow(
          "Provider type is not a stable provider identity.",
        );

        expect(() =>
          key(
            "RELATIONSHIP_UNRESOLVED",
            {
              kind: "provider",
              integrationId: "integration-uuid",
              provider: "csv",
              resourceType: "variant" as "product_variant",
              externalId: "external-id",
            },
          ),
        ).toThrow(
          "Provider resource type is not a stable provider identity.",
        );

        expect(() =>
          buildDataQualityIssueKey({
            issueCode: "MISSING_COST",
            subject: {
              kind: "organization",
              storeId: "store-uuid",
            },
          } as DataQualityIssueIdentityInput),
        ).toThrow(
          "Data quality issue identity scope is invalid.",
        );

        expect(() =>
          buildDataQualityIssueKey({
            issueCode: "MISSING_COST",
            subject: {
              kind: "location_variant",
              locationId: "location-uuid",
            },
          } as DataQualityIssueIdentityInput),
        ).toThrow(
          "Data quality issue identity scope is invalid.",
        );

        expect(() =>
          buildDataQualityIssueKey({
            issueCode: "MISSING_COST",
            subject: {
              kind: "variant",
              variantId: "variant-uuid",
              locationId: "location-uuid",
            },
          } as DataQualityIssueIdentityInput),
        ).toThrow(
          "Data quality issue identity scope is invalid.",
        );

        expect(() =>
          buildDataQualityIssueKey({
            issueCode: "MISSING_COST",
            message: "missing cost",
            subject: {
              kind: "organization",
            },
          } as DataQualityIssueIdentityInput),
        ).toThrow(
          "Data quality issue identity scope is invalid.",
        );
      },
    );
  },
);
