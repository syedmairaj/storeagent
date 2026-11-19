import {
  normalizeShopifyCursor,
} from "./pagination";

import {
  ShopifyRo2TransportError,
} from "./transport-types";

export const SHOPIFY_RO2_DEFAULT_PAGE_SIZE = 50;
export const SHOPIFY_RO2_MAX_PAGE_SIZE = 250;
export const SHOPIFY_RO2_DEFAULT_MAX_PAGES = 100;

export function clampShopifyRo2PageSize(
  pageSize: number | undefined,
): number {
  const raw =
    pageSize === undefined
      ? SHOPIFY_RO2_DEFAULT_PAGE_SIZE
      : pageSize;

  if (!Number.isInteger(raw) || raw < 1) {
    throw new ShopifyRo2TransportError({
      code: "TRANSPORT_MISCONFIGURED",
      message:
        "Shopify RO.2 pageSize must be a positive integer.",
      retryable: false,
    });
  }

  return Math.min(raw, SHOPIFY_RO2_MAX_PAGE_SIZE);
}

export function resolveShopifyRo2MaxPages(
  maxPages: number | undefined,
): number {
  const raw =
    maxPages === undefined
      ? SHOPIFY_RO2_DEFAULT_MAX_PAGES
      : maxPages;

  if (!Number.isInteger(raw) || raw < 1) {
    throw new ShopifyRo2TransportError({
      code: "TRANSPORT_MISCONFIGURED",
      message:
        "Shopify RO.2 maxPages must be a positive integer.",
      retryable: false,
    });
  }

  return raw;
}

/**
 * Opaque cursor safeguards for Shopify connection pagination.
 *
 * Cursors are never parsed into business identity.
 */
export class ShopifyRo2CursorGuard {
  private readonly seenCursors = new Set<string>();
  private pagesFetched = 0;

  constructor(
    private readonly maxPages: number,
  ) {}

  get pageCount(): number {
    return this.pagesFetched;
  }

  /**
   * Record that a page was fetched using `after` as the request cursor.
   */
  beginPage(after: string | null): void {
    this.pagesFetched += 1;

    if (this.pagesFetched > this.maxPages) {
      throw new ShopifyRo2TransportError({
        code: "PAGINATION_PAGE_LIMIT",
        message: `Shopify RO.2 pagination exceeded maxPages=${this.maxPages}.`,
        retryable: false,
      });
    }

    const normalized = normalizeShopifyCursor(after);

    if (normalized !== null) {
      if (this.seenCursors.has(normalized)) {
        throw new ShopifyRo2TransportError({
          code: "PAGINATION_CURSOR_LOOP",
          message:
            "Shopify RO.2 pagination cursor repeated — refusing to continue.",
          retryable: false,
        });
      }

      this.seenCursors.add(normalized);
    }
  }

  /**
   * Validate the next cursor from pageInfo before the caller continues.
   */
  assertNextCursor(endCursor: string | null): string | null {
    return normalizeShopifyCursor(endCursor);
  }
}

export function readShopifyRo2PageInfo(
  connection: unknown,
): {
  hasNextPage: boolean;
  endCursor: string | null;
} {
  if (
    typeof connection !== "object" ||
    connection === null ||
    Array.isArray(connection)
  ) {
    throw new ShopifyRo2TransportError({
      code: "MALFORMED_RESPONSE",
      message:
        "Shopify RO.2 connection payload must be an object.",
      retryable: false,
    });
  }

  const pageInfo = (connection as Record<string, unknown>)
    .pageInfo;

  if (
    typeof pageInfo !== "object" ||
    pageInfo === null ||
    Array.isArray(pageInfo)
  ) {
    throw new ShopifyRo2TransportError({
      code: "MALFORMED_RESPONSE",
      message:
        "Shopify RO.2 connection pageInfo is required.",
      retryable: false,
    });
  }

  const info = pageInfo as Record<string, unknown>;
  const hasNextPage = info.hasNextPage;

  if (typeof hasNextPage !== "boolean") {
    throw new ShopifyRo2TransportError({
      code: "MALFORMED_RESPONSE",
      message:
        "Shopify RO.2 pageInfo.hasNextPage must be a boolean.",
      retryable: false,
    });
  }

  const endCursorRaw = info.endCursor;
  let endCursor: string | null = null;

  if (endCursorRaw === null || endCursorRaw === undefined) {
    endCursor = null;
  } else if (typeof endCursorRaw === "string") {
    endCursor = normalizeShopifyCursor(endCursorRaw);
  } else {
    throw new ShopifyRo2TransportError({
      code: "MALFORMED_RESPONSE",
      message:
        "Shopify RO.2 pageInfo.endCursor must be a string or null.",
      retryable: false,
    });
  }

  if (hasNextPage && endCursor === null) {
    throw new ShopifyRo2TransportError({
      code: "MALFORMED_RESPONSE",
      message:
        "Shopify RO.2 pageInfo.hasNextPage is true but endCursor is missing.",
      retryable: false,
    });
  }

  return {
    hasNextPage,
    endCursor,
  };
}

export function readShopifyRo2ConnectionNodes(
  connection: unknown,
): unknown[] {
  if (
    typeof connection !== "object" ||
    connection === null ||
    Array.isArray(connection)
  ) {
    throw new ShopifyRo2TransportError({
      code: "MALFORMED_RESPONSE",
      message:
        "Shopify RO.2 connection payload must be an object.",
      retryable: false,
    });
  }

  const edges = (connection as Record<string, unknown>).edges;

  if (!Array.isArray(edges)) {
    throw new ShopifyRo2TransportError({
      code: "MALFORMED_RESPONSE",
      message:
        "Shopify RO.2 connection edges must be an array.",
      retryable: false,
    });
  }

  const nodes: unknown[] = [];

  for (const edge of edges) {
    if (
      typeof edge !== "object" ||
      edge === null ||
      Array.isArray(edge)
    ) {
      throw new ShopifyRo2TransportError({
        code: "MALFORMED_RESPONSE",
        message:
          "Shopify RO.2 connection edge must be an object.",
        retryable: false,
      });
    }

    const node = (edge as Record<string, unknown>).node;

    if (node === undefined) {
      throw new ShopifyRo2TransportError({
        code: "MALFORMED_RESPONSE",
        message:
          "Shopify RO.2 connection edge.node is required.",
        retryable: false,
      });
    }

    nodes.push(node);
  }

  return nodes;
}
