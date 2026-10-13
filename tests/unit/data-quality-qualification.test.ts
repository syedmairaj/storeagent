import {
  describe,
  expect,
  it,
} from "vitest";

import {
  buildDataQualityIssueKey,
} from "@/lib/data-quality/identity";

import {
  M4_4_DATA_QUALITY_SEVERITY_POLICY,
  qualifyDataQualityObservation,
} from "@/lib/data-quality/qualification";

import type { DataQualityIssueSubject } from "@/lib/data-quality/types";

import type {
  DataQualityObservation,
  DataQualityQualificationResult,
} from "@/lib/data-quality/qualification";

import type {
  ProviderNormalizationIssue,
  ProviderReconciliationContext,
  ProviderReconciliationReasonCode,
} from "@/lib/providers/types";

type AssertNever<T extends never> = T;

type ProviderSubject = Extract<
  DataQualityIssueSubject,
  { kind: "provider" }
>;

type ParentIsNotProviderIdentity = AssertNever<
  Extract<keyof ProviderSubject, "externalParentId">
>;

const parentIsNotProviderIdentity: ParentIsNotProviderIdentity =
  undefined as never;

void parentIsNotProviderIdentity;

function issue(
  code: ProviderNormalizationIssue["code"],
  message = "normalization issue",
): ProviderNormalizationIssue {
  return {
    code,
    message,
    field: null,
  };
}

function reconciliation(
  reasonCode: ProviderReconciliationReasonCode,
  issues: readonly ProviderNormalizationIssue[] = [],
  externalId: string | null = "external-id",
  externalParentId: string | null = null,
): ProviderReconciliationContext {
  return {
    provider: "csv",
    resourceType: "product_variant",
    externalId,
    externalParentId,
    adapterVersion: "csv-variant-v1",
    reasonCode,
    issues,
  };
}

function qualifyProvider(
  reasonCode: ProviderReconciliationReasonCode,
  issues: readonly ProviderNormalizationIssue[] = [],
  overrides: Partial<
    ProviderReconciliationContext
  > = {},
): DataQualityQualificationResult {
  return qualifyDataQualityObservation({
    kind: "provider_reconciliation",
    integrationId: "integration-uuid",
    reconciliation: {
      ...reconciliation(
        reasonCode,
        issues,
      ),
      ...overrides,
    },
  });
}

