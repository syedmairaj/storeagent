import { describe, expect, it } from "vitest";

import {
  bindingMatchesIdentity,
  hasAmbiguousBindings,
  providerBindingKey,
} from "@/lib/providers/bindings";

describe("provider binding semantics", () => {
  it("scopes external identity by integration and resource type", () => {
    expect(
      providerBindingKey({
        integrationId: "integration-1",
        resourceType: "product_variant",
        externalId: "123",
      }),
    ).toBe("integration-1:product_variant:123");
  });

  it("does not treat identical external IDs from different integrations as identical", () => {
    const first = providerBindingKey({
      integrationId: "integration-a",
      resourceType: "product_variant",
      externalId: "123",
    });

    const second = providerBindingKey({
      integrationId: "integration-b",
      resourceType: "product_variant",
      externalId: "123",
    });

    expect(first).not.toBe(second);
  });

  it("matches only the full provider identity", () => {
    const binding = {
      integrationId: "integration-1",
      resourceType: "product_variant" as const,
      externalId: "123",
    };

    expect(
      bindingMatchesIdentity(binding, {
        integrationId: "integration-1",
        resourceType: "product_variant",
        externalId: "123",
      }),
    ).toBe(true);

    expect(
      bindingMatchesIdentity(binding, {
        integrationId: "integration-1",
        resourceType: "product",
        externalId: "123",
      }),
    ).toBe(false);
  });

  it("detects one provider resource mapping to multiple canonical entities", () => {
    expect(
      hasAmbiguousBindings([
        {
          integrationId: "integration-1",
          resourceType: "product_variant",
          externalId: "123",
          canonicalEntityId: "variant-a",
        },
        {
          integrationId: "integration-1",
          resourceType: "product_variant",
          externalId: "123",
          canonicalEntityId: "variant-b",
        },
      ]),
    ).toBe(true);
  });

  it("allows repeated binding observations when canonical identity agrees", () => {
    expect(
      hasAmbiguousBindings([
        {
          integrationId: "integration-1",
          resourceType: "product_variant",
          externalId: "123",
          canonicalEntityId: "variant-a",
        },
        {
          integrationId: "integration-1",
          resourceType: "product_variant",
          externalId: "123",
          canonicalEntityId: "variant-a",
        },
      ]),
    ).toBe(false);
  });
});
