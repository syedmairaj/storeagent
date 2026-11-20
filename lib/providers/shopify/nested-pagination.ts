/**
 * Shopify-RO.3 nested GraphQL pagination completeness.
 *
 * Offline / deterministic: follows nested opaque cursors through the
 * injectable RO.2 transport so required child collections can be proven
 * complete before any future SyncRun acceptance.
 *
 * Non-responsibilities:
 * - OAuth / credentials / live Shopify calls
 * - SyncRun / DB persistence
 * - RO.1.2 normalizer mapping changes
 * - canonical metrics / forecast / decisions
 * - inventing trusted PO incoming
 */

import {
  SHOPIFY_ADMIN_API_VERSION,
  SHOPIFY_RO3_NESTED_PAGINATION_VERSION,
  type ShopifyRo3NestedPaginationVersion,
} from "./api-version";

import {
  stableShopifyDuplicateFingerprint,
} from "./duplicate-analysis";

import {
  SHOPIFY_RO2_NESTED_CONNECTION_BOUNDS,
  type ShopifyNestedCompletenessAttestation,
  type ShopifyNestedConnectionAssessment,
} from "./nested-completeness";

import {
  SHOPIFY_RO3_NESTED_CONTINUATIONS,
  type ShopifyRo2ResourceOperation,
  type ShopifyRo3NestedContinuationOperation,
} from "./operations";

import {
  isShopifyRecord,
  readOptionalShopifyString,
} from "./payload";

import {
  ShopifyRo2GraphqlTransport,
} from "./transport";

import {
  ShopifyRo2CursorGuard,
  clampShopifyRo2PageSize,
  readShopifyRo2ConnectionNodes,
  readShopifyRo2PageInfo,
  resolveShopifyRo2MaxPages,
} from "./transport-pagination";

import {
  ShopifyRo2TransportError,
  type ShopifyRo2PageInfo,
} from "./transport-types";

export type ShopifyRo3NestedConnectionKind =
  | "product.variants"
  | "inventoryItem.variants"
  | "inventoryItem.inventoryLevels"
  | "inventoryLevel.item.variants"
  | "order.lineItems"
  | "order.fulfillmentOrders"
  | "fulfillmentOrder.lineItems";

export type ShopifyRo3CompletenessFailureReason =
  | "MISSING_CONNECTION"
  | "MISSING_PAGE_INFO"
  | "HAS_NEXT_PAGE_UNPAGINATED"
  | "REPEATED_CURSOR"
  | "MISSING_CURSOR"
  | "PAGE_LIMIT_EXHAUSTED"
  | "PARTIAL_GRAPHQL_ERRORS"
  | "MALFORMED_NODE"
  | "MALFORMED_RESPONSE"
  | "CONFLICTING_DUPLICATE"
  | "PARENT_MISMATCH"
  | "CARDINALITY_VIOLATION"
  | "TRANSPORT_ERROR"
  | "TOP_LEVEL_INCOMPLETE"
  | "NESTED_INCOMPLETE";

export type ShopifyRo3ConnectionEvidence = {
  connectionKind: ShopifyRo3NestedConnectionKind;
  parentGid: string;
  connectionIdentity: string;
  pagesFetched: number;
  nodeCount: number;
  complete: boolean;
  failureReasons: readonly ShopifyRo3CompletenessFailureReason[];
  details: readonly string[];
};

export type ShopifyRo3NestedPaginationConfig = {
  /**
   * Hard stop per nested connection identity (default: transport maxPages).
   */
  maxNestedPages?: number;
  /**
   * Page size for continuation requests (clamped 1–250).
   * Defaults to the nested bound for that connection kind.
   */
  nestedPageSizeOverrides?: Partial<
    Record<ShopifyRo3NestedContinuationOperation, number>
  >;
};

export type ShopifyRo3HydratedParent = {
  parentGid: string;
  resource: ShopifyRo2ResourceOperation | "fulfillmentOrder";
  /**
   * Parent node with nested connections rewritten to accumulated edges
   * and closed pageInfo when complete. Partial when incomplete.
   */
  node: Record<string, unknown>;
  complete: boolean;
  evidence: readonly ShopifyRo3ConnectionEvidence[];
};

