import {
  describe,
  expect,
  it,
} from "vitest";

import type {
  ProviderBinding,
} from "@/lib/commerce-domain/types";

import {
  assessProviderBindingReplay,
  buildProviderBindingKey,
  normalizeProviderBindingIdentity,
} from "@/lib/providers/bindings";

const existingBinding:
  ProviderBinding = {
    id: "binding-1",
    organizationId: "org-1",
    integrationId: "integration-1",
    provider: "shopify",
    resourceType: "product_variant",
    canonicalEntityId: "variant-1",
    externalId:
      "gid://shopify/ProductVariant/123",
    externalParentId:
      "gid://shopify/Product/10",
    sourceMetadata: null,
    createdAt:
      "2026-10-08T00:00:00.000Z",
    updatedAt:
      "2026-10-08T00:00:00.000Z",
  };

describe("provider binding identity and idempotency", () => {
  it("builds the same key for equivalent normalized identity", () => {
    const a =
      buildProviderBindingKey({
        organizationId: " org-1 ",
        integrationId:
          " integration-1 ",
        provider: "shopify",
        resourceType:
          "product_variant",
        externalId:
          " gid://shopify/ProductVariant/123 ",
      });

    const b =
      buildProviderBindingKey({
        organizationId: "org-1",
        integrationId:
          "integration-1",
        provider: "shopify",
        resourceType:
          "product_variant",
        externalId:
          "gid://shopify/ProductVariant/123",
      });

    expect(a).toBe(b);
  });

  it("preserves external-ID case in the binding identity", () => {
    const upper =
      buildProviderBindingKey({
        organizationId: "org-1",
        integrationId:
          "integration-1",
        provider: "csv",
        resourceType:
          "product_variant",
        externalId: "SKU-AbC",
      });

    const lower =
      buildProviderBindingKey({
        organizationId: "org-1",
        integrationId:
          "integration-1",
        provider: "csv",
        resourceType:
          "product_variant",
        externalId: "sku-abc",
      });

    expect(upper).not.toBe(lower);
  });

  it("keeps different organizations isolated", () => {
    const a =
      buildProviderBindingKey({
        organizationId: "org-1",
        integrationId:
          "integration-1",
        provider: "shopify",
        resourceType: "order",
        externalId: "100",
      });

    const b =
      buildProviderBindingKey({
        organizationId: "org-2",
        integrationId:
          "integration-1",
        provider: "shopify",
        resourceType: "order",
        externalId: "100",
      });

    expect(a).not.toBe(b);
  });

  it("keeps different integrations isolated", () => {
    const a =
      buildProviderBindingKey({
        organizationId: "org-1",
        integrationId:
          "csv-import-a",
        provider: "csv",
        resourceType:
          "product_variant",
        externalId: "SKU-1",
      });

    const b =
      buildProviderBindingKey({
        organizationId: "org-1",
        integrationId:
          "csv-import-b",
        provider: "csv",
        resourceType:
          "product_variant",
        externalId: "SKU-1",
      });

    expect(a).not.toBe(b);
  });

  it("keeps resource types isolated", () => {
    const product =
      buildProviderBindingKey({
        organizationId: "org-1",
        integrationId:
          "integration-1",
        provider: "shopify",
        resourceType: "product",
        externalId: "123",
      });

    const variant =
      buildProviderBindingKey({
        organizationId: "org-1",
        integrationId:
          "integration-1",
        provider: "shopify",
        resourceType:
          "product_variant",
        externalId: "123",
      });

    expect(product).not.toBe(
      variant,
    );
  });

  it("rejects empty canonical scope identifiers", () => {
    expect(() =>
      normalizeProviderBindingIdentity({
        organizationId: " ",
        integrationId:
          "integration-1",
        provider: "csv",
        resourceType: "order",
        externalId: "1",
      }),
    ).toThrow(
      "organizationId must not be empty.",
    );
  });

  it("classifies a missing binding as create", () => {
    expect(
      assessProviderBindingReplay(
        null,
        {
          organizationId:
            "org-1",
          integrationId:
            "integration-1",
          provider: "shopify",
          resourceType:
            "product_variant",
          externalId:
            "gid://shopify/ProductVariant/123",
          canonicalEntityId:
            "variant-1",
        },
      ).disposition,
    ).toBe("create");
  });

  it("classifies the same binding-to-entity replay as idempotent", () => {
    expect(
      assessProviderBindingReplay(
        existingBinding,
        {
          organizationId:
            "org-1",
          integrationId:
            "integration-1",
          provider: "shopify",
          resourceType:
            "product_variant",
          externalId:
            "gid://shopify/ProductVariant/123",
          canonicalEntityId:
            "variant-1",
        },
      ).disposition,
    ).toBe("idempotent");
  });

  it("classifies attempted rebinding to another canonical entity as conflict", () => {
    expect(
      assessProviderBindingReplay(
        existingBinding,
        {
          organizationId:
            "org-1",
          integrationId:
            "integration-1",
          provider: "shopify",
          resourceType:
            "product_variant",
          externalId:
            "gid://shopify/ProductVariant/123",
          canonicalEntityId:
            "variant-2",
        },
      ).disposition,
    ).toBe("conflict");
  });

  it("does not use externalParentId as hidden uniqueness", () => {
    const changedParent = {
      ...existingBinding,
      externalParentId:
        "gid://shopify/Product/999",
    };

    expect(
      assessProviderBindingReplay(
        changedParent,
        {
          organizationId:
            "org-1",
          integrationId:
            "integration-1",
          provider: "shopify",
          resourceType:
            "product_variant",
          externalId:
            "gid://shopify/ProductVariant/123",
          canonicalEntityId:
            "variant-1",
        },
      ).disposition,
    ).toBe("idempotent");
  });

  it("rejects comparing an unrelated existing binding", () => {
    expect(() =>
      assessProviderBindingReplay(
        {
          ...existingBinding,
          externalId:
            "different-id",
        },
        {
          organizationId:
            "org-1",
          integrationId:
            "integration-1",
          provider: "shopify",
          resourceType:
            "product_variant",
          externalId:
            "gid://shopify/ProductVariant/123",
          canonicalEntityId:
            "variant-1",
        },
      ),
    ).toThrow(
      "Existing provider binding does not match the incoming binding identity.",
    );
  });

  it("allows delimiter characters without binding-key collisions", () => {
    const a =
      buildProviderBindingKey({
        organizationId: "org|1",
        integrationId: "int",
        provider: "csv",
        resourceType: "order",
        externalId: "x",
      });

    const b =
      buildProviderBindingKey({
        organizationId: "org",
        integrationId: "1|int",
        provider: "csv",
        resourceType: "order",
        externalId: "x",
      });

    expect(a).not.toBe(b);
  });
});
