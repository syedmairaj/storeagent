import {
  describe,
  expect,
  it,
} from "vitest";

import {
  quarantinedProviderRecord,
  skippedProviderRecord,
} from "@/lib/providers/results";

import {
  buildProviderReconciliationContext,
  classifyProviderSyncDisposition,
  quarantineMayRequireDurableDataQualityIssue,
  reconciliationReasonForBindingConflict,
} from "@/lib/providers/reconciliation";

describe("provider quarantine and reconciliation", () => {
  it("classifies quarantined normalization as quarantined sync disposition", () => {
    const result =
      quarantinedProviderRecord(
        {
          provider: "csv",
          resourceType:
            "product_variant",
          externalId: "SKU-1",
          externalParentId: null,
          adapterVersion:
            "csv-variant-v1",
        },
        [
          {
            code:
              "REQUIRED_FIELD_MISSING",
            message:
              "SKU title is missing.",
            field: "title",
          },
        ],
      );

    expect(
      classifyProviderSyncDisposition(
        result,
      ),
    ).toBe("quarantined");
  });

  it("classifies intentionally skipped normalization separately from quarantine", () => {
    const result =
      skippedProviderRecord(
        {
          provider: "csv",
          resourceType: "order",
          externalId: "order-1",
          externalParentId: null,
          adapterVersion:
            "csv-order-v1",
        },
        [
          {
            code:
              "UNSUPPORTED_RESOURCE",
            message:
              "Record is outside supported ingestion scope.",
            field: null,
          },
        ],
      );

    expect(
      classifyProviderSyncDisposition(
        result,
      ),
    ).toBe("skipped");
  });

  it("builds reconciliation metadata from quarantined normalization", () => {
    const result =
      quarantinedProviderRecord(
        {
          provider: "shopify",
          resourceType:
            "product_variant",
          externalId:
            "gid://shopify/ProductVariant/123",
          externalParentId:
            "gid://shopify/Product/10",
          adapterVersion:
            "shopify-variant-v1",
        },
        [
          {
            code:
              "RELATIONSHIP_UNRESOLVED",
            message:
              "Parent product binding could not be resolved.",
            field:
              "productId",
          },
        ],
      );

    expect(
      buildProviderReconciliationContext(
        result,
      ),
    ).toEqual({
      provider: "shopify",
      resourceType:
        "product_variant",
      externalId:
        "gid://shopify/ProductVariant/123",
      externalParentId:
        "gid://shopify/Product/10",
      adapterVersion:
        "shopify-variant-v1",
      reasonCode:
        "NORMALIZATION_QUARANTINED",
      issues: [
        {
          code:
            "RELATIONSHIP_UNRESOLVED",
          message:
            "Parent product binding could not be resolved.",
          field:
            "productId",
        },
      ],
    });
  });

  it("uses explicit binding-conflict reconciliation reason", () => {
    expect(
      reconciliationReasonForBindingConflict(),
    ).toBe(
      "BINDING_CONFLICT",
    );
  });

  it("does not make every quarantine a durable data-quality issue", () => {
    const result =
      quarantinedProviderRecord(
        {
          provider: "csv",
          resourceType: "order",
          externalId: "order-1",
          externalParentId: null,
          adapterVersion:
            "csv-order-v1",
        },
        [
          {
            code:
              "INVALID_TIMESTAMP",
            message:
              "orderedAt is invalid.",
            field: "orderedAt",
          },
        ],
      );

    const context =
      buildProviderReconciliationContext(
        result,
      );

    expect(
      quarantineMayRequireDurableDataQualityIssue(
        context,
      ),
    ).toBe(false);
  });

  it("marks binding conflicts as candidates for durable remediation", () => {
    const result =
      quarantinedProviderRecord(
        {
          provider: "shopify",
          resourceType:
            "product_variant",
          externalId: "123",
          externalParentId: null,
          adapterVersion:
            "shopify-variant-v1",
        },
        [
          {
            code:
              "EXTERNAL_ID_INVALID",
            message:
              "Binding conflict requires reconciliation.",
            field:
              "externalId",
          },
        ],
      );

    const context =
      buildProviderReconciliationContext(
        result,
        "BINDING_CONFLICT",
      );

    expect(
      quarantineMayRequireDurableDataQualityIssue(
        context,
      ),
    ).toBe(true);
  });

  it("marks unresolved relationships as candidates for durable remediation", () => {
    const result =
      quarantinedProviderRecord(
        {
          provider: "csv",
          resourceType:
            "order_item",
          externalId: "line-1",
          externalParentId:
            "order-1",
          adapterVersion:
            "csv-order-item-v1",
        },
        [
          {
            code:
              "RELATIONSHIP_UNRESOLVED",
            message:
              "Variant could not be resolved.",
            field:
              "variantId",
          },
        ],
      );

    const context =
      buildProviderReconciliationContext(
        result,
      );

    expect(
      quarantineMayRequireDurableDataQualityIssue(
        context,
      ),
    ).toBe(true);
  });

  it("preserves quarantine issue details in reconciliation context", () => {
    const result =
      quarantinedProviderRecord(
        {
          provider: "csv",
          resourceType:
            "product_variant",
          externalId: "row-5",
          externalParentId: null,
          adapterVersion:
            "csv-inventory-v1",
        },
        [
          {
            code:
              "AMBIGUOUS_INVENTORY_SEMANTICS",
            message:
              "Inventory column meaning is ambiguous.",
            field:
              "inventory",
          },
        ],
      );

    const context =
      buildProviderReconciliationContext(
        result,
      );

    expect(
      context.issues,
    ).toHaveLength(1);

    expect(
      context.issues[0]?.code,
    ).toBe(
      "AMBIGUOUS_INVENTORY_SEMANTICS",
    );
  });
});