export type ShopifyRo3NestedPaginationResult = {
  paginationVersion: ShopifyRo3NestedPaginationVersion;
  apiVersion: typeof SHOPIFY_ADMIN_API_VERSION;
  /**
   * True only when every required nested connection for the input was proven
   * complete (closed pageInfo after following all nested cursors).
   */
  complete: boolean;
  /**
   * Explicit sync-gate predicate. Never true when complete is false.
   * Partial aggregates may still be present for evidence preservation.
   */
  acceptableAsCompleteSyncInput: boolean;
  /**
   * Partial child aggregates are retained for debugging even when incomplete.
   * They must not be treated as certified complete sync input.
   */
  partialAggregatesPreserved: boolean;
  parents: readonly ShopifyRo3HydratedParent[];
  evidence: readonly ShopifyRo3ConnectionEvidence[];
  /**
   * Attestation suitable for RO.1.2 nestedCompletenessAttestation when complete.
   */
  attestation: ShopifyNestedCompletenessAttestation;
  assessments: readonly ShopifyNestedConnectionAssessment[];
};

function connectionIdentity(
  kind: ShopifyRo3NestedConnectionKind,
  parentGid: string,
): string {
  return `${kind}|${parentGid}`;
}

function defaultPageSizeForContinuation(
  kind: ShopifyRo3NestedContinuationOperation,
): number {
  switch (kind) {
    case "productVariants":
      return SHOPIFY_RO2_NESTED_CONNECTION_BOUNDS.productsVariants.first;
    case "inventoryItemVariants":
      return SHOPIFY_RO2_NESTED_CONNECTION_BOUNDS.inventoryItemVariants.first;
    case "inventoryItemLevels":
      return SHOPIFY_RO2_NESTED_CONNECTION_BOUNDS.inventoryLevels.first;
    case "orderLineItems":
      return SHOPIFY_RO2_NESTED_CONNECTION_BOUNDS.orderLineItems.first;
    case "orderFulfillmentOrders":
      return SHOPIFY_RO2_NESTED_CONNECTION_BOUNDS.orderFulfillmentOrders.first;
    case "fulfillmentOrderLineItems":
      return SHOPIFY_RO2_NESTED_CONNECTION_BOUNDS.fulfillmentOrderLineItems
        .first;
  }
}

function mapTransportFailure(
  error: unknown,
): {
  reasons: ShopifyRo3CompletenessFailureReason[];
  details: string[];
} {
  if (error instanceof ShopifyRo2TransportError) {
    switch (error.code) {
      case "PAGINATION_CURSOR_LOOP":
        return {
          reasons: ["REPEATED_CURSOR"],
          details: [error.message],
        };
      case "PAGINATION_PAGE_LIMIT":
        return {
          reasons: ["PAGE_LIMIT_EXHAUSTED"],
          details: [error.message],
        };
      case "PARTIAL_GRAPHQL_ERRORS":
        return {
          reasons: ["PARTIAL_GRAPHQL_ERRORS"],
          details: [error.message],
        };
      case "MALFORMED_RESPONSE":
        if (error.message.includes("endCursor is missing")) {
          return {
            reasons: ["MISSING_CURSOR"],
            details: [error.message],
          };
        }
        if (/parent mismatch/i.test(error.message)) {
          return {
            reasons: ["PARENT_MISMATCH"],
            details: [error.message],
          };
        }
        return {
          reasons: ["MALFORMED_RESPONSE"],
          details: [error.message],
        };
      default:
        return {
          reasons: ["TRANSPORT_ERROR"],
          details: [`${error.code}: ${error.message}`],
        };
    }
  }

  return {
    reasons: ["TRANSPORT_ERROR"],
    details: [
      error instanceof Error ? error.message : "Unknown transport failure.",
    ],
  };
}

function buildClosedConnection(
  nodes: readonly unknown[],
): Record<string, unknown> {
  return {
    edges: nodes.map((node) => ({ node })),
    pageInfo: {
      hasNextPage: false,
      endCursor: null,
    },
  };
}

function buildOpenConnection(
  nodes: readonly unknown[],
  pageInfo: ShopifyRo2PageInfo | null,
): Record<string, unknown> {
  return {
    edges: nodes.map((node) => ({ node })),
    pageInfo: pageInfo ?? undefined,
  };
}

type AccumulatorState = {
  nodes: unknown[];
  byId: Map<string, string>;
  pagesFetched: number;
  failureReasons: ShopifyRo3CompletenessFailureReason[];
  details: string[];
  lastPageInfo: ShopifyRo2PageInfo | null;
  complete: boolean;
};

function createAccumulator(): AccumulatorState {
  return {
    nodes: [],
    byId: new Map(),
    pagesFetched: 0,
    failureReasons: [],
    details: [],
    lastPageInfo: null,
    complete: false,
  };
}

function pushFailure(
  state: AccumulatorState,
  reason: ShopifyRo3CompletenessFailureReason,
  detail: string,
): void {
  if (!state.failureReasons.includes(reason)) {
    state.failureReasons.push(reason);
  }
  state.details.push(detail);
  state.complete = false;
}

