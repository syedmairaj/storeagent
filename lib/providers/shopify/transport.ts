/**
 * Shopify-RO.2 injectable read-only Admin GraphQL transport.
 *
 * Responsibilities:
 * - execute pinned read-only operations
 * - classify HTTP / GraphQL errors
 * - bounded retries for throttle/429/5xx
 * - cost-budget pacing
 * - cursor pagination safeguards
 *
 * Non-responsibilities (strict separation):
 * - normalization / RO.1 mapping
 * - ProviderBinding
 * - SyncRun / DB persistence
 * - OAuth / token storage / webhooks / SDK
 * - engine metrics / forecasts / decisions
 */

import {
  SHOPIFY_ADMIN_API_VERSION,
  SHOPIFY_RO2_TRANSPORT_VERSION,
  shopifyAdminGraphqlEndpoint,
} from "./api-version";

import {
  shopifyRo2Operation,
  type ShopifyRo2ResourceOperation,
} from "./operations";

import {
  budgetWaitMs,
  classifyShopifyRo2GraphqlErrors,
  classifyShopifyRo2HttpStatus,
  parseShopifyRo2CostExtensions,
  parseShopifyRo2GraphqlErrors,
  readRetryAfterMs,
  shopifyRo2RetryExhausted,
} from "./transport-errors";

import {
  clampShopifyRo2PageSize,
  readShopifyRo2ConnectionNodes,
  readShopifyRo2PageInfo,
  resolveShopifyRo2MaxPages,
  ShopifyRo2CursorGuard,
} from "./transport-pagination";

import {
  ShopifyRo2TransportError,
  type ShopifyRo2ConnectionPage,
  type ShopifyRo2CostExtensions,
  type ShopifyRo2ExecutePageInput,
  type ShopifyRo2GraphqlError,
  type ShopifyRo2TransportConfig,
} from "./transport-types";

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function headerMap(
  headers: Readonly<Record<string, string>>,
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    result[key.toLowerCase()] = value;
  }

  return result;
}

function connectionFieldForResource(
  resource: ShopifyRo2ResourceOperation,
): string {
  switch (resource) {
    case "products":
      return "products";
    case "locations":
      return "locations";
    case "inventoryItems":
      return "inventoryItems";
    case "orders":
      return "orders";
  }
}

export class ShopifyRo2GraphqlTransport {
  private readonly endpoint: string;
  private readonly accessToken: string;
  private readonly http: ShopifyRo2TransportConfig["http"];
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly nowMs: () => number;
  private readonly maxRetries: number;
  private readonly pageSize: number;
  private readonly maxPages: number;
  private readonly minAvailableCostBudget: number;
  private readonly baseBackoffMs: number;

  constructor(config: ShopifyRo2TransportConfig) {
    if (!config.accessToken.trim()) {
      throw new ShopifyRo2TransportError({
        code: "TRANSPORT_MISCONFIGURED",
        message:
          "Shopify RO.2 accessToken must be a non-empty ephemeral string.",
        retryable: false,
      });
    }

    this.endpoint = shopifyAdminGraphqlEndpoint(
      config.shopDomain,
      SHOPIFY_ADMIN_API_VERSION,
    );
    this.accessToken = config.accessToken;
    this.http = config.http;
    this.sleep = config.sleep ?? defaultSleep;
    this.nowMs = config.nowMs ?? (() => Date.now());
    this.maxRetries =
      config.maxRetries === undefined ? 3 : config.maxRetries;
    this.pageSize = clampShopifyRo2PageSize(config.pageSize);
    this.maxPages = resolveShopifyRo2MaxPages(config.maxPages);
    this.minAvailableCostBudget =
      config.minAvailableCostBudget === undefined
        ? 50
        : config.minAvailableCostBudget;
    this.baseBackoffMs =
      config.baseBackoffMs === undefined
        ? 1000
        : config.baseBackoffMs;

    if (
      !Number.isInteger(this.maxRetries) ||
      this.maxRetries < 0
    ) {
      throw new ShopifyRo2TransportError({
        code: "TRANSPORT_MISCONFIGURED",
        message:
          "Shopify RO.2 maxRetries must be a non-negative integer.",
        retryable: false,
      });
    }
  }

  get apiVersion(): typeof SHOPIFY_ADMIN_API_VERSION {
    return SHOPIFY_ADMIN_API_VERSION;
  }

  get transportVersion(): typeof SHOPIFY_RO2_TRANSPORT_VERSION {
    return SHOPIFY_RO2_TRANSPORT_VERSION;
  }

  /**
   * Fetch a single connection page. Does not auto-loop.
   */
  async executePage(
    input: ShopifyRo2ExecutePageInput,
  ): Promise<ShopifyRo2ConnectionPage<unknown>> {
    const operation = shopifyRo2Operation(input.resource);
    const after =
      input.after === undefined ? null : input.after;

    const { data, cost } = await this.executeGraphql({
      document: operation.document,
      variables: {
        first: this.pageSize,
        after,
      },
    });

    const field = connectionFieldForResource(input.resource);
    const connection = data[field];
    const pageInfo = readShopifyRo2PageInfo(connection);
    const nodes = readShopifyRo2ConnectionNodes(connection);

    return {
      resource: input.resource,
      nodes,
      pageInfo,
      cursorAfter: pageInfo.hasNextPage
        ? pageInfo.endCursor
        : null,
      cost,
      apiVersion: SHOPIFY_ADMIN_API_VERSION,
      transportVersion: SHOPIFY_RO2_TRANSPORT_VERSION,
    };
  }

