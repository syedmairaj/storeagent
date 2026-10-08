import {
  describe,
  expect,
  it,
} from "vitest";

import {
  buildCompositeExternalId,
  normalizeExternalId,
  normalizeExternalIdentity,
  normalizeOptionalExternalId,
} from "@/lib/providers/external-identity";

describe("provider external identity normalization", () => {
  it("trims surrounding whitespace", () => {
    expect(
      normalizeExternalId(
        "  gid://shopify/Product/123  ",
      ),
    ).toBe(
      "gid://shopify/Product/123",
    );
  });

  it("preserves case", () => {
    expect(
      normalizeExternalId(
        "  SKU-AbC-123  ",
      ),
    ).toBe(
      "SKU-AbC-123",
    );
  });

  it("rejects empty external IDs", () => {
    expect(() =>
      normalizeExternalId("   "),
    ).toThrow(
      "External ID must not be empty.",
    );
  });

  it("normalizes optional parent identity", () => {
    expect(
      normalizeOptionalExternalId(
        "  parent-1  ",
      ),
    ).toBe("parent-1");
  });

  it("converts blank optional parent identity to null", () => {
    expect(
      normalizeOptionalExternalId(
        "   ",
      ),
    ).toBeNull();
  });

  it("normalizes child and parent identities together", () => {
    expect(
      normalizeExternalIdentity(
        "  child-1 ",
        " parent-1 ",
      ),
    ).toEqual({
      externalId: "child-1",
      externalParentId: "parent-1",
    });
  });

  it("builds deterministic composite external IDs", () => {
    expect(
      buildCompositeExternalId([
        {
          name: "store",
          value: "store-1",
        },
        {
          name: "sku",
          value: "SKU-123",
        },
      ]),
    ).toBe(
      "store=store-1|sku=SKU-123",
    );
  });

  it("preserves composite identity case", () => {
    expect(
      buildCompositeExternalId([
        {
          name: "SKU",
          value: "AbC-123",
        },
      ]),
    ).toBe(
      "SKU=AbC-123",
    );
  });

  it("rejects composite identities with no parts", () => {
    expect(() =>
      buildCompositeExternalId([]),
    ).toThrow(
      "Composite external ID requires at least one part.",
    );
  });

  it("rejects blank composite identity values", () => {
    expect(() =>
      buildCompositeExternalId([
        {
          name: "sku",
          value: "   ",
        },
      ]),
    ).toThrow(
      'Composite external ID part "sku" must not be empty.',
    );
  });
});
