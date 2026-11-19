import type {
  ShopifyRo2CostExtensions,
  ShopifyRo2GraphqlError,
  ShopifyRo2ThrottleStatus,
  ShopifyRo2TransportErrorCode,
} from "./transport-types";

import {
  ShopifyRo2TransportError,
} from "./transport-types";

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function readNumber(
  value: unknown,
): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : null;
}

function readString(
  value: unknown,
): string | null {
  return typeof value === "string" ? value : null;
}

export function parseShopifyRo2CostExtensions(
  extensions: unknown,
): ShopifyRo2CostExtensions | null {
  if (!isRecord(extensions)) {
    return null;
  }

  const cost = extensions.cost;

  if (!isRecord(cost)) {
    return null;
  }

  let throttleStatus: ShopifyRo2ThrottleStatus | null = null;
  const rawThrottle = cost.throttleStatus;

  if (isRecord(rawThrottle)) {
    throttleStatus = {
      maximumAvailable: readNumber(rawThrottle.maximumAvailable),
      currentlyAvailable: readNumber(rawThrottle.currentlyAvailable),
      restoreRate: readNumber(rawThrottle.restoreRate),
    };
  }

  return {
    requestedQueryCost: readNumber(cost.requestedQueryCost),
    actualQueryCost: readNumber(cost.actualQueryCost),
    throttleStatus,
  };
}

export function parseShopifyRo2GraphqlErrors(
  errors: unknown,
): ShopifyRo2GraphqlError[] {
  if (!Array.isArray(errors)) {
    return [];
  }

  const parsed: ShopifyRo2GraphqlError[] = [];

  for (const entry of errors) {
    if (!isRecord(entry)) {
      continue;
    }

    const message = readString(entry.message) ?? "Unknown GraphQL error.";
    const extensions = isRecord(entry.extensions)
      ? entry.extensions
      : null;
    const code = extensions
      ? readString(extensions.code)
      : null;
    const retryAfterSeconds = extensions
      ? readNumber(extensions.retryAfter)
      : null;

    let path: ReadonlyArray<string | number> | null = null;

    if (Array.isArray(entry.path)) {
      path = entry.path.filter(
        (segment): segment is string | number =>
          typeof segment === "string" || typeof segment === "number",
      );
    }

    parsed.push({
      message,
      code,
      retryAfterSeconds,
      path,
    });
  }

  return parsed;
}

export function classifyShopifyRo2HttpStatus(
  status: number,
): {
  code: ShopifyRo2TransportErrorCode;
  retryable: boolean;
} | null {
  if (status === 401) {
    return {
      code: "AUTH_UNAUTHORIZED",
      retryable: false,
    };
  }

  if (status === 403) {
    return {
      code: "AUTH_FORBIDDEN",
      retryable: false,
    };
  }

  if (status === 429) {
    return {
      code: "HTTP_RATE_LIMITED",
      retryable: true,
    };
  }

  if (status >= 500 && status <= 599) {
    return {
      code: "HTTP_ERROR",
      retryable: true,
    };
  }

  if (status < 200 || status >= 300) {
    return {
      code: "HTTP_ERROR",
      retryable: false,
    };
  }

  return null;
}

export function classifyShopifyRo2GraphqlErrors(
  errors: ReadonlyArray<ShopifyRo2GraphqlError>,
): {
  code: ShopifyRo2TransportErrorCode;
  retryable: boolean;
  retryAfterSeconds: number | null;
} | null {
  if (errors.length === 0) {
    return null;
  }

  const throttled = errors.find(
    (error) => error.code === "THROTTLED",
  );

  if (throttled) {
    return {
      code: "GRAPHQL_THROTTLED",
      retryable: true,
      retryAfterSeconds: throttled.retryAfterSeconds,
    };
  }

  const maxCost = errors.find(
    (error) => error.code === "MAX_COST_EXCEEDED",
  );

  if (maxCost) {
    return {
      code: "MAX_COST_EXCEEDED",
      retryable: false,
      retryAfterSeconds: null,
    };
  }

  return {
    code: "PARTIAL_GRAPHQL_ERRORS",
    retryable: false,
    retryAfterSeconds: null,
  };
}

export function readRetryAfterMs(
  headers: Readonly<Record<string, string>>,
  graphqlRetryAfterSeconds: number | null,
  baseBackoffMs: number,
  attempt: number,
): number {
  const headerValue =
    headers["retry-after"] ??
    headers["Retry-After"] ??
    null;

  if (headerValue !== null) {
    const asNumber = Number(headerValue);

    if (Number.isFinite(asNumber) && asNumber >= 0) {
      return Math.max(1000, Math.ceil(asNumber * 1000));
    }
  }

  if (
    graphqlRetryAfterSeconds !== null &&
    Number.isFinite(graphqlRetryAfterSeconds) &&
    graphqlRetryAfterSeconds >= 0
  ) {
    return Math.max(
      1000,
      Math.ceil(graphqlRetryAfterSeconds * 1000),
    );
  }

  const exponential = baseBackoffMs * 2 ** Math.max(0, attempt - 1);

  return Math.min(30_000, Math.max(baseBackoffMs, exponential));
}

export function budgetWaitMs(
  cost: ShopifyRo2CostExtensions | null,
  minAvailableCostBudget: number,
): number {
  if (cost === null || cost.throttleStatus === null) {
    return 0;
  }

  const available =
    cost.throttleStatus.currentlyAvailable;
  const restoreRate =
    cost.throttleStatus.restoreRate;

  if (
    available === null ||
    restoreRate === null ||
    restoreRate <= 0
  ) {
    return 0;
  }

  if (available >= minAvailableCostBudget) {
    return 0;
  }

  const deficit = minAvailableCostBudget - available;
  const seconds = deficit / restoreRate;

  return Math.max(1000, Math.ceil(seconds * 1000));
}

export function shopifyRo2RetryExhausted(
  cause: ShopifyRo2TransportError,
  attempts: number,
): ShopifyRo2TransportError {
  return new ShopifyRo2TransportError({
    code: "RETRY_EXHAUSTED",
    message: `Shopify RO.2 transport retries exhausted after ${attempts} attempt(s): ${cause.code} — ${cause.message}`,
    httpStatus: cause.httpStatus,
    graphqlErrors: cause.graphqlErrors,
    cost: cause.cost,
    retryable: false,
    attempts,
  });
}
