/**
 * Offline nested-connection completeness contract for Shopify RO.1.2 / RO.2.
 *
 * RO.2 queries bound nested connections with `first:N` and do not request
 * nested `pageInfo`. Those pages must never be accepted as complete sync
 * input without explicit attestation or independent nested pagination.
 *
 * This module is offline/deterministic only — no network, SyncRun writes,
 * or live Shopify calls.
 */

import type {
  ProviderNormalizationIssue,
} from "@/lib/providers/types";

import {
  shopifyIssue,
} from "./issues";

import {
  isShopifyRecord,
  readOptionalShopifyString,
} from "./payload";

/**
 * Nested selections in RO.2 operations that lack nested pageInfo.
 * Bounds match `lib/providers/shopify/operations.ts`.
 */
export const SHOPIFY_RO2_NESTED_CONNECTION_BOUNDS = {
  productsVariants: { parent: "products", field: "variants", first: 100 },
  inventoryItemVariants: {
    parent: "inventoryItems",
    field: "variants",
    first: 1,
  },
  inventoryLevels: {
    parent: "inventoryItems",
    field: "inventoryLevels",
    first: 50,
  },
  orderLineItems: { parent: "orders", field: "lineItems", first: 100 },
  orderFulfillmentOrders: {
    parent: "orders",
    field: "fulfillmentOrders",
    first: 20,
  },
  fulfillmentOrderLineItems: {
    parent: "fulfillmentOrders",
    field: "lineItems",
    first: 100,
  },
} as const;

/**
 * Offline attestation that nested children are complete for sync acceptance.
 * Default remains unattested — incomplete children must not become complete
 * sync input.
 */
export type ShopifyNestedCompletenessKind =
  | "complete_attested"
  | "incomplete"
  | "unattested";

export type ShopifyNestedConnectionAssessment = {
  kind: ShopifyNestedCompletenessKind;
  /**
   * True only when an explicit complete attestation is present and no
   * truncation evidence exists.
   */
  acceptableAsCompleteSyncInput: boolean;
  reasons: readonly string[];
};

export type ShopifyNestedCompletenessAttestation = {
  /**
   * Explicit operator/test attestation that nested children are complete.
   * Never inferred from top-level hasNextPage alone.
   */
  nestedChildrenComplete: boolean;
};

/**
 * Assess whether a GraphQL connection object may be treated as complete.
 *
 * - Missing connection → incomplete (cannot prove completeness).
 * - `pageInfo.hasNextPage === true` → incomplete.
 * - `pageInfo` absent (RO.2 nested shape) → unattested unless attestation
 *   claims nestedChildrenComplete.
 * - `pageInfo.hasNextPage === false` with attestation → complete_attested.
 */
export function assessShopifyConnectionCompleteness(
  connection: unknown,
  attestation: ShopifyNestedCompletenessAttestation | null = null,
): ShopifyNestedConnectionAssessment {
  if (connection === null || connection === undefined) {
    return {
      kind: "incomplete",
      acceptableAsCompleteSyncInput: false,
      reasons: ["Nested connection is missing."],
    };
  }

  if (!isShopifyRecord(connection)) {
    return {
      kind: "incomplete",
      acceptableAsCompleteSyncInput: false,
      reasons: ["Nested connection is not an object."],
    };
  }

  const pageInfo = connection.pageInfo;

  if (pageInfo === null || pageInfo === undefined) {
    if (attestation?.nestedChildrenComplete === true) {
      return {
        kind: "complete_attested",
        acceptableAsCompleteSyncInput: true,
        reasons: [
          "Nested pageInfo absent; completeness accepted only via explicit offline attestation.",
        ],
      };
    }

    return {
      kind: "unattested",
      acceptableAsCompleteSyncInput: false,
      reasons: [
        "Nested connection has no pageInfo; top-level pagination alone is not completeness proof.",
      ],
    };
  }

  if (!isShopifyRecord(pageInfo)) {
    return {
      kind: "incomplete",
      acceptableAsCompleteSyncInput: false,
      reasons: ["Nested pageInfo is malformed."],
    };
  }

  if (pageInfo.hasNextPage === true) {
    return {
      kind: "incomplete",
      acceptableAsCompleteSyncInput: false,
      reasons: [
        "Nested connection reports hasNextPage=true; remaining children are truncated.",
      ],
    };
  }

  if (pageInfo.hasNextPage === false) {
    if (attestation?.nestedChildrenComplete === true) {
      return {
        kind: "complete_attested",
        acceptableAsCompleteSyncInput: true,
        reasons: [
          "Nested hasNextPage=false with explicit offline completeness attestation.",
        ],
      };
    }

    // hasNextPage false without attestation still fails closed for SyncRun
    // acceptance — RO.2 nested queries historically omit pageInfo entirely;
    // when pageInfo is present and closed, require attestation to treat as
    // complete sync input (defense in depth).
    return {
      kind: "unattested",
      acceptableAsCompleteSyncInput: false,
      reasons: [
        "Nested hasNextPage=false without explicit offline completeness attestation.",
      ],
    };
  }

  return {
    kind: "incomplete",
    acceptableAsCompleteSyncInput: false,
    reasons: ["Nested pageInfo.hasNextPage is not a boolean."],
  };
}

