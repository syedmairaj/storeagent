import {
  describe,
  expect,
  it,
} from "vitest";

import {
  SHOPIFY_ADMIN_API_VERSION,
  SHOPIFY_RO3_NESTED_PAGINATION_VERSION,
} from "@/lib/providers/shopify/api-version";

import {
  mayAcceptAsCompleteShopifySyncInput,
} from "@/lib/providers/shopify/nested-completeness";

import {
  createShopifyRo3NestedPaginator,
  mayAcceptRo3NestedPaginationAsCompleteSyncInput,
} from "@/lib/providers/shopify/nested-pagination";

import {
  SHOPIFY_RO2_OPERATIONS,
  SHOPIFY_RO3_NESTED_CONTINUATIONS,
} from "@/lib/providers/shopify/operations";

import {
  createShopifyRo2GraphqlTransport,
} from "@/lib/providers/shopify/transport";

import {
  type ShopifyGraphqlHttp,
  type ShopifyGraphqlHttpRequest,
  type ShopifyGraphqlHttpResponse,
} from "@/lib/providers/shopify/transport-types";

import {
  SHOPIFY_RO1_NESTED_CONNECTION_COMPLETENESS_CERTIFIED,
} from "@/tests/fixtures/shopify/ro1-v1/payloads";

import {
  SHOPIFY_RO3_LIVE_NESTED_COMPLETENESS_CERTIFIED,
  SHOPIFY_RO3_OFFLINE_NESTED_PAGINATION_IMPLEMENTED,
  closedConnection,
  openConnection,
  ro3FoLineItemsSecondPage,
  ro3InventoryItemCardinalityViolation,
  ro3InventoryItemComplete,
  ro3InventoryItemMultiLevelFirst,
  ro3InventoryItemMultiLevelSecond,
  ro3OrderComplete,
  ro3OrderFoLineItemsMultiFirst,
  ro3OrderMultiPageLinesFirst,
  ro3OrderMultiPageLinesSecond,
  ro3ProductEmptyGenuine,
  ro3ProductMissingVariants,
  ro3ProductMultiPageFirst,
  ro3ProductMultiPageSecond,
  ro3ProductNoPageInfo,
  ro3ProductSinglePage,
  ro3TwoParentsIndependent,
  ro3Variant,
} from "@/tests/fixtures/shopify/ro3-v1/payloads";

function jsonResponse(
  status: number,
  body: unknown,
): ShopifyGraphqlHttpResponse {
  return {
    status,
    headers: {},
    bodyText: JSON.stringify(body),
  };
}

function parseBody(request: ShopifyGraphqlHttpRequest): {
  query: string;
  variables: Record<string, unknown>;
} {
  return JSON.parse(request.body) as {
    query: string;
    variables: Record<string, unknown>;
  };
}

function mockHttp(
  handler: (
    request: ShopifyGraphqlHttpRequest,
  ) => ShopifyGraphqlHttpResponse | Promise<ShopifyGraphqlHttpResponse>,
): {
  http: ShopifyGraphqlHttp;
  requests: ShopifyGraphqlHttpRequest[];
} {
  const requests: ShopifyGraphqlHttpRequest[] = [];

  return {
    requests,
    http: {
      async request(request) {
        requests.push(request);
        return handler(request);
      },
    },
  };
}

function createPaginator(
  handler: (
    request: ShopifyGraphqlHttpRequest,
  ) => ShopifyGraphqlHttpResponse | Promise<ShopifyGraphqlHttpResponse>,
  options?: { maxNestedPages?: number; maxRetries?: number },
) {
  const { http, requests } = mockHttp(handler);
  const transport = createShopifyRo2GraphqlTransport({
    shopDomain: "snap.myshopify.com",
    accessToken: "shpat_test_ephemeral",
    http,
    sleep: async () => undefined,
    maxRetries: options?.maxRetries ?? 3,
    maxPages: options?.maxNestedPages ?? 100,
  });
  const paginator = createShopifyRo3NestedPaginator(transport, {
    maxNestedPages: options?.maxNestedPages,
  });
  return { paginator, requests, transport };
}