function accumulateNodes(
  state: AccumulatorState,
  nodes: readonly unknown[],
): void {
  for (const node of nodes) {
    if (!isShopifyRecord(node)) {
      pushFailure(
        state,
        "MALFORMED_NODE",
        "Nested connection edge.node must be an object.",
      );
      continue;
    }

    const id = readOptionalShopifyString(node, "id");

    if (id === null) {
      pushFailure(
        state,
        "MALFORMED_NODE",
        "Nested connection node is missing an opaque id.",
      );
      continue;
    }

    if (!id.startsWith("gid://")) {
      pushFailure(
        state,
        "MALFORMED_NODE",
        `Nested connection node id must remain an opaque GID (got "${id}").`,
      );
      continue;
    }

    const fingerprint = stableShopifyDuplicateFingerprint(node);
    const existing = state.byId.get(id);

    if (existing === undefined) {
      state.byId.set(id, fingerprint);
      state.nodes.push(node);
      continue;
    }

    if (existing !== fingerprint) {
      pushFailure(
        state,
        "CONFLICTING_DUPLICATE",
        `Conflicting duplicate nested node for ${id}.`,
      );
    }
    // Identical fingerprint: idempotent skip (deterministic replay).
  }
}

function toEvidence(
  kind: ShopifyRo3NestedConnectionKind,
  parentGid: string,
  state: AccumulatorState,
): ShopifyRo3ConnectionEvidence {
  return {
    connectionKind: kind,
    parentGid,
    connectionIdentity: connectionIdentity(kind, parentGid),
    pagesFetched: state.pagesFetched,
    nodeCount: state.nodes.length,
    complete: state.complete && state.failureReasons.length === 0,
    failureReasons: [...state.failureReasons],
    details: [...state.details],
  };
}

function assessmentFromEvidence(
  evidence: ShopifyRo3ConnectionEvidence,
): ShopifyNestedConnectionAssessment {
  if (evidence.complete) {
    return {
      kind: "complete_attested",
      acceptableAsCompleteSyncInput: true,
      reasons: [
        `RO.3 nested pagination proven complete for ${evidence.connectionIdentity} (${evidence.pagesFetched} page(s), ${evidence.nodeCount} node(s)).`,
      ],
    };
  }

  const reasons =
    evidence.details.length > 0
      ? evidence.details
      : evidence.failureReasons.map((reason) => String(reason));

  if (
    evidence.failureReasons.includes("MISSING_PAGE_INFO") ||
    evidence.failureReasons.includes("MISSING_CONNECTION")
  ) {
    return {
      kind:
        evidence.failureReasons.includes("MISSING_CONNECTION")
          ? "incomplete"
          : "unattested",
      acceptableAsCompleteSyncInput: false,
      reasons,
    };
  }

  return {
    kind: "incomplete",
    acceptableAsCompleteSyncInput: false,
    reasons,
  };
}

export class ShopifyRo3NestedPaginator {
  private readonly transport: ShopifyRo2GraphqlTransport;
  private readonly maxNestedPages: number;
  private readonly pageSizeOverrides: Partial<
    Record<ShopifyRo3NestedContinuationOperation, number>
  >;

  constructor(
    transport: ShopifyRo2GraphqlTransport,
    config: ShopifyRo3NestedPaginationConfig = {},
  ) {
    this.transport = transport;
    this.maxNestedPages = resolveShopifyRo2MaxPages(config.maxNestedPages);
    this.pageSizeOverrides = config.nestedPageSizeOverrides ?? {};
  }

  private pageSizeFor(
    kind: ShopifyRo3NestedContinuationOperation,
  ): number {
    const override = this.pageSizeOverrides[kind];
    if (override === undefined) {
      return defaultPageSizeForContinuation(kind);
    }
    return clampShopifyRo2PageSize(override);
  }

  /**
   * Complete nested children for a single product node.
   */
  async completeProductNode(
    product: unknown,
  ): Promise<ShopifyRo3HydratedParent> {
    if (!isShopifyRecord(product)) {
      return this.malformedParent("products");
    }

    const parentGid = readOptionalShopifyString(product, "id");
    if (parentGid === null) {
      return this.malformedParent("products");
    }

    const variantsResult = await this.completeConnection({
      parentGid,
      connectionKind: "product.variants",
      continuation: "productVariants",
      initialConnection: product.variants,
      expectedParentRootField: "product",
    });

    const node: Record<string, unknown> = {
      ...product,
      variants: variantsResult.complete
        ? buildClosedConnection(variantsResult.nodes)
        : buildOpenConnection(
            variantsResult.nodes,
            variantsResult.lastPageInfo,
          ),
    };

    const evidence = [variantsResult.evidence];
    const complete = evidence.every((entry) => entry.complete);

    return {
      parentGid,
      resource: "products",
      node,
      complete,
      evidence,
    };
  }