  /**
   * Paginate a resource with cursor-loop and max-page safeguards.
   *
   * Yields raw provider nodes only. Callers own normalization.
   */
  async *iterateResource(
    resource: ShopifyRo2ResourceOperation,
    startAfter: string | null = null,
  ): AsyncGenerator<ShopifyRo2ConnectionPage<unknown>, void, void> {
    const guard = new ShopifyRo2CursorGuard(this.maxPages);
    let after = startAfter;

    for (;;) {
      guard.beginPage(after);

      const page = await this.executePage({
        resource,
        after,
      });

      yield page;

      if (!page.pageInfo.hasNextPage) {
        return;
      }

      after = guard.assertNextCursor(page.pageInfo.endCursor);
    }
  }

  private async executeGraphql(input: {
    document: string;
    variables: Record<string, unknown>;
  }): Promise<{
    data: Record<string, unknown>;
    cost: ShopifyRo2CostExtensions | null;
  }> {
    let attempt = 0;
    let lastRetryable: ShopifyRo2TransportError | null = null;

    while (attempt <= this.maxRetries) {
      attempt += 1;

      try {
        return await this.executeGraphqlOnce(input, attempt);
      } catch (error) {
        if (!(error instanceof ShopifyRo2TransportError)) {
          throw error;
        }

        if (!error.retryable || attempt > this.maxRetries) {
          if (
            error.retryable &&
            attempt > this.maxRetries
          ) {
            throw shopifyRo2RetryExhausted(error, attempt);
          }

          throw error;
        }

        lastRetryable = error;

        const retryAfterMs = readRetryAfterMs(
          {},
          error.graphqlErrors.find(
            (entry) => entry.retryAfterSeconds !== null,
          )?.retryAfterSeconds ?? null,
          this.baseBackoffMs,
          attempt,
        );

        await this.sleep(retryAfterMs);
      }
    }

    if (lastRetryable) {
      throw shopifyRo2RetryExhausted(
        lastRetryable,
        attempt,
      );
    }

    throw new ShopifyRo2TransportError({
      code: "RETRY_EXHAUSTED",
      message: "Shopify RO.2 transport retries exhausted.",
      retryable: false,
      attempts: attempt,
    });
  }

  private async executeGraphqlOnce(
    input: {
      document: string;
      variables: Record<string, unknown>;
    },
    attempt: number,
  ): Promise<{
    data: Record<string, unknown>;
    cost: ShopifyRo2CostExtensions | null;
  }> {
    // Touch clock so injectors can observe attempt timing in tests.
    void this.nowMs();

    const body = JSON.stringify({
      query: input.document,
      variables: input.variables,
    });

    const response = await this.http.request({
      url: this.endpoint,
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "x-shopify-access-token": this.accessToken,
      },
      body,
    });

    const headers = headerMap(response.headers);
    const httpClassification = classifyShopifyRo2HttpStatus(
      response.status,
    );

    if (httpClassification !== null) {
      const retryAfterMs = readRetryAfterMs(
        headers,
        null,
        this.baseBackoffMs,
        attempt,
      );

      const httpErrors: ShopifyRo2GraphqlError[] =
        httpClassification.retryable
          ? [
              {
                message: `Shopify Admin GraphQL HTTP ${response.status}.`,
                code: httpClassification.code,
                retryAfterSeconds: retryAfterMs / 1000,
                path: null,
              },
            ]
          : [];

      throw new ShopifyRo2TransportError({
        code: httpClassification.code,
        message: `Shopify Admin GraphQL HTTP ${response.status}.`,
        httpStatus: response.status,
        graphqlErrors: httpErrors,
        retryable: httpClassification.retryable,
        attempts: attempt,
      });
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(response.bodyText) as unknown;
    } catch {
      throw new ShopifyRo2TransportError({
        code: "MALFORMED_RESPONSE",
        message:
          "Shopify Admin GraphQL response body is not valid JSON.",
        httpStatus: response.status,
        retryable: false,
        attempts: attempt,
      });
    }

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new ShopifyRo2TransportError({
        code: "MALFORMED_RESPONSE",
        message:
          "Shopify Admin GraphQL response must be a JSON object.",
        httpStatus: response.status,
        retryable: false,
        attempts: attempt,
      });
    }

    const envelope = parsed as Record<string, unknown>;
    const cost = parseShopifyRo2CostExtensions(
      envelope.extensions,
    );
    const graphqlErrors = parseShopifyRo2GraphqlErrors(
      envelope.errors,
    );

    const graphqlClassification =
      classifyShopifyRo2GraphqlErrors(graphqlErrors);

    if (graphqlClassification !== null) {
      throw new ShopifyRo2TransportError({
        code: graphqlClassification.code,
        message:
          graphqlErrors[0]?.message ??
          "Shopify Admin GraphQL returned errors.",
        httpStatus: response.status,
        graphqlErrors,
        cost,
        retryable: graphqlClassification.retryable,
        attempts: attempt,
      });
    }

    const data = envelope.data;

    if (
      typeof data !== "object" ||
      data === null ||
      Array.isArray(data)
    ) {
      throw new ShopifyRo2TransportError({
        code: "MALFORMED_RESPONSE",
        message:
          "Shopify Admin GraphQL response data must be an object.",
        httpStatus: response.status,
        cost,
        retryable: false,
        attempts: attempt,
      });
    }

    const waitMs = budgetWaitMs(
      cost,
      this.minAvailableCostBudget,
    );

    if (waitMs > 0) {
      await this.sleep(waitMs);
    }

    return {
      data: data as Record<string, unknown>,
      cost,
    };
  }
}

export function createShopifyRo2GraphqlTransport(
  config: ShopifyRo2TransportConfig,
): ShopifyRo2GraphqlTransport {
  return new ShopifyRo2GraphqlTransport(config);
}