describe("Shopify-RO.3 nested operation contracts", () => {
  it("pins RO.3 version and requests nested pageInfo on required connections", () => {
    expect(SHOPIFY_RO3_NESTED_PAGINATION_VERSION).toBe("shopify-ro.3-v1");
    expect(SHOPIFY_ADMIN_API_VERSION).toBe("2026-10");
    expect(SHOPIFY_RO3_OFFLINE_NESTED_PAGINATION_IMPLEMENTED).toBe(true);
    expect(SHOPIFY_RO3_LIVE_NESTED_COMPLETENESS_CERTIFIED).toBe(false);
    expect(SHOPIFY_RO1_NESTED_CONNECTION_COMPLETENESS_CERTIFIED).toBe(
      false,
    );

    const nestedNeedles = [
      {
        document: SHOPIFY_RO2_OPERATIONS.products.document,
        needle: "variants(first: 100)",
      },
      {
        document: SHOPIFY_RO2_OPERATIONS.inventoryItems.document,
        needle: "inventoryLevels(first: 50)",
      },
      {
        document: SHOPIFY_RO2_OPERATIONS.inventoryItems.document,
        needle: "variants(first: 1)",
      },
      {
        document: SHOPIFY_RO2_OPERATIONS.orders.document,
        needle: "lineItems(first: 100)",
      },
      {
        document: SHOPIFY_RO2_OPERATIONS.orders.document,
        needle: "fulfillmentOrders(first: 20)",
      },
    ];

    for (const entry of nestedNeedles) {
      const start = entry.document.indexOf(entry.needle);
      expect(start).toBeGreaterThanOrEqual(0);
      const fromNeedle = entry.document.slice(start);
      const openBrace = fromNeedle.indexOf("{");
      let depth = 0;
      let end = -1;
      for (let i = openBrace; i < fromNeedle.length; i += 1) {
        if (fromNeedle[i] === "{") depth += 1;
        else if (fromNeedle[i] === "}") {
          depth -= 1;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
      const block = fromNeedle.slice(0, end + 1);
      expect(block).toContain("pageInfo");
      expect(block).toContain("hasNextPage");
      expect(block).toContain("endCursor");
    }

    for (const continuation of Object.values(
      SHOPIFY_RO3_NESTED_CONTINUATIONS,
    )) {
      expect(continuation.readOnly).toBe(true);
      expect(continuation.document).not.toMatch(/\bmutation\b/i);
      expect(continuation.document).toContain("pageInfo");
      expect(continuation.apiVersion).toBe("2026-10");
    }
  });
});

describe("Shopify-RO.3 nested pagination completeness", () => {
  it("proves single-page nested completeness", async () => {
    const { paginator, requests } = createPaginator(() => {
      throw new Error("No continuation expected for single-page product");
    });

    const result = await paginator.completeResourceNodes({
      resource: "products",
      nodes: [ro3ProductSinglePage],
      topLevelHasNextPage: false,
    });

    expect(result.complete).toBe(true);
    expect(result.acceptableAsCompleteSyncInput).toBe(true);
    expect(result.attestation.paginationProven).toBe(true);
    expect(result.attestation.paginationVersion).toBe("shopify-ro.3-v1");
    expect(requests).toHaveLength(0);
    expect(
      mayAcceptRo3NestedPaginationAsCompleteSyncInput(result),
    ).toBe(true);
    expect(
      mayAcceptAsCompleteShopifySyncInput({
        topLevelHasNextPage: false,
        nestedAssessments: result.assessments,
      }),
    ).toBe(true);

    const variants = result.parents[0]?.node.variants as {
      edges: unknown[];
      pageInfo: { hasNextPage: boolean };
    };
    expect(variants.edges).toHaveLength(2);
    expect(variants.pageInfo.hasNextPage).toBe(false);
  });

  it("follows multiple nested pages via continuation queries", async () => {
    const { paginator, requests } = createPaginator((request) => {
      const body = parseBody(request);
      expect(body.query).toContain("StoreAgentRo3ProductVariants");
      expect(body.variables.id).toBe("gid://shopify/Product/101");
      expect(body.variables.after).toBe("var-cursor-1");
      return jsonResponse(200, {
        data: {
          product: {
            id: "gid://shopify/Product/101",
            variants: ro3ProductMultiPageSecond,
          },
        },
      });
    });

    const result = await paginator.completeResourceNodes({
      resource: "products",
      nodes: [ro3ProductMultiPageFirst],
      topLevelHasNextPage: false,
    });

    expect(result.complete).toBe(true);
    expect(requests).toHaveLength(1);
    expect(result.parents[0]?.node.variants).toMatchObject({
      pageInfo: { hasNextPage: false },
    });
    expect(
      (result.parents[0]?.node.variants as { edges: unknown[] }).edges,
    ).toHaveLength(2);
  });

  it("handles exact-boundary and over-boundary datasets with page-size override", async () => {
    const { http, requests } = mockHttp((request) => {
      const body = parseBody(request);
      expect(body.variables.first).toBe(2);

      if (body.variables.after === "var-exact-1") {
        return jsonResponse(200, {
          data: {
            product: {
              id: "gid://shopify/Product/102",
              variants: openConnection(
                [ro3Variant("2202"), ro3Variant("2203")],
                "var-exact-2",
              ),
            },
          },
        });
      }

      expect(body.variables.after).toBe("var-exact-2");
      return jsonResponse(200, {
        data: {
          product: {
            id: "gid://shopify/Product/102",
            variants: closedConnection([ro3Variant("2204")]),
          },
        },
      });
    });

    const boundaryTransport = createShopifyRo2GraphqlTransport({
      shopDomain: "snap.myshopify.com",
      accessToken: "shpat_test_ephemeral",
      http,
      sleep: async () => undefined,
    });
    const boundaryPaginator = createShopifyRo3NestedPaginator(
      boundaryTransport,
      {
        nestedPageSizeOverrides: { productVariants: 2 },
      },
    );

    const firstPageProduct = {
      id: "gid://shopify/Product/102",
      title: "Exact-boundary product",
      variants: openConnection(
        [ro3Variant("2200"), ro3Variant("2201")],
        "var-exact-1",
      ),
    };

    const result = await boundaryPaginator.completeResourceNodes({
      resource: "products",
      nodes: [firstPageProduct],
      topLevelHasNextPage: false,
    });

    expect(result.complete).toBe(true);
    expect(requests).toHaveLength(2);
    expect(
      (result.parents[0]?.node.variants as { edges: unknown[] }).edges,
    ).toHaveLength(5);
  });

  it("paginates multiple parents with independent cursors", async () => {
    const { paginator, requests } = createPaginator((request) => {
      const body = parseBody(request);
      const id = body.variables.id;

      if (id === "gid://shopify/Product/201") {
        expect(body.variables.after).toBe("p201-c1");
        return jsonResponse(200, {
          data: {
            product: {
              id,
              variants: closedConnection([ro3Variant("2402")]),
            },
          },
        });
      }

      if (id === "gid://shopify/Product/202") {
        expect(body.variables.after).toBe("p202-c1");
        return jsonResponse(200, {
          data: {
            product: {
              id,
              variants: closedConnection([ro3Variant("2502")]),
            },
          },
        });
      }

      throw new Error(`Unexpected parent id ${String(id)}`);
    });

    const result = await paginator.completeResourceNodes({
      resource: "products",
      nodes: [...ro3TwoParentsIndependent],
      topLevelHasNextPage: false,
    });

    expect(result.complete).toBe(true);
    expect(requests).toHaveLength(2);
    expect(result.parents).toHaveLength(2);
    expect(result.evidence.every((entry) => entry.complete)).toBe(true);
  });

  it("distinguishes empty genuine connections from missing connections", async () => {
    const { paginator } = createPaginator(() => {
      throw new Error("No HTTP expected");
    });

    const empty = await paginator.completeProductNode(
      ro3ProductEmptyGenuine,
    );
    expect(empty.complete).toBe(true);
    expect(empty.evidence[0]?.nodeCount).toBe(0);
    expect(empty.evidence[0]?.failureReasons).toEqual([]);

    const missing = await paginator.completeProductNode(
      ro3ProductMissingVariants,
    );
    expect(missing.complete).toBe(false);
    expect(missing.evidence[0]?.failureReasons).toContain(
      "MISSING_CONNECTION",
    );

    const noPageInfo = await paginator.completeProductNode(
      ro3ProductNoPageInfo,
    );
    expect(noPageInfo.complete).toBe(false);
    expect(noPageInfo.evidence[0]?.failureReasons).toContain(
      "MISSING_PAGE_INFO",
    );
  });

  it("detects repeated cursors and page-limit exhaustion", async () => {
    const loop = createPaginator((request) => {
      const body = parseBody(request);
      return jsonResponse(200, {
        data: {
          product: {
            id: body.variables.id,
            variants: openConnection(
              [ro3Variant(`loop-${String(body.variables.after)}`)],
              "var-cursor-1",
            ),
          },
        },
      });
    });

    const loopResult = await loop.paginator.completeProductNode(
      ro3ProductMultiPageFirst,
    );
    expect(loopResult.complete).toBe(false);
    expect(loopResult.evidence[0]?.failureReasons).toContain(
      "REPEATED_CURSOR",
    );

    const limited = createPaginator(
      (request) => {
        const body = parseBody(request);
        const after = String(body.variables.after ?? "start");
        return jsonResponse(200, {
          data: {
            product: {
              id: body.variables.id,
              variants: openConnection(
                [ro3Variant(`p-${after}`)],
                `next-after-${after}`,
              ),
            },
          },
        });
      },
      { maxNestedPages: 2 },
    );

    const limitedResult = await limited.paginator.completeProductNode({
      id: "gid://shopify/Product/109",
      variants: openConnection([ro3Variant("2601")], "c0"),
    });
    expect(limitedResult.complete).toBe(false);
    expect(limitedResult.evidence[0]?.failureReasons).toContain(
      "PAGE_LIMIT_EXHAUSTED",
    );
  });

  it("records partial GraphQL errors and retries rate limits", async () => {
    let attempts = 0;
    const throttled = createPaginator((request) => {
      attempts += 1;
      if (attempts === 1) {
        return jsonResponse(200, {
          errors: [
            {
              message: "Throttled",
              extensions: { code: "THROTTLED", retryAfter: 0.01 },
            },
          ],
        });
      }

      const body = parseBody(request);
      return jsonResponse(200, {
        data: {
          product: {
            id: body.variables.id,
            variants: closedConnection([ro3Variant("2102")]),
          },
        },
      });
    });

    const throttledResult = await throttled.paginator.completeProductNode(
      ro3ProductMultiPageFirst,
    );
    expect(throttledResult.complete).toBe(true);
    expect(attempts).toBe(2);

    const partial = createPaginator(() =>
      jsonResponse(200, {
        errors: [
          {
            message: "Field error on variants",
            path: ["product", "variants"],
          },
        ],
        data: {
          product: {
            id: "gid://shopify/Product/101",
            variants: closedConnection([ro3Variant("2102")]),
          },
        },
      }),
    );

    const partialResult = await partial.paginator.completeProductNode(
      ro3ProductMultiPageFirst,
    );
    expect(partialResult.complete).toBe(false);
    expect(partialResult.evidence[0]?.failureReasons).toContain(
      "PARTIAL_GRAPHQL_ERRORS",
    );
    // First-page nodes preserved as partial evidence (not certified complete).
    expect(
      (partialResult.node.variants as { edges?: unknown[] })?.edges
        ?.length ?? 0,
    ).toBeGreaterThanOrEqual(1);
  });

  it("rejects conflicting duplicate children and parent mismatches", async () => {
    const conflictProduct = {
      id: "gid://shopify/Product/110",
      variants: openConnection(
        [ro3Variant("2701", "A")],
        "dup-cursor",
      ),
    };

    const conflict = createPaginator((request) => {
      const body = parseBody(request);
      return jsonResponse(200, {
        data: {
          product: {
            id: body.variables.id,
            // Same GID, different sku → conflicting duplicate
            variants: closedConnection([ro3Variant("2701", "B")]),
          },
        },
      });
    });

    const conflictResult = await conflict.paginator.completeProductNode(
      conflictProduct,
    );
    expect(conflictResult.complete).toBe(false);
    expect(conflictResult.evidence[0]?.failureReasons).toContain(
      "CONFLICTING_DUPLICATE",
    );

    const mismatch = createPaginator(() =>
      jsonResponse(200, {
        data: {
          product: {
            id: "gid://shopify/Product/OTHER",
            variants: closedConnection([ro3Variant("2102")]),
          },
        },
      }),
    );

    const mismatchResult = await mismatch.paginator.completeProductNode(
      ro3ProductMultiPageFirst,
    );
    expect(mismatchResult.complete).toBe(false);
    expect(mismatchResult.evidence[0]?.failureReasons).toContain(
      "PARENT_MISMATCH",
    );
  });

  it("completes inventory levels and fails closed on variant cardinality", async () => {
    const complete = createPaginator(() => {
      throw new Error("No continuation expected");
    });
    const completeResult =
      await complete.paginator.completeInventoryItemNode(
        ro3InventoryItemComplete,
      );
    expect(completeResult.complete).toBe(true);

    const multi = createPaginator((request) => {
      const body = parseBody(request);
      expect(body.query).toContain("StoreAgentRo3InventoryItemLevels");
      return jsonResponse(200, {
        data: {
          inventoryItem: {
            id: body.variables.id,
            inventoryLevels: ro3InventoryItemMultiLevelSecond,
          },
        },
      });
    });
    const multiResult = await multi.paginator.completeInventoryItemNode(
      ro3InventoryItemMultiLevelFirst,
    );
    expect(multiResult.complete).toBe(true);
    expect(
      (multiResult.node.inventoryLevels as { edges: unknown[] }).edges,
    ).toHaveLength(2);

    const cardinality =
      await complete.paginator.completeInventoryItemNode(
        ro3InventoryItemCardinalityViolation,
      );
    expect(cardinality.complete).toBe(false);
    expect(
      cardinality.evidence.some((entry) =>
        entry.failureReasons.includes("CARDINALITY_VIOLATION"),
      ),
    ).toBe(true);
  });

  it("preserves FO lineItem/location associations across nested FO line pages", async () => {
    const { paginator } = createPaginator((request) => {
      const body = parseBody(request);
      expect(body.query).toContain(
        "StoreAgentRo3FulfillmentOrderLineItems",
      );
      expect(body.variables.id).toBe(
        "gid://shopify/FulfillmentOrder/7201",
      );
      return jsonResponse(200, {
        data: {
          fulfillmentOrder: {
            id: body.variables.id,
            lineItems: ro3FoLineItemsSecondPage,
          },
        },
      });
    });

    const result = await paginator.completeOrderNode(
      ro3OrderFoLineItemsMultiFirst,
    );
    expect(result.complete).toBe(true);

    const fos = (
      result.node.fulfillmentOrders as {
        edges: Array<{ node: Record<string, unknown> }>;
      }
    ).edges;
    expect(fos).toHaveLength(1);
    const fo = fos[0]?.node;
    expect(fo?.id).toBe("gid://shopify/FulfillmentOrder/7201");
    const assigned = fo?.assignedLocation as {
      location: { id: string };
    };
    expect(assigned.location.id).toBe("gid://shopify/Location/4001");

    const foLines = (
      fo?.lineItems as {
        edges: Array<{
          node: {
            id: string;
            lineItem: { id: string };
          };
        }>;
      }
    ).edges;
    expect(foLines).toHaveLength(2);
    expect(foLines.map((edge) => edge.node.lineItem.id).sort()).toEqual([
      "gid://shopify/LineItem/8201",
      "gid://shopify/LineItem/8202",
    ]);
  });

  it("paginates order lineItems and rejects incomplete nested data at sync gate", async () => {
    const ok = createPaginator((request) => {
      const body = parseBody(request);
      return jsonResponse(200, {
        data: {
          order: {
            id: body.variables.id,
            lineItems: ro3OrderMultiPageLinesSecond,
          },
        },
      });
    });

    const okResult = await ok.paginator.completeOrderNode(
      ro3OrderMultiPageLinesFirst,
    );
    expect(okResult.complete).toBe(true);

    const single = createPaginator(() => {
      throw new Error("unused");
    });
    const singleResult = await single.paginator.completeOrderNode(
      ro3OrderComplete,
    );
    expect(singleResult.complete).toBe(true);

    const incomplete = await single.paginator.completeResourceNodes({
      resource: "products",
      nodes: [ro3ProductNoPageInfo],
      topLevelHasNextPage: false,
    });
    expect(incomplete.complete).toBe(false);
    expect(incomplete.acceptableAsCompleteSyncInput).toBe(false);
    expect(
      mayAcceptRo3NestedPaginationAsCompleteSyncInput(incomplete),
    ).toBe(false);
    expect(
      mayAcceptAsCompleteShopifySyncInput({
        topLevelHasNextPage: false,
        nestedAssessments: incomplete.assessments,
      }),
    ).toBe(false);

    // Top-level still open → refuse even if nested children look closed.
    const topOpen = await single.paginator.completeResourceNodes({
      resource: "products",
      nodes: [ro3ProductSinglePage],
      topLevelHasNextPage: true,
    });
    expect(topOpen.complete).toBe(false);
    expect(topOpen.acceptableAsCompleteSyncInput).toBe(false);
  });

  it("never treats full first:N without closed pageInfo as completeness proof", async () => {
    const { paginator } = createPaginator(() => {
      throw new Error("unused");
    });

    const fullFirstWithoutProof = {
      id: "gid://shopify/Product/111",
      variants: {
        edges: Array.from({ length: 100 }, (_, i) => ({
          node: ro3Variant(String(2800 + i)),
        })),
        // Intentionally omit pageInfo
      },
    };

    const result = await paginator.completeProductNode(
      fullFirstWithoutProof,
    );
    expect(result.complete).toBe(false);
    expect(result.evidence[0]?.failureReasons).toContain(
      "MISSING_PAGE_INFO",
    );
    expect(result.evidence[0]?.nodeCount).toBe(100);
  });
});