  /**
   * Complete nested children for a single inventory item node.
   * variants cardinality is conservative: exactly one proven node, never >1.
   */
  async completeInventoryItemNode(
    inventoryItem: unknown,
  ): Promise<ShopifyRo3HydratedParent> {
    if (!isShopifyRecord(inventoryItem)) {
      return this.malformedParent("inventoryItems");
    }

    const parentGid = readOptionalShopifyString(inventoryItem, "id");
    if (parentGid === null) {
      return this.malformedParent("inventoryItems");
    }

    const variantsResult = await this.completeInventoryItemVariants(
      parentGid,
      inventoryItem.variants,
    );

    const levelsResult = await this.completeConnection({
      parentGid,
      connectionKind: "inventoryItem.inventoryLevels",
      continuation: "inventoryItemLevels",
      initialConnection: inventoryItem.inventoryLevels,
      expectedParentRootField: "inventoryItem",
    });

    const levelEvidence: ShopifyRo3ConnectionEvidence[] = [];
    const hydratedLevels: unknown[] = [];

    for (const level of levelsResult.nodes) {
      const levelHydration = this.assessInventoryLevelItemVariants(
        parentGid,
        level,
      );
      levelEvidence.push(...levelHydration.evidence);
      hydratedLevels.push(levelHydration.node);
    }

    const node: Record<string, unknown> = {
      ...inventoryItem,
      variants: variantsResult.complete
        ? buildClosedConnection(variantsResult.nodes)
        : buildOpenConnection(
            variantsResult.nodes,
            variantsResult.lastPageInfo,
          ),
      inventoryLevels: levelsResult.complete
        ? buildClosedConnection(hydratedLevels)
        : buildOpenConnection(hydratedLevels, levelsResult.lastPageInfo),
    };

    const evidence = [
      variantsResult.evidence,
      levelsResult.evidence,
      ...levelEvidence,
    ];
    const complete = evidence.every((entry) => entry.complete);

    return {
      parentGid,
      resource: "inventoryItems",
      node,
      complete,
      evidence,
    };
  }

  /**
   * Complete nested children for a single order node, including FO lineItems.
   */
  async completeOrderNode(
    order: unknown,
  ): Promise<ShopifyRo3HydratedParent> {
    if (!isShopifyRecord(order)) {
      return this.malformedParent("orders");
    }

    const parentGid = readOptionalShopifyString(order, "id");
    if (parentGid === null) {
      return this.malformedParent("orders");
    }

    const lineItemsResult = await this.completeConnection({
      parentGid,
      connectionKind: "order.lineItems",
      continuation: "orderLineItems",
      initialConnection: order.lineItems,
      expectedParentRootField: "order",
    });

    const foResult = await this.completeConnection({
      parentGid,
      connectionKind: "order.fulfillmentOrders",
      continuation: "orderFulfillmentOrders",
      initialConnection: order.fulfillmentOrders,
      expectedParentRootField: "order",
    });

    const foEvidence: ShopifyRo3ConnectionEvidence[] = [];
    const hydratedFos: unknown[] = [];

    for (const fo of foResult.nodes) {
      const foHydration = await this.completeFulfillmentOrderNode(fo);
      foEvidence.push(...foHydration.evidence);
      hydratedFos.push(foHydration.node);
    }

    const node: Record<string, unknown> = {
      ...order,
      lineItems: lineItemsResult.complete
        ? buildClosedConnection(lineItemsResult.nodes)
        : buildOpenConnection(
            lineItemsResult.nodes,
            lineItemsResult.lastPageInfo,
          ),
      fulfillmentOrders: foResult.complete
        ? buildClosedConnection(hydratedFos)
        : buildOpenConnection(hydratedFos, foResult.lastPageInfo),
    };

    const evidence = [
      lineItemsResult.evidence,
      foResult.evidence,
      ...foEvidence,
    ];
    const complete = evidence.every((entry) => entry.complete);

    return {
      parentGid,
      resource: "orders",
      node,
      complete,
      evidence,
    };
  }

