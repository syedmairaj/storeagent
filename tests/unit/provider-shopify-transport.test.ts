import {
  describe,
  expect,
  it,
} from "vitest";

import {
  SHOPIFY_ADMIN_API_VERSION,
  SHOPIFY_RO2_TRANSPORT_VERSION,
  shopifyAdminGraphqlEndpoint,
} from "@/lib/providers/shopify/api-version";

import {
  SHOPIFY_RO2_OPERATIONS,
  SHOPIFY_RO2_INVENTORY_QUANTITY_NAMES,
} from "@/lib/providers/shopify/operations";

import {
  createShopifyRo2GraphqlTransport,
} from "@/lib/providers/shopify/transport";

import {
  ShopifyRo2TransportError,
  type ShopifyGraphqlHttp,
  type ShopifyGraphqlHttpRequest,
  type ShopifyGraphqlHttpResponse,
} from "@/lib/providers/shopify/transport-types";

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): ShopifyGraphqlHttpResponse {
  return {
    status,
    headers,
    bodyText: JSON.stringify(body),
  };
}

function connectionPage(input: {
  nodes: unknown[];
  hasNextPage: boolean;
  endCursor: string | null;
  costAvailable?: number;
}) {
  return {
    data: {
      products: {
        edges: input.nodes.map((node, index) => ({
          cursor: `cursor-${index}`,
          node,
        })),
        pageInfo: {
          hasNextPage: input.hasNextPage,
          endCursor: input.endCursor,
        },
      },
    },
    extensions: {
      cost: {
        requestedQueryCost: 10,
        actualQueryCost: 8,
        throttleStatus: {
          maximumAvailable: 1000,
          currentlyAvailable: input.costAvailable ?? 900,
          restoreRate: 50,
        },
      },
    },
  };
}

