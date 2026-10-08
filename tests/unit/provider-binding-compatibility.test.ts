import {
  describe,
  expect,
  it,
} from "vitest";

import {
  bindingMatchesIdentity,
  buildProviderBindingKey,
  hasAmbiguousBindings,
  providerBindingKey,
} from "@/lib/providers/bindings";

describe("provider binding backward compatibility", () => {
  it("retains the frozen legacy provider binding key", () => {
    expect(
      providerBindingKey({
        integrationId:
          "integration-1",
        resourceType:
          "product_variant",
        externalId: "123",
      }),
    ).toBe(
      "integration-1:product_variant:123",
    );
  });

  it("retains legacy identity matching", () => {
    expect(
      bindingMatchesIdentity(
        {
          integrationId:
            "integration-1",
          resourceType:
            "product_variant",
          externalId: "123",
        },
        {
          integrationId:
            "integration-1",
          resourceType:
            "product_variant",
          externalId: "123",
        },
      ),
    ).toBe(true);
  });

  it("retains legacy ambiguity detection", () => {
    expect(
      hasAmbiguousBindings([
        {
          integrationId:
            "integration-1",
          resourceType:
            "product_variant",
          externalId: "123",
          canonicalEntityId:
            "variant-a",
        },
        {
          integrationId:
            "integration-1",
          resourceType:
            "product_variant",
          externalId: "123",
          canonicalEntityId:
            "variant-b",
        },
      ]),
    ).toBe(true);
  });

  it("supports the stronger M0.7 durable binding key alongside the legacy key", () => {
    const key =
      buildProviderBindingKey({
        organizationId: "org-1",
        integrationId:
          "integration-1",
        provider: "shopify",
        resourceType:
          "product_variant",
        externalId: "123",
      });

    expect(key).toContain(
      '"org-1"',
    );

    expect(key).toContain(
      '"shopify"',
    );
  });
});