  /**
   * Complete FO.lineItems for a fulfillment-order node.
   */
  async completeFulfillmentOrderNode(
    fulfillmentOrder: unknown,
  ): Promise<ShopifyRo3HydratedParent> {
    if (!isShopifyRecord(fulfillmentOrder)) {
      return this.malformedParent("fulfillmentOrder");
    }

    const parentGid = readOptionalShopifyString(fulfillmentOrder, "id");
    if (parentGid === null) {
      return this.malformedParent("fulfillmentOrder");
    }

    const lineItemsResult = await this.completeConnection({
      parentGid,
      connectionKind: "fulfillmentOrder.lineItems",
      continuation: "fulfillmentOrderLineItems",
      initialConnection: fulfillmentOrder.lineItems,
      expectedParentRootField: "fulfillmentOrder",
    });

    const node: Record<string, unknown> = {
      ...fulfillmentOrder,
      lineItems: lineItemsResult.complete
        ? buildClosedConnection(lineItemsResult.nodes)
        : buildOpenConnection(
            lineItemsResult.nodes,
            lineItemsResult.lastPageInfo,
          ),
    };

    const evidence = [lineItemsResult.evidence];
    const complete = evidence.every((entry) => entry.complete);

    return {
      parentGid,
      resource: "fulfillmentOrder",
      node,
      complete,
      evidence,
    };
  }

  /**
   * Complete nested children for every parent node in a top-level page.
   * Top-level hasNextPage=false alone never proves nested completeness.
   */
  async completeResourceNodes(input: {
    resource: Exclude<ShopifyRo2ResourceOperation, "locations">;
    nodes: readonly unknown[];
    topLevelHasNextPage: boolean;
  }): Promise<ShopifyRo3NestedPaginationResult> {
    const parents: ShopifyRo3HydratedParent[] = [];

    for (const node of input.nodes) {
      switch (input.resource) {
        case "products":
          parents.push(await this.completeProductNode(node));
          break;
        case "inventoryItems":
          parents.push(await this.completeInventoryItemNode(node));
          break;
        case "orders":
          parents.push(await this.completeOrderNode(node));
          break;
      }
    }

    return this.finalizeResult(parents, input.topLevelHasNextPage);
  }

  private finalizeResult(
    parents: readonly ShopifyRo3HydratedParent[],
    topLevelHasNextPage: boolean,
  ): ShopifyRo3NestedPaginationResult {
    const evidence = parents.flatMap((parent) => parent.evidence);
    const nestedComplete =
      parents.length === 0
        ? !topLevelHasNextPage
        : parents.every((parent) => parent.complete) &&
          evidence.every((entry) => entry.complete);

    const complete = nestedComplete && !topLevelHasNextPage;

    const assessments = evidence.map(assessmentFromEvidence);

    if (topLevelHasNextPage) {
      assessments.push({
        kind: "incomplete",
        acceptableAsCompleteSyncInput: false,
        reasons: [
          "Top-level hasNextPage=true; nested pagination alone is not catalog completeness proof.",
        ],
      });
    }

    const attestation: ShopifyNestedCompletenessAttestation = {
      nestedChildrenComplete: complete,
      paginationProven: complete,
      paginationVersion: SHOPIFY_RO3_NESTED_PAGINATION_VERSION,
    };

    return {
      paginationVersion: SHOPIFY_RO3_NESTED_PAGINATION_VERSION,
      apiVersion: SHOPIFY_ADMIN_API_VERSION,
      complete,
      acceptableAsCompleteSyncInput: complete,
      partialAggregatesPreserved: true,
      parents,
      evidence,
      attestation,
      assessments,
    };
  }

  private malformedParent(
    resource: ShopifyRo2ResourceOperation | "fulfillmentOrder",
  ): ShopifyRo3HydratedParent {
    const evidence: ShopifyRo3ConnectionEvidence = {
      connectionKind:
        resource === "products"
          ? "product.variants"
          : resource === "inventoryItems"
            ? "inventoryItem.inventoryLevels"
            : resource === "orders"
              ? "order.lineItems"
              : "fulfillmentOrder.lineItems",
      parentGid: "",
      connectionIdentity: connectionIdentity(
        resource === "products"
          ? "product.variants"
          : resource === "inventoryItems"
            ? "inventoryItem.inventoryLevels"
            : resource === "orders"
              ? "order.lineItems"
              : "fulfillmentOrder.lineItems",
        "",
      ),
      pagesFetched: 0,
      nodeCount: 0,
      complete: false,
      failureReasons: ["MALFORMED_NODE"],
      details: ["Parent node must be an object with an opaque GID id."],
    };

    return {
      parentGid: "",
      resource,
      node: {},
      complete: false,
      evidence: [evidence],
    };
  }