function mockHttp(
  handler: (
    request: ShopifyGraphqlHttpRequest,
  ) => Promise<ShopifyGraphqlHttpResponse> | ShopifyGraphqlHttpResponse,
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

describe("Shopify-RO.2 API version pin", () => {
  it("pins Admin API 2026-10 and builds the GraphQL endpoint", () => {
    expect(SHOPIFY_ADMIN_API_VERSION).toBe("2026-10");
    expect(SHOPIFY_RO2_TRANSPORT_VERSION).toBe("shopify-ro.2-v1");
    expect(
      shopifyAdminGraphqlEndpoint("Example.myshopify.com"),
    ).toBe(
      "https://example.myshopify.com/admin/api/2026-10/graphql.json",
    );
  });

  it("defines read-only operations for approved resources only", () => {
    expect(Object.keys(SHOPIFY_RO2_OPERATIONS).sort()).toEqual([
      "inventoryItems",
      "locations",
      "orders",
      "products",
    ]);

    for (const operation of Object.values(SHOPIFY_RO2_OPERATIONS)) {
      expect(operation.readOnly).toBe(true);
      expect(operation.apiVersion).toBe("2026-10");
      expect(operation.document).not.toMatch(/\bmutation\b/i);
      expect(operation.document).toContain("pageInfo");
    }

    expect([...SHOPIFY_RO2_INVENTORY_QUANTITY_NAMES]).toEqual([
      "on_hand",
      "available",
      "committed",
      "incoming",
    ]);

    expect(
      SHOPIFY_RO2_OPERATIONS.inventoryItems.document,
    ).toContain(
      'quantities(names: ["on_hand", "available", "committed", "incoming"])',
    );

    expect(SHOPIFY_RO2_OPERATIONS.orders.document).toContain(
      "fulfillmentOrders",
    );
    expect(SHOPIFY_RO2_OPERATIONS.orders.document).toContain(
      "assignedLocation",
    );
    // LineItem has no location field on Admin API 2026-10.
    expect(SHOPIFY_RO2_OPERATIONS.orders.document).not.toContain(
      "lineItemLocation",
    );
    const lineItemBlock =
      SHOPIFY_RO2_OPERATIONS.orders.document.match(
        /lineItems\(first: 100\) \{[\s\S]*?\n        \}/,
      )?.[0] ?? "";
    expect(lineItemBlock).toContain("variant");
    expect(lineItemBlock).not.toContain("location {");
  });
});

describe("Shopify-RO.2 injectable transport", () => {
  it("executes a page through injected HTTP without global network", async () => {
    const { http, requests } = mockHttp(() =>
      jsonResponse(
        200,
        connectionPage({
          nodes: [{ id: "gid://shopify/Product/1", title: "A" }],
          hasNextPage: false,
          endCursor: null,
        }),
      ),
    );

    const transport = createShopifyRo2GraphqlTransport({
      shopDomain: "snap.myshopify.com",
      accessToken: "shpat_test_ephemeral",
      http,
      sleep: async () => undefined,
    });

    const page = await transport.executePage({
      resource: "products",
      after: null,
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toContain(
      "/admin/api/2026-10/graphql.json",
    );
    expect(requests[0]?.headers["x-shopify-access-token"]).toBe(
      "shpat_test_ephemeral",
    );
    expect(page.nodes).toHaveLength(1);
    expect(page.cursorAfter).toBeNull();
    expect(page.apiVersion).toBe("2026-10");
    expect(page.cost?.throttleStatus?.currentlyAvailable).toBe(900);
  });

  it("paginates until hasNextPage is false", async () => {
    let call = 0;
    const { http } = mockHttp(() => {
      call += 1;

      if (call === 1) {
        return jsonResponse(
          200,
          connectionPage({
            nodes: [{ id: "gid://shopify/Product/1" }],
            hasNextPage: true,
            endCursor: "CURSOR_A",
          }),
        );
      }

      return jsonResponse(
        200,
        connectionPage({
          nodes: [{ id: "gid://shopify/Product/2" }],
          hasNextPage: false,
          endCursor: "CURSOR_B",
        }),
      );
    });

    const transport = createShopifyRo2GraphqlTransport({
      shopDomain: "snap.myshopify.com",
      accessToken: "token",
      http,
      sleep: async () => undefined,
      pageSize: 1,
    });

    const pages = [];

    for await (const page of transport.iterateResource("products")) {
      pages.push(page);
    }

    expect(pages).toHaveLength(2);
    expect(pages[0]?.cursorAfter).toBe("CURSOR_A");
    expect(pages[1]?.cursorAfter).toBeNull();
  });

  it("fails closed on pagination cursor loops", async () => {
    const { http } = mockHttp(() =>
      jsonResponse(
        200,
        connectionPage({
          nodes: [{ id: "gid://shopify/Product/1" }],
          hasNextPage: true,
          endCursor: "SAME",
        }),
      ),
    );

    const transport = createShopifyRo2GraphqlTransport({
      shopDomain: "snap.myshopify.com",
      accessToken: "token",
      http,
      sleep: async () => undefined,
      maxPages: 5,
    });

    await expect(async () => {
      for await (const page of transport.iterateResource(
        "products",
        "SAME",
      )) {
        expect(page.nodes.length).toBeGreaterThan(0);
      }
    }).rejects.toMatchObject({
      code: "PAGINATION_CURSOR_LOOP",
    });
  });

  it("fails closed when pagination exceeds maxPages", async () => {
    let call = 0;
    const { http, requests } = mockHttp(() => {
      call += 1;
      return jsonResponse(
        200,
        connectionPage({
          nodes: [{ id: `gid://shopify/Product/${call}` }],
          hasNextPage: true,
          endCursor: `CURSOR_${call}`,
        }),
      );
    });

    const transport = createShopifyRo2GraphqlTransport({
      shopDomain: "snap.myshopify.com",
      accessToken: "token",
      http,
      sleep: async () => undefined,
      maxPages: 2,
      pageSize: 1,
    });

    await expect(async () => {
      for await (const page of transport.iterateResource("products")) {
        expect(page.pageInfo.hasNextPage).toBe(true);
      }
    }).rejects.toMatchObject({
      code: "PAGINATION_PAGE_LIMIT",
      retryable: false,
    });

    // Two successful pages, then guard rejects before a third request.
    expect(requests).toHaveLength(2);
  });

  it("classifies malformed JSON responses", async () => {
    const { http } = mockHttp(() => ({
      status: 200,
      headers: {},
      bodyText: "{not-json",
    }));

    const transport = createShopifyRo2GraphqlTransport({
      shopDomain: "snap.myshopify.com",
      accessToken: "token",
      http,
      sleep: async () => undefined,
    });

    await expect(
      transport.executePage({ resource: "products" }),
    ).rejects.toMatchObject({
      code: "MALFORMED_RESPONSE",
    });
  });

  it("classifies 401 and 403 as non-retryable auth errors", async () => {
    for (const [status, code] of [
      [401, "AUTH_UNAUTHORIZED"],
      [403, "AUTH_FORBIDDEN"],
    ] as const) {
      const { http, requests } = mockHttp(() =>
        jsonResponse(status, { errors: [{ message: "nope" }] }),
      );

      const transport = createShopifyRo2GraphqlTransport({
        shopDomain: "snap.myshopify.com",
        accessToken: "token",
        http,
        sleep: async () => undefined,
        maxRetries: 3,
      });

      await expect(
        transport.executePage({ resource: "locations" }),
      ).rejects.toMatchObject({
        code,
        retryable: false,
      });

      expect(requests).toHaveLength(1);
    }
  });

  it("retries HTTP 429 honoring Retry-After then succeeds", async () => {
    let call = 0;
    const sleeps: number[] = [];

    const { http, requests } = mockHttp(() => {
      call += 1;

      if (call === 1) {
        return jsonResponse(
          429,
          { errors: [{ message: "slow down" }] },
          { "retry-after": "2" },
        );
      }

      return jsonResponse(
        200,
        connectionPage({
          nodes: [{ id: "gid://shopify/Product/9" }],
          hasNextPage: false,
          endCursor: null,
        }),
      );
    });

    const transport = createShopifyRo2GraphqlTransport({
      shopDomain: "snap.myshopify.com",
      accessToken: "token",
      http,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      maxRetries: 2,
    });

    const page = await transport.executePage({
      resource: "products",
    });

    expect(page.nodes).toHaveLength(1);
    expect(requests).toHaveLength(2);
    expect(sleeps).toEqual([2000]);
  });

  it("retries HTTP 500 then succeeds", async () => {
    let call = 0;
    const { http, requests } = mockHttp(() => {
      call += 1;

      if (call === 1) {
        return jsonResponse(500, { errors: [{ message: "boom" }] });
      }

      return jsonResponse(
        200,
        connectionPage({
          nodes: [{ id: "gid://shopify/Product/500" }],
          hasNextPage: false,
          endCursor: null,
        }),
      );
    });

    const transport = createShopifyRo2GraphqlTransport({
      shopDomain: "snap.myshopify.com",
      accessToken: "token",
      http,
      sleep: async () => undefined,
      maxRetries: 2,
    });

    const page = await transport.executePage({
      resource: "products",
    });

    expect(page.nodes[0]).toMatchObject({
      id: "gid://shopify/Product/500",
    });
    expect(requests).toHaveLength(2);
  });

  it("retries HTTP 503 then exhausts within maxRetries", async () => {
    const { http, requests } = mockHttp(() =>
      jsonResponse(
        503,
        { errors: [{ message: "unavailable" }] },
        { "retry-after": "1" },
      ),
    );

    const transport = createShopifyRo2GraphqlTransport({
      shopDomain: "snap.myshopify.com",
      accessToken: "token",
      http,
      sleep: async () => undefined,
      maxRetries: 2,
    });

    try {
      await transport.executePage({ resource: "locations" });
      expect.unreachable("expected retry exhaustion");
    } catch (error) {
      expect(error).toBeInstanceOf(ShopifyRo2TransportError);
      expect(error).toMatchObject({
        code: "RETRY_EXHAUSTED",
      });
    }

    // initial + 2 retries = 3 attempts when maxRetries=2
    expect(requests).toHaveLength(3);
  });

  it("retries GraphQL THROTTLED then succeeds", async () => {
    let call = 0;

    const { http } = mockHttp(() => {
      call += 1;

      if (call === 1) {
        return jsonResponse(200, {
          errors: [
            {
              message: "Throttled",
              extensions: {
                code: "THROTTLED",
                retryAfter: 1.2,
              },
            },
          ],
          extensions: {
            cost: {
              requestedQueryCost: 200,
              actualQueryCost: null,
              throttleStatus: {
                maximumAvailable: 1000,
                currentlyAvailable: 10,
                restoreRate: 50,
              },
            },
          },
        });
      }

      return jsonResponse(
        200,
        connectionPage({
          nodes: [{ id: "gid://shopify/Product/3" }],
          hasNextPage: false,
          endCursor: null,
        }),
      );
    });

    const transport = createShopifyRo2GraphqlTransport({
      shopDomain: "snap.myshopify.com",
      accessToken: "token",
      http,
      sleep: async () => undefined,
      maxRetries: 2,
    });

    const page = await transport.executePage({
      resource: "products",
    });

    expect(page.nodes[0]).toMatchObject({
      id: "gid://shopify/Product/3",
    });
  });

  it("surfaces partial GraphQL errors without retry", async () => {
    const { http, requests } = mockHttp(() =>
      jsonResponse(200, {
        data: { products: null },
        errors: [
          {
            message: "Access denied for products field.",
            extensions: { code: "ACCESS_DENIED" },
          },
        ],
      }),
    );

    const transport = createShopifyRo2GraphqlTransport({
      shopDomain: "snap.myshopify.com",
      accessToken: "token",
      http,
      sleep: async () => undefined,
      maxRetries: 3,
    });

    await expect(
      transport.executePage({ resource: "products" }),
    ).rejects.toMatchObject({
      code: "PARTIAL_GRAPHQL_ERRORS",
      retryable: false,
    });

    expect(requests).toHaveLength(1);
  });

  it("exhausts retries for persistent throttling", async () => {
    const { http, requests } = mockHttp(() =>
      jsonResponse(200, {
        errors: [
          {
            message: "Throttled",
            extensions: { code: "THROTTLED", retryAfter: 1 },
          },
        ],
      }),
    );

    const transport = createShopifyRo2GraphqlTransport({
      shopDomain: "snap.myshopify.com",
      accessToken: "token",
      http,
      sleep: async () => undefined,
      maxRetries: 2,
    });

    try {
      await transport.executePage({ resource: "products" });
      expect.unreachable("expected retry exhaustion");
    } catch (error) {
      expect(error).toBeInstanceOf(ShopifyRo2TransportError);
      expect(error).toMatchObject({
        code: "RETRY_EXHAUSTED",
      });
    }

    // initial + 2 retries = 3 attempts when maxRetries=2
    expect(requests).toHaveLength(3);
  });

  it("paces when cost budget falls below configured floor", async () => {
    const sleeps: number[] = [];

    const { http } = mockHttp(() =>
      jsonResponse(
        200,
        connectionPage({
          nodes: [{ id: "gid://shopify/Product/4" }],
          hasNextPage: false,
          endCursor: null,
          costAvailable: 5,
        }),
      ),
    );

    const transport = createShopifyRo2GraphqlTransport({
      shopDomain: "snap.myshopify.com",
      accessToken: "token",
      http,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      minAvailableCostBudget: 50,
    });

    await transport.executePage({ resource: "products" });

    expect(sleeps.length).toBe(1);
    expect(sleeps[0]).toBeGreaterThanOrEqual(1000);
  });

  it("rejects MAX_COST_EXCEEDED without retry", async () => {
    const { http, requests } = mockHttp(() =>
      jsonResponse(200, {
        errors: [
          {
            message: "Query cost too high",
            extensions: { code: "MAX_COST_EXCEEDED" },
          },
        ],
      }),
    );

    const transport = createShopifyRo2GraphqlTransport({
      shopDomain: "snap.myshopify.com",
      accessToken: "token",
      http,
      sleep: async () => undefined,
      maxRetries: 5,
    });

    await expect(
      transport.executePage({ resource: "orders" }),
    ).rejects.toMatchObject({
      code: "MAX_COST_EXCEEDED",
      retryable: false,
    });

    expect(requests).toHaveLength(1);
  });
});

describe("Shopify-RO.2/RO.3 nested connection completeness gate", () => {
  /**
   * RO.3 requests nested pageInfo on required child connections.
   * A full first:N page or top-level hasNextPage=false alone still must
   * never be treated as catalog completeness without following nested
   * cursors (or explicit attestation). See RO.3 nested-pagination tests.
   */
  const NESTED_FIRST_WITH_PAGEINFO = [
    {
      resource: "products" as const,
      needle: "variants(first: 100)",
    },
    {
      resource: "inventoryItems" as const,
      needle: "inventoryLevels(first: 50)",
    },
    {
      resource: "orders" as const,
      needle: "lineItems(first: 100)",
    },
    {
      resource: "orders" as const,
      needle: "fulfillmentOrders(first: 20)",
    },
  ];

  it("requires nested pageInfo on RO.3 child connections and keeps top-level gate", () => {
    for (const entry of NESTED_FIRST_WITH_PAGEINFO) {
      const document = SHOPIFY_RO2_OPERATIONS[entry.resource].document;
      expect(document).toContain(entry.needle);

      const nestedBlockStart = document.indexOf(entry.needle);
      expect(nestedBlockStart).toBeGreaterThanOrEqual(0);

      const fromNeedle = document.slice(nestedBlockStart);
      const openBrace = fromNeedle.indexOf("{");
      expect(openBrace).toBeGreaterThanOrEqual(0);

      let depth = 0;
      let end = -1;

      for (let i = openBrace; i < fromNeedle.length; i += 1) {
        const ch = fromNeedle[i];

        if (ch === "{") {
          depth += 1;
        } else if (ch === "}") {
          depth -= 1;

          if (depth === 0) {
            end = i;
            break;
          }
        }
      }

      expect(end).toBeGreaterThan(openBrace);
      const nestedBlock = fromNeedle.slice(0, end + 1);
      expect(nestedBlock).toContain("pageInfo");
      expect(nestedBlock).toContain("hasNextPage");
      expect(nestedBlock).toContain("endCursor");
    }

    expect(
      SHOPIFY_RO2_OPERATIONS.products.document,
    ).toContain("pageInfo");
  });
});