describe(
  "data quality qualification",
  () => {
    it(
      "qualifies binding conflicts as durable critical issues",
      () => {
        const result = qualifyProvider(
          "BINDING_CONFLICT",
        );

        expect(result).toMatchObject({
          disposition: "durable_issue",
          issueCode: "BINDING_CONFLICT",
          severity:
            M4_4_DATA_QUALITY_SEVERITY_POLICY.BINDING_CONFLICT,
        });

        expect(
          M4_4_DATA_QUALITY_SEVERITY_POLICY.BINDING_CONFLICT,
        ).toBe("critical");
      },
    );

    it(
      "qualifies ambiguous identity as a durable issue",
      () => {
        expect(
          qualifyProvider(
            "IDENTITY_AMBIGUOUS",
          ),
        ).toMatchObject({
          disposition: "durable_issue",
          issueCode: "IDENTITY_AMBIGUOUS",
          severity: "high",
        });
      },
    );

    it(
      "qualifies unresolved relationships from the reason or issue code",
      () => {
        expect(
          qualifyProvider(
            "RELATIONSHIP_UNRESOLVED",
          ),
        ).toMatchObject({
          disposition: "durable_issue",
          issueCode: "RELATIONSHIP_UNRESOLVED",
          severity: "high",
        });

        expect(
          qualifyProvider(
            "NORMALIZATION_QUARANTINED",
            [
              issue(
                "RELATIONSHIP_UNRESOLVED",
              ),
            ],
          ),
        ).toMatchObject({
          disposition: "durable_issue",
          issueCode: "RELATIONSHIP_UNRESOLVED",
          severity: "high",
        });
      },
    );

    it(
      "qualifies ambiguous inventory semantics as a durable issue",
      () => {
        expect(
          qualifyProvider(
            "NORMALIZATION_QUARANTINED",
            [
              issue(
                "AMBIGUOUS_INVENTORY_SEMANTICS",
              ),
            ],
          ),
        ).toMatchObject({
          disposition: "durable_issue",
          issueCode:
            "AMBIGUOUS_INVENTORY_SEMANTICS",
          severity: "high",
        });
      },
    );

    it(
      "keeps ordinary normalization quarantine transient",
      () => {
        expect(
          qualifyProvider(
            "NORMALIZATION_QUARANTINED",
            [
              issue(
                "INVALID_TIMESTAMP",
                "orderedAt is invalid",
              ),
            ],
          ),
        ).toEqual({
          disposition: "transient_only",
          reasonCode:
            "NORMALIZATION_QUARANTINED",
        });

        expect(
          qualifyProvider(
            "DUPLICATE_CONFLICT",
          ),
        ).toEqual({
          disposition: "transient_only",
          reasonCode: "DUPLICATE_CONFLICT",
        });
      },
    );

    it(
      "repeats the same observation as the same candidate",
      () => {
        const observation: DataQualityObservation = {
          kind: "provider_reconciliation",
          integrationId:
            "  integration-uuid  ",
          reconciliation:
            reconciliation(
              "BINDING_CONFLICT",
              [
                issue(
                  "EXTERNAL_ID_INVALID",
                  "Bearer secret-token",
                ),
              ],
              "  External-ID  ",
              "  Parent-ID  ",
            ),
        };

        expect(
          qualifyDataQualityObservation(
            observation,
          ),
        ).toEqual(
          qualifyDataQualityObservation(
            observation,
          ),
        );
      },
    );

    it(
      "builds an M4.3 provider subject and keeps parent evidence out of identity",
      () => {
        const result =
          qualifyDataQualityObservation({
            kind: "provider_reconciliation",
            integrationId:
              "  integration-uuid  ",
            reconciliation:
              reconciliation(
                "BINDING_CONFLICT",
                [
                  issue(
                    "EXTERNAL_ID_INVALID",
                    "Bearer secret-token",
                  ),
                ],
                "  External-ID  ",
                "  Parent-ID  ",
              ),
          });

        expect(
          result.disposition,
        ).toBe("durable_issue");

        if (
          result.disposition !==
          "durable_issue"
        ) {
          return;
        }

        expect(result.subject).toEqual({
          kind: "provider",
          integrationId:
            "integration-uuid",
          provider: "csv",
          resourceType:
            "product_variant",
          externalId: "External-ID",
        });

        expect(
          buildDataQualityIssueKey({
            issueCode: result.issueCode,
            subject: result.subject,
          }),
        ).toBe(
          '["dq-v1","BINDING_CONFLICT","provider","integration-uuid","csv","product_variant","External-ID"]',
        );

        expect(
          result.sourceContext,
        ).toEqual({
          provenance:
            "provider_reconciliation",
          adapterVersion:
            "csv-variant-v1",
          reasonCode: "BINDING_CONFLICT",
          issueCodes: [
            "EXTERNAL_ID_INVALID",
          ],
          externalParentId: "Parent-ID",
        });

        expect(
          JSON.stringify(
            result.subject,
          ),
        ).not.toContain("Parent-ID");

        expect(
          JSON.stringify(
            result.sourceContext,
          ),
        ).not.toContain(
          "secret-token",
        );

        expect(
          Object.keys(
            result.sourceContext ?? {},
          ).sort(),
        ).toEqual([
          "adapterVersion",
          "externalParentId",
          "issueCodes",
          "provenance",
          "reasonCode",
        ]);
      },
    );

    it(
      "uses the documented severity policy deterministically",
      () => {
        expect(
          M4_4_DATA_QUALITY_SEVERITY_POLICY,
        ).toEqual({
          BINDING_CONFLICT: "critical",
          IDENTITY_AMBIGUOUS: "high",
          RELATIONSHIP_UNRESOLVED: "high",
          AMBIGUOUS_INVENTORY_SEMANTICS:
            "high",
          NEGATIVE_INVENTORY: "high",
        });
      },
    );

    it(
      "prefers binding conflict over a second durable issue code",
      () => {
        expect(
          qualifyProvider(
            "BINDING_CONFLICT",
            [
              issue(
                "RELATIONSHIP_UNRESOLVED",
              ),
            ],
          ),
        ).toMatchObject({
          issueCode: "BINDING_CONFLICT",
          severity: "critical",
        });
      },
    );

    it(
      "qualifies negative observed inventory for a location and variant",
      () => {
        const result =
          qualifyDataQualityObservation({
            kind: "negative_inventory",
            locationId:
              "  location-uuid  ",
            variantId: " variant-uuid ",
            quantityField: "on_hand",
            quantity: -2,
          });

        expect(result).toMatchObject({
          disposition: "durable_issue",
          issueCode: "NEGATIVE_INVENTORY",
          severity: "high",
          subject: {
            kind: "location_variant",
            locationId: "location-uuid",
            variantId: "variant-uuid",
          },
        });

        if (
          result.disposition !==
          "durable_issue"
        ) {
          return;
        }

        expect(
          buildDataQualityIssueKey({
            issueCode: result.issueCode,
            subject: result.subject,
          }),
        ).toBe(
          '["dq-v1","NEGATIVE_INVENTORY","location_variant","location-uuid","variant-uuid"]',
        );

        expect(
          result.sourceContext,
        ).toEqual({
          provenance:
            "negative_inventory_observation",
          quantityField: "on_hand",
          observedQuantity: -2,
        });
      },
    );

    it(
      "fails closed on invalid identity and unsupported observations",
      () => {
        expect(() =>
          qualifyDataQualityObservation({
            kind: "provider_reconciliation",
            integrationId: "   ",
            reconciliation:
              reconciliation(
                "BINDING_CONFLICT",
              ),
          }),
        ).toThrow(
          "Integration ID must not be blank.",
        );

        expect(() =>
          qualifyProvider(
            "BINDING_CONFLICT",
            [],
            { externalId: null },
          ),
        ).toThrow(
          "Provider external ID must not be blank.",
        );

        expect(() =>
          qualifyProvider(
            "BINDING_CONFLICT",
            [],
            {
              provider: "CSV" as "csv",
            },
          ),
        ).toThrow(
          "Provider type is not a stable data-quality vocabulary value.",
        );

        expect(() =>
          qualifyDataQualityObservation({
            kind: "negative_inventory",
            locationId: "location-uuid",
            variantId: "variant-uuid",
            quantityField: "on_hand",
            quantity: 0,
          }),
        ).toThrow(
          "Negative inventory observation requires a negative whole-unit quantity.",
        );

        expect(() =>
          qualifyDataQualityObservation({
            kind: "unsupported",
          } as unknown as DataQualityObservation),
        ).toThrow(
          "Data quality observation is not supported.",
        );
      },
    );
  },
);