  /**
   * InventoryItem.variants: first:1 with closed pageInfo and exactly one node.
   * Never paginate additional pages into a "complete" multi-variant aggregate.
   */
  private async completeInventoryItemVariants(
    parentGid: string,
    initialConnection: unknown,
  ): Promise<{
    nodes: unknown[];
    complete: boolean;
    lastPageInfo: ShopifyRo2PageInfo | null;
    evidence: ShopifyRo3ConnectionEvidence;
  }> {
    const state = createAccumulator();
    const kind: ShopifyRo3NestedConnectionKind = "inventoryItem.variants";

    if (initialConnection === null || initialConnection === undefined) {
      pushFailure(
        state,
        "MISSING_CONNECTION",
        "inventoryItem.variants connection is missing (missing ≠ empty).",
      );
      return {
        nodes: state.nodes,
        complete: false,
        lastPageInfo: null,
        evidence: toEvidence(kind, parentGid, state),
      };
    }

    if (!isShopifyRecord(initialConnection)) {
      pushFailure(
        state,
        "MALFORMED_RESPONSE",
        "inventoryItem.variants must be a connection object.",
      );
      return {
        nodes: state.nodes,
        complete: false,
        lastPageInfo: null,
        evidence: toEvidence(kind, parentGid, state),
      };
    }

    if (
      initialConnection.pageInfo === null ||
      initialConnection.pageInfo === undefined
    ) {
      pushFailure(
        state,
        "MISSING_PAGE_INFO",
        "inventoryItem.variants lacks pageInfo; full first:1 is not completeness proof.",
      );
      // Still capture any present nodes as partial evidence.
      try {
        accumulateNodes(
          state,
          readShopifyRo2ConnectionNodes(initialConnection),
        );
      } catch (error) {
        const mapped = mapTransportFailure(error);
        for (const reason of mapped.reasons) {
          pushFailure(state, reason, mapped.details.join(" "));
        }
      }
      state.pagesFetched = 1;
      return {
        nodes: state.nodes,
        complete: false,
        lastPageInfo: null,
        evidence: toEvidence(kind, parentGid, state),
      };
    }

    let pageInfo: ShopifyRo2PageInfo;
    try {
      pageInfo = readShopifyRo2PageInfo(initialConnection);
      const nodes = readShopifyRo2ConnectionNodes(initialConnection);
      state.pagesFetched = 1;
      state.lastPageInfo = pageInfo;
      accumulateNodes(state, nodes);
    } catch (error) {
      const mapped = mapTransportFailure(error);
      for (const reason of mapped.reasons) {
        pushFailure(state, reason, mapped.details.join(" "));
      }
      return {
        nodes: state.nodes,
        complete: false,
        lastPageInfo: state.lastPageInfo,
        evidence: toEvidence(kind, parentGid, state),
      };
    }

    if (state.nodes.length > 1 || pageInfo.hasNextPage) {
      pushFailure(
        state,
        "CARDINALITY_VIOLATION",
        "inventoryItem.variants must resolve to exactly one ProductVariant; 0 or >1 fails closed.",
      );
      return {
        nodes: state.nodes,
        complete: false,
        lastPageInfo: pageInfo,
        evidence: toEvidence(kind, parentGid, state),
      };
    }

    if (state.nodes.length === 0) {
      // Closed empty variants connection is still a cardinality failure for
      // InventoryItem (RO.1.2 requires exactly one). Genuine empty ≠ complete.
      pushFailure(
        state,
        "CARDINALITY_VIOLATION",
        "inventoryItem.variants is empty; exactly one variant is required.",
      );
      return {
        nodes: state.nodes,
        complete: false,
        lastPageInfo: pageInfo,
        evidence: toEvidence(kind, parentGid, state),
      };
    }

    if (state.failureReasons.length === 0) {
      state.complete = true;
    }

    return {
      nodes: state.nodes,
      complete: state.complete,
      lastPageInfo: pageInfo,
      evidence: toEvidence(kind, parentGid, state),
    };
  }

