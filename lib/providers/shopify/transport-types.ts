/**
 * Shopify-RO.2 transport boundary types.
 *
 * Transport obtains raw Admin GraphQL pages. It does not normalize into
 * canonical candidates, resolve ProviderBinding, or persist SyncRun.
 */

import type {
  ShopifyAdminApiVersion,
  ShopifyRo2TransportVersion,
} from "./api-version";

import type {
  ShopifyRo2ResourceOperation,
} from "./operations";

/**
 * Injectable HTTP surface. Tests supply a mock. Production adapters may
 * wrap a platform HTTP client later — RO.2 never calls the network
 * directly and never embeds an SDK.
 */
export interface ShopifyGraphqlHttpRequest {
  url: string;
  method: "POST";
  headers: Readonly<Record<string, string>>;
  body: string;
}

export interface ShopifyGraphqlHttpResponse {
  status: number;
  /**
   * Header names should be lower-cased by the adapter when possible.
   */
  headers: Readonly<Record<string, string>>;
  bodyText: string;
}

export interface ShopifyGraphqlHttp {
  request(
    input: ShopifyGraphqlHttpRequest,
  ): Promise<ShopifyGraphqlHttpResponse>;
}

export type ShopifyRo2TransportErrorCode =
  | "AUTH_UNAUTHORIZED"
  | "AUTH_FORBIDDEN"
  | "HTTP_RATE_LIMITED"
  | "GRAPHQL_THROTTLED"
  | "MAX_COST_EXCEEDED"
  | "PARTIAL_GRAPHQL_ERRORS"
  | "MALFORMED_RESPONSE"
  | "PAGINATION_CURSOR_LOOP"
  | "PAGINATION_PAGE_LIMIT"
  | "RETRY_EXHAUSTED"
  | "HTTP_ERROR"
  | "TRANSPORT_MISCONFIGURED";

export interface ShopifyRo2ThrottleStatus {
  maximumAvailable: number | null;
  currentlyAvailable: number | null;
  restoreRate: number | null;
}

export interface ShopifyRo2CostExtensions {
  requestedQueryCost: number | null;
  actualQueryCost: number | null;
  throttleStatus: ShopifyRo2ThrottleStatus | null;
}

export interface ShopifyRo2GraphqlError {
  message: string;
  code: string | null;
  retryAfterSeconds: number | null;
  path: ReadonlyArray<string | number> | null;
}

export class ShopifyRo2TransportError extends Error {
  readonly code: ShopifyRo2TransportErrorCode;
  readonly httpStatus: number | null;
  readonly graphqlErrors: ReadonlyArray<ShopifyRo2GraphqlError>;
  readonly cost: ShopifyRo2CostExtensions | null;
  readonly retryable: boolean;
  readonly attempts: number;

  constructor(input: {
    code: ShopifyRo2TransportErrorCode;
    message: string;
    httpStatus?: number | null;
    graphqlErrors?: ReadonlyArray<ShopifyRo2GraphqlError>;
    cost?: ShopifyRo2CostExtensions | null;
    retryable?: boolean;
    attempts?: number;
  }) {
    super(input.message);
    this.name = "ShopifyRo2TransportError";
    this.code = input.code;
    this.httpStatus = input.httpStatus ?? null;
    this.graphqlErrors = input.graphqlErrors ?? [];
    this.cost = input.cost ?? null;
    this.retryable = input.retryable ?? false;
    this.attempts = input.attempts ?? 1;
  }
}

export interface ShopifyRo2PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

export interface ShopifyRo2ConnectionPage<TNode> {
  resource: ShopifyRo2ResourceOperation;
  nodes: ReadonlyArray<TNode>;
  pageInfo: ShopifyRo2PageInfo;
  /**
   * Opaque cursor to resume after this page (SyncRun provenance only).
   */
  cursorAfter: string | null;
  cost: ShopifyRo2CostExtensions | null;
  apiVersion: ShopifyAdminApiVersion;
  transportVersion: ShopifyRo2TransportVersion;
}

export interface ShopifyRo2TransportConfig {
  /**
   * Shop hostname, e.g. `example.myshopify.com`.
   */
  shopDomain: string;

  /**
   * Ephemeral Admin API access token for Authorization header construction.
   * Transport never persists, logs, or returns this value.
   */
  accessToken: string;

  /**
   * Required injectable HTTP. Tests must mock this — no real network.
   */
  http: ShopifyGraphqlHttp;

  /**
   * Injected delay. Defaults to a real timer; tests inject a no-op/fake.
   */
  sleep?: (ms: number) => Promise<void>;

  /**
   * Monotonic/wall clock in ms. Tests inject a fake clock.
   */
  nowMs?: () => number;

  /**
   * Bounded retries for retryable transport failures (default 3).
   */
  maxRetries?: number;

  /**
   * Page size for connection `first` (clamped 1–250, default 50).
   */
  pageSize?: number;

  /**
   * Hard stop for pagination loops (default 100 pages per resource sync).
   */
  maxPages?: number;

  /**
   * When `currentlyAvailable` falls below this budget, transport waits
   * for restore before the next request (default 50).
   */
  minAvailableCostBudget?: number;

  /**
   * Base backoff in ms when Retry-After is absent (default 1000).
   */
  baseBackoffMs?: number;
}

export interface ShopifyRo2ExecutePageInput {
  resource: ShopifyRo2ResourceOperation;
  /**
   * Opaque cursor from a prior page (`after`). null starts from the head.
   */
  after?: string | null;
}

/**
 * Read-only GraphQL document execution (RO.3 nested continuations).
 * Callers must supply approved operation documents only — no mutations.
 */
export interface ShopifyRo2ExecuteDocumentInput {
  document: string;
  variables: Readonly<Record<string, unknown>>;
}

export interface ShopifyRo2ExecuteDocumentResult {
  data: Record<string, unknown>;
  cost: ShopifyRo2CostExtensions | null;
  apiVersion: ShopifyAdminApiVersion;
  transportVersion: ShopifyRo2TransportVersion;
}