/**
 * Fail-closed gate: incomplete/unattested nested children must not be
 * accepted as complete offline sync input.
 */
export function refuseIncompleteNestedSyncInput(
  assessment: ShopifyNestedConnectionAssessment,
  field: string,
): ProviderNormalizationIssue | null {
  if (assessment.acceptableAsCompleteSyncInput) {
    return null;
  }

  return shopifyIssue(
    "RELATIONSHIP_UNRESOLVED",
    `Shopify nested connection "${field}" is not acceptable as complete sync input: ${assessment.reasons.join(" ")}`,
    field,
  );
}

/**
 * Read opaque connection nodes from either `nodes` or `edges[].node`.
 * Returns null when the field is absent; empty array when present but empty.
 */
export function readShopifyConnectionNodeList(
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

  if (Array.isArray(connection.nodes)) {
    return connection.nodes;
  }

  if (Array.isArray(connection.edges)) {
    const nodes: unknown[] = [];

    for (const edge of connection.edges) {
      if (!isShopifyRecord(edge)) {
        continue;
      }

      nodes.push(edge.node);
    }

    return nodes;
  }

  return null;
}

/**
 * Convenience: detect truncated nested pageInfo on a connection field.
 */
export function nestedConnectionHasNextPage(
  record: Record<string, unknown>,
  field: string,
): boolean | null {
  const connection = record[field];

  if (!isShopifyRecord(connection)) {
    return null;
  }

  const pageInfo = connection.pageInfo;

  if (!isShopifyRecord(pageInfo)) {
    return null;
  }

  return typeof pageInfo.hasNextPage === "boolean"
    ? pageInfo.hasNextPage
    : null;
}

/**
 * Offline SyncRun/catalog acceptance predicate.
 * Top-level hasNextPage alone never proves nested completeness.
 */
export function mayAcceptAsCompleteShopifySyncInput(input: {
  topLevelHasNextPage: boolean;
  nestedAssessments: readonly ShopifyNestedConnectionAssessment[];
}): boolean {
  if (input.topLevelHasNextPage) {
    return false;
  }

  return input.nestedAssessments.every(
    (entry) => entry.acceptableAsCompleteSyncInput,
  );
}

/**
 * Helper for tests/docs: summarize RO.2 nested bounds without pageInfo.
 */
export function describeShopifyRo2NestedIncompletenessGate(): string {
  return (
    "Nested first:N selections without nested pageInfo are incomplete sync " +
    "input until paginated with opaque cursors or explicitly attested complete. " +
    `Bounds: variants<=${SHOPIFY_RO2_NESTED_CONNECTION_BOUNDS.productsVariants.first}, ` +
    `inventoryLevels<=${SHOPIFY_RO2_NESTED_CONNECTION_BOUNDS.inventoryLevels.first}, ` +
    `order lineItems<=${SHOPIFY_RO2_NESTED_CONNECTION_BOUNDS.orderLineItems.first}, ` +
    `fulfillmentOrders<=${SHOPIFY_RO2_NESTED_CONNECTION_BOUNDS.orderFulfillmentOrders.first}.`
  );
}

/**
 * Soft identity check used by adversarial tests — ensures GIDs stay opaque
 * strings when present on connection nodes.
 */
export function connectionNodesRetainOpaqueIds(
  nodes: readonly unknown[],
  idField = "id",
): boolean {
  for (const node of nodes) {
    if (!isShopifyRecord(node)) {
      return false;
    }

    const id = readOptionalShopifyString(node, idField);

    if (id === null || !id.startsWith("gid://")) {
      return false;
    }
  }

  return true;
}
