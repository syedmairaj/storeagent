import {
  describe,
  expect,
  it,
} from "vitest";

import {
  assertWorkerExecutionScope,
  workerScopeAsTrustedServiceScope,
} from "@/workers/scope";

describe("worker trusted tenant scope", () => {
  it("converts worker scope into the existing trusted service scope", () => {
    expect(
      workerScopeAsTrustedServiceScope({
        organizationId: "org-a",
        storeId: "store-a",
        purpose:
          "calculate_forecast",
      }),
    ).toEqual({
      organizationId:
        "org-a",
      storeId:
        "store-a",
      source:
        "scheduled_job",
    });
  });

  it("allows organization-scoped work with trusted canonical ownership", () => {
    expect(() =>
      assertWorkerExecutionScope({
        scope: {
          organizationId:
            "org-a",
          storeId: null,
          purpose:
            "sync_provider",
        },
        ownedReferences: [
          {
            resourceType:
              "integration",
            resourceId:
              "integration-a",
            organizationId:
              "org-a",
            storeId: null,
          },
        ],
      }),
    ).not.toThrow();
  });

  it("allows store-scoped work when canonical ownership matches", () => {
    expect(() =>
      assertWorkerExecutionScope({
        scope: {
          organizationId:
            "org-a",
          storeId:
            "store-a",
          purpose:
            "calculate_forecast",
        },
        ownedReferences: [
          {
            resourceType:
              "store",
            resourceId:
              "store-a",
            organizationId:
              "org-a",
            storeId:
              "store-a",
          },
          {
            resourceType:
              "forecast_run",
            resourceId:
              "forecast-1",
            organizationId:
              "org-a",
            storeId:
              "store-a",
          },
        ],
      }),
    ).not.toThrow();
  });

  it("denies cross-organization worker payload tampering", () => {
    expect(() =>
      assertWorkerExecutionScope({
        scope: {
          organizationId:
            "org-a",
          storeId:
            "store-b",
          purpose:
            "calculate_forecast",
        },
        ownedReferences: [
          {
            resourceType:
              "store",
            resourceId:
              "store-b",
            organizationId:
              "org-b",
            storeId:
              "store-b",
          },
        ],
      }),
    ).toThrow(
      'Worker scope denied: store "store-b" does not belong to organization "org-a".',
    );
  });

  it("denies a foreign store inside the correct organization", () => {
    expect(() =>
      assertWorkerExecutionScope({
        scope: {
          organizationId:
            "org-a",
          storeId:
            "store-a",
          purpose:
            "calculate_forecast",
        },
        ownedReferences: [
          {
            resourceType:
              "forecast_run",
            resourceId:
              "forecast-2",
            organizationId:
              "org-a",
            storeId:
              "store-b",
          },
        ],
      }),
    ).toThrow(
      'Worker scope denied: forecast_run "forecast-2" does not belong to store "store-a".',
    );
  });

  it("allows an organization-scoped reference inside a store-scoped job", () => {
    expect(() =>
      assertWorkerExecutionScope({
        scope: {
          organizationId:
            "org-a",
          storeId:
            "store-a",
          purpose:
            "sync_provider",
        },
        ownedReferences: [
          {
            resourceType:
              "integration",
            resourceId:
              "integration-a",
            organizationId:
              "org-a",
            storeId: null,
          },
        ],
      }),
    ).not.toThrow();
  });

  it("rejects empty worker organization scope", () => {
    expect(() =>
      assertWorkerExecutionScope({
        scope: {
          organizationId:
            "   ",
          storeId: null,
          purpose:
            "sync_provider",
        },
        ownedReferences: [],
      }),
    ).toThrow(
      "Worker organizationId must not be empty.",
    );
  });

  it("rejects empty explicit worker purpose", () => {
    expect(() =>
      assertWorkerExecutionScope({
        scope: {
          organizationId:
            "org-a",
          storeId: null,
          purpose: " ",
        },
        ownedReferences: [],
      }),
    ).toThrow(
      "Worker purpose must not be empty.",
    );
  });

  it("rejects empty store scope when storeId is supplied", () => {
    expect(() =>
      assertWorkerExecutionScope({
        scope: {
          organizationId:
            "org-a",
          storeId: " ",
          purpose:
            "calculate_forecast",
        },
        ownedReferences: [],
      }),
    ).toThrow(
      "Worker storeId must not be empty.",
    );
  });

  it("does not infer tenant ownership from external/provider identifiers", () => {
    expect(() =>
      assertWorkerExecutionScope({
        scope: {
          organizationId:
            "org-a",
          storeId: null,
          purpose:
            "sync_provider",
        },
        ownedReferences: [
          {
            resourceType:
              "provider_resource",
            resourceId:
              "gid://shopify/ProductVariant/123",
            organizationId:
              "org-b",
            storeId: null,
          },
        ],
      }),
    ).toThrow(
      'does not belong to organization "org-a"',
    );
  });
});
