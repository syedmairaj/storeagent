import { describe, expect, it } from "vitest";

import { buildCsvQuarantineEnvelope } from "@/lib/providers/csv/quarantine";

import {
  classifyCsvOperationalFailure,
  classifyCsvReconciliationFailure,
} from "@/lib/providers/csv/partial-failure";

describe("CSV quarantine envelope", () => {
  it("preserves non-secret row reconciliation provenance", () => {
    expect(
      buildCsvQuarantineEnvelope(7, {
        provider: "csv",

        resourceType: "product_variant",

        externalId: "SKU-AbC",

        externalParentId: "PROD-1",

        adapterVersion: "csv-variant-v1",

        reasonCode: "RELATIONSHIP_UNRESOLVED",

        issues: [
          {
            code: "RELATIONSHIP_UNRESOLVED",

            message: "Parent product could not be resolved.",

            field: "externalParentId",
          },
        ],
      }),
    ).toEqual({
      rowNumber: 7,

      subjectType: "resource",

      provider: "csv",

      resourceType: "product_variant",

      externalId: "SKU-AbC",

      externalParentId: "PROD-1",

      adapterVersion: "csv-variant-v1",

      reasonCode: "RELATIONSHIP_UNRESOLVED",

      issues: [
        {
          code: "RELATIONSHIP_UNRESOLVED",

          message: "Parent product could not be resolved.",

          field: "externalParentId",
        },
      ],
    });
  });

  it("supports explicit binding-conflict quarantine", () => {
    const envelope = buildCsvQuarantineEnvelope(8, {
      provider: "csv",

      resourceType: "order",

      externalId: "ORD-1",

      externalParentId: null,

      adapterVersion: "csv-order-v1",

      reasonCode: "BINDING_CONFLICT",

      issues: [],
    });

    expect(envelope.reasonCode).toBe("BINDING_CONFLICT");
  });

  it("rejects invalid diagnostic row number", () => {
    expect(() =>
      buildCsvQuarantineEnvelope(0, {
        provider: "csv",

        resourceType: "order",

        externalId: "ORD-1",

        externalParentId: null,

        adapterVersion: "csv-order-v1",

        reasonCode: "BINDING_CONFLICT",

        issues: [],
      }),
    ).toThrow("CSV row number must be a positive safe integer.");
  });

  it("rejects blank adapter version", () => {
    expect(() =>
      buildCsvQuarantineEnvelope(2, {
        provider: "csv",

        resourceType: "order",

        externalId: "ORD-1",

        externalParentId: null,

        adapterVersion: " ",

        reasonCode: "BINDING_CONFLICT",

        issues: [],
      }),
    ).toThrow("CSV quarantine adapterVersion must not be blank.");
  });
});

describe("CSV partial-failure classification", () => {
  it.each([
    "NORMALIZATION_QUARANTINED",
    "BINDING_CONFLICT",
    "IDENTITY_AMBIGUOUS",
    "RELATIONSHIP_UNRESOLVED",
    "PROVIDER_INCONSISTENCY",
  ] as const)(
    "classifies reconciliation reason %s as quarantine",
    (reasonCode) => {
      expect(classifyCsvReconciliationFailure(reasonCode)).toEqual({
        disposition: "quarantined",

        reasonCode,
      });
    },
  );

  it("classifies unexpected operational failure as failed", () => {
    expect(
      classifyCsvOperationalFailure({
        errorCode: "CANONICAL_WRITE_FAILED",
      }),
    ).toEqual({
      disposition: "failed",

      errorCode: "CANONICAL_WRITE_FAILED",
    });
  });

  it("requires operational failure code", () => {
    expect(() =>
      classifyCsvOperationalFailure({
        errorCode: " ",
      }),
    ).toThrow("errorCode must not be empty.");
  });
});