  private assessInventoryLevelItemVariants(
    inventoryItemGid: string,
    level: unknown,
  ): {
    node: Record<string, unknown>;
    evidence: ShopifyRo3ConnectionEvidence[];
  } {
    if (!isShopifyRecord(level)) {
      const evidence = toEvidence(
        "inventoryLevel.item.variants",
        inventoryItemGid,
        (() => {
          const state = createAccumulator();
          pushFailure(
            state,
            "MALFORMED_NODE",
            "inventoryLevel node must be an object.",
          );
          return state;
        })(),
      );
      return { node: {}, evidence: [evidence] };
    }

    const levelGid =
      readOptionalShopifyString(level, "id") ?? inventoryItemGid;
    const item = isShopifyRecord(level.item) ? level.item : null;
    const state = createAccumulator();

    if (item === null) {
      // item may be absent on some shapes — treat variants as missing.
      pushFailure(
        state,
        "MISSING_CONNECTION",
        "inventoryLevel.item is missing; variant cardinality cannot be proven.",
      );
      return {
        node: level,
        evidence: [toEvidence("inventoryLevel.item.variants", levelGid, state)],
      };
    }

    const itemId = readOptionalShopifyString(item, "id");
    if (itemId !== null && itemId !== inventoryItemGid) {
      pushFailure(
        state,
        "PARENT_MISMATCH",
        `inventoryLevel.item.id ${itemId} does not match inventoryItem ${inventoryItemGid}.`,
      );
    }

    const variants = item.variants;

    if (variants === null || variants === undefined) {
      pushFailure(
        state,
        "MISSING_CONNECTION",
        "inventoryLevel.item.variants connection is missing.",
      );
      return {
        node: level,
        evidence: [toEvidence("inventoryLevel.item.variants", levelGid, state)],
      };
    }

    if (!isShopifyRecord(variants)) {
      pushFailure(
        state,
        "MALFORMED_RESPONSE",
        "inventoryLevel.item.variants must be a connection object.",
      );
      return {
        node: level,
        evidence: [toEvidence("inventoryLevel.item.variants", levelGid, state)],
      };
    }

    if (variants.pageInfo === null || variants.pageInfo === undefined) {
      pushFailure(
        state,
        "MISSING_PAGE_INFO",
        "inventoryLevel.item.variants lacks pageInfo; first:1 alone is not proof.",
      );
    }

    try {
      const pageInfo =
        variants.pageInfo === null || variants.pageInfo === undefined
          ? null
          : readShopifyRo2PageInfo(variants);
      const nodes = readShopifyRo2ConnectionNodes(variants);
      state.pagesFetched = 1;
      state.lastPageInfo = pageInfo;
      accumulateNodes(state, nodes);

      if (
        pageInfo?.hasNextPage === true ||
        state.nodes.length !== 1
      ) {
        pushFailure(
          state,
          "CARDINALITY_VIOLATION",
          "inventoryLevel.item.variants must be exactly one ProductVariant.",
        );
      } else if (
        pageInfo?.hasNextPage === false &&
        state.failureReasons.length === 0
      ) {
        state.complete = true;
      } else if (pageInfo === null) {
        // already recorded MISSING_PAGE_INFO
      }
    } catch (error) {
      const mapped = mapTransportFailure(error);
      for (const reason of mapped.reasons) {
        pushFailure(state, reason, mapped.details.join(" "));
      }
    }

    const closedVariants =
      state.complete
        ? buildClosedConnection(state.nodes)
        : buildOpenConnection(state.nodes, state.lastPageInfo);

    return {
      node: {
        ...level,
        item: {
          ...item,
          variants: closedVariants,
        },
      },
      evidence: [toEvidence("inventoryLevel.item.variants", levelGid, state)],
    };
  }

  private async completeConnection(input: {
    parentGid: string;
    connectionKind: ShopifyRo3NestedConnectionKind;
    continuation: ShopifyRo3NestedContinuationOperation;
    initialConnection: unknown;
    expectedParentRootField: string;
  }): Promise<{
    nodes: unknown[];
    complete: boolean;
    lastPageInfo: ShopifyRo2PageInfo | null;
    evidence: ShopifyRo3ConnectionEvidence;
  }> {
    const state = createAccumulator();
    const { parentGid, connectionKind, continuation } = input;

    if (
      input.initialConnection === null ||
      input.initialConnection === undefined
    ) {
      pushFailure(
        state,
        "MISSING_CONNECTION",
        `${connectionKind} connection is missing (missing ≠ empty genuine connection).`,
      );
      return {
        nodes: state.nodes,
        complete: false,
        lastPageInfo: null,
        evidence: toEvidence(connectionKind, parentGid, state),
      };
    }

    if (!isShopifyRecord(input.initialConnection)) {
      pushFailure(
        state,
        "MALFORMED_RESPONSE",
        `${connectionKind} must be a connection object.`,
      );
      return {
        nodes: state.nodes,
        complete: false,
        lastPageInfo: null,
        evidence: toEvidence(connectionKind, parentGid, state),
      };
    }

    if (
      input.initialConnection.pageInfo === null ||
      input.initialConnection.pageInfo === undefined
    ) {
      pushFailure(
        state,
        "MISSING_PAGE_INFO",
        `${connectionKind} lacks nested pageInfo; a full first:N page is not completeness proof.`,
      );
      try {
        accumulateNodes(
          state,
          readShopifyRo2ConnectionNodes(input.initialConnection),
        );
      } catch (error) {
        const mapped = mapTransportFailure(error);
        for (const reason of mapped.reasons) {
          pushFailure(state, reason, mapped.details.join(" "));
        }
      }
      state.pagesFetched = 1;
      return {
        nodes: state.nodes,
        complete: false,
        lastPageInfo: null,
        evidence: toEvidence(connectionKind, parentGid, state),
      };
    }

    const guard = new ShopifyRo2CursorGuard(this.maxNestedPages);
    let after: string | null = null;
    let connection: unknown = input.initialConnection;
    let fetchedViaContinuation = false;

    try {
      for (;;) {
        guard.beginPage(after);

        if (fetchedViaContinuation) {
          connection = await this.fetchContinuationPage({
            continuation,
            parentGid,
            after,
            expectedParentRootField: input.expectedParentRootField,
          });
        }

        const pageInfo = readShopifyRo2PageInfo(connection);
        const nodes = readShopifyRo2ConnectionNodes(connection);
        state.pagesFetched = guard.pageCount;
        state.lastPageInfo = pageInfo;
        accumulateNodes(state, nodes);

        if (state.failureReasons.length > 0) {
          break;
        }

        if (!pageInfo.hasNextPage) {
          state.complete = true;
          break;
        }

        // hasNextPage true without endCursor already thrown by readShopifyRo2PageInfo
        after = guard.assertNextCursor(pageInfo.endCursor);
        fetchedViaContinuation = true;
      }
    } catch (error) {
      const mapped = mapTransportFailure(error);
      for (const reason of mapped.reasons) {
        pushFailure(state, reason, mapped.details.join(" "));
      }
    }

    // Empty partial page with open hasNextPage is not proof; CursorGuard /
    // pageInfo handling already covers that. Closed empty is genuine empty.
    if (
      state.complete &&
      state.nodes.length === 0 &&
      state.pagesFetched === 0
    ) {
      // Defensive: completeness requires at least observing a closed page.
      pushFailure(
        state,
        "NESTED_INCOMPLETE",
        "Empty partial observation is not nested completeness proof.",
      );
    }

    return {
      nodes: state.nodes,
      complete: state.complete && state.failureReasons.length === 0,
      lastPageInfo: state.lastPageInfo,
      evidence: toEvidence(connectionKind, parentGid, state),
    };
  }

