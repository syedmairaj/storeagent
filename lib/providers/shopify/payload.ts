import type {
  ProviderNormalizationIssue,
} from "@/lib/providers/types";

import {
  shopifyIssue,
} from "./issues";

export function isShopifyRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

export function readShopifyPayloadObject(
  payload: unknown,
  issues: ProviderNormalizationIssue[],
): Record<string, unknown> | null {
  if (!isShopifyRecord(payload)) {
    issues.push(
      shopifyIssue(
        "REQUIRED_FIELD_MISSING",
        "Shopify payload must be a GraphQL-shaped object.",
        null,
      ),
    );

    return null;
  }

  return payload;
}

export function readOptionalShopifyString(
  record: Record<string, unknown>,
  field: string,
): string | null {
  const value = record[field];

  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed || null;
}

export function requireShopifyString(
  record: Record<string, unknown>,
  field: string,
  issues: ProviderNormalizationIssue[],
  message: string,
): string | null {
  const value = record[field];

  if (value === null || value === undefined) {
    issues.push(
      shopifyIssue(
        "REQUIRED_FIELD_MISSING",
        message,
        field,
      ),
    );

    return null;
  }

  if (typeof value !== "string") {
    issues.push(
      shopifyIssue(
        "REQUIRED_FIELD_MISSING",
        message,
        field,
      ),
    );

    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    issues.push(
      shopifyIssue(
        "REQUIRED_FIELD_MISSING",
        message,
        field,
      ),
    );

    return null;
  }

  return trimmed;
}

export function readShopifyNestedObject(
  record: Record<string, unknown>,
  field: string,
  issues: ProviderNormalizationIssue[],
  required: boolean,
  message: string,
): Record<string, unknown> | null {
  const value = record[field];

  if (value === null || value === undefined) {
    if (required) {
      issues.push(
        shopifyIssue(
          "RELATIONSHIP_UNRESOLVED",
          message,
          field,
        ),
      );
    }

    return null;
  }

  if (!isShopifyRecord(value)) {
    issues.push(
      shopifyIssue(
        "RELATIONSHIP_UNRESOLVED",
        message,
        field,
      ),
    );

    return null;
  }

  return value;
}

export function readShopifyConnectionNodes(
  record: Record<string, unknown>,
  field: string,
): unknown[] | null {
  const connection = record[field];

  if (connection === null || connection === undefined) {
    return null;
  }

  if (!isShopifyRecord(connection)) {
    return null;
  }

  const nodes = connection.nodes;

  if (!Array.isArray(nodes)) {
    return null;
  }

  return nodes;
}