  private async fetchContinuationPage(input: {
    continuation: ShopifyRo3NestedContinuationOperation;
    parentGid: string;
    after: string | null;
    expectedParentRootField: string;
  }): Promise<unknown> {
    const definition = SHOPIFY_RO3_NESTED_CONTINUATIONS[input.continuation];
    const first = this.pageSizeFor(input.continuation);

    const result = await this.transport.executeReadOnlyDocument({
      document: definition.document,
      variables: {
        id: input.parentGid,
        first,
        after: input.after,
      },
    });

    const parent = result.data[definition.parentRootField];

    if (parent === null || parent === undefined) {
      throw new ShopifyRo2TransportError({
        code: "MALFORMED_RESPONSE",
        message: `Shopify RO.3 continuation ${definition.name} returned null parent.`,
        retryable: false,
      });
    }

    if (!isShopifyRecord(parent)) {
      throw new ShopifyRo2TransportError({
        code: "MALFORMED_RESPONSE",
        message: `Shopify RO.3 continuation ${definition.name} parent must be an object.`,
        retryable: false,
      });
    }

    const returnedId = readOptionalShopifyString(parent, "id");
    if (returnedId !== input.parentGid) {
      throw new ShopifyRo2TransportError({
        code: "MALFORMED_RESPONSE",
        message: `Shopify RO.3 continuation parent mismatch: expected ${input.parentGid}, got ${returnedId ?? "null"}.`,
        retryable: false,
      });
    }

    if (definition.parentRootField !== input.expectedParentRootField) {
      throw new ShopifyRo2TransportError({
        code: "TRANSPORT_MISCONFIGURED",
        message: `Shopify RO.3 continuation root field mismatch for ${input.continuation}.`,
        retryable: false,
      });
    }

    return parent[definition.connectionField];
  }
}

export function createShopifyRo3NestedPaginator(
  transport: ShopifyRo2GraphqlTransport,
  config: ShopifyRo3NestedPaginationConfig = {},
): ShopifyRo3NestedPaginator {
  return new ShopifyRo3NestedPaginator(transport, config);
}

/**
 * Sync-gate helper: RO.3 pagination result must be complete before any
 * future SyncRun "complete" acceptance. Partial aggregates are preserved
 * on the result but never certified here.
 */
export function mayAcceptRo3NestedPaginationAsCompleteSyncInput(
  result: ShopifyRo3NestedPaginationResult,
): boolean {
  return (
    result.complete &&
    result.acceptableAsCompleteSyncInput &&
    result.attestation.nestedChildrenComplete === true &&
    result.attestation.paginationProven === true &&
    result.evidence.every((entry) => entry.complete)
  );
}
