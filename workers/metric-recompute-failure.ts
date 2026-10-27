import type {
  WorkerFailureClass,
} from "./types";

/**
 * M5.6C failure classification for one SKU daily metric recompute.
 *
 * Structured codes win: the captured PostgreSQL SQLSTATE or HTTP status
 * from the injected RPC client, then the frozen M5.5 SA008 error class.
 * Message text is only consulted for the few frozen M5.5 errors that
 * carry no code at all.
 *
 * The stored message is a fixed sanitized summary. Raw error text,
 * payloads, tokens, and tenant data are never returned.
 */

export interface CapturedRpcError {
  code: string | null;
  message: string;
  status: number | null;
}

export interface MetricRecomputeFailureInput {
  thrown: unknown;
  rpcError: CapturedRpcError | null;
  aborted: boolean;
}

export interface MetricRecomputeFailure {
  failureClass: WorkerFailureClass;
  code: string;
  message: string;
}

const SQLSTATE_PATTERN =
  /^[0-9A-Z]{5}$/;

const SOURCE_TOKEN_MISMATCH =
  "SA008";

const INVALID_METRIC_RESULT =
  "SA009";

function failure(
  failureClass: WorkerFailureClass,
  code: string,
  message: string,
): MetricRecomputeFailure {
  return {
    failureClass,
    code,
    message,
  };
}

function thrownSqlState(
  thrown: unknown,
): string | null {
  if (
    typeof thrown === "object" &&
    thrown !== null &&
    "sqlState" in thrown &&
    typeof thrown.sqlState === "string"
  ) {
    return thrown.sqlState;
  }

  return null;
}

function thrownMessage(
  thrown: unknown,
): string {
  return thrown instanceof Error
    ? thrown.message
    : "";
}

function classifySqlState(
  code: string,
): MetricRecomputeFailure | null {
  if (code === SOURCE_TOKEN_MISMATCH) {
    return failure(
      "transient_dependency",
      code,
      "source changed during recompute",
    );
  }

  if (code === INVALID_METRIC_RESULT) {
    return failure(
      "invariant_violation",
      code,
      "metric persistence rejected the result",
    );
  }

  if (code === "55P03") {
    return failure(
      "timeout",
      code,
      "source lock wait timed out",
    );
  }

  if (code === "57014") {
    return failure(
      "timeout",
      code,
      "statement was cancelled",
    );
  }

  if (
    code === "40001" ||
    code === "40P01"
  ) {
    return failure(
      "transient_dependency",
      code,
      "transaction conflict",
    );
  }

  if (
    code.startsWith("08") ||
    code === "53300" ||
    code === "57P01" ||
    code === "57P02" ||
    code === "57P03"
  ) {
    return failure(
      "transient_dependency",
      code,
      "database temporarily unavailable",
    );
  }

  if (
    code === "42501" ||
    code.startsWith("28")
  ) {
    return failure(
      "authorization",
      code,
      "database authorization failed",
    );
  }

  if (
    code === "P0001" ||
    code.startsWith("22") ||
    code.startsWith("23")
  ) {
    return failure(
      "validation",
      code,
      "recompute input was rejected",
    );
  }

  return null;
}

function classifyHttpStatus(
  status: number,
): MetricRecomputeFailure | null {
  if (status === 429) {
    return failure(
      "rate_limited",
      "HTTP_429",
      "database API rate limited",
    );
  }

  if (status >= 500) {
    return failure(
      "transient_dependency",
      `HTTP_${status}`,
      "database API unavailable",
    );
  }

  if (
    status === 401 ||
    status === 403
  ) {
    return failure(
      "authorization",
      `HTTP_${status}`,
      "database API authorization failed",
    );
  }

  return null;
}

export function classifyMetricRecomputeFailure(
  input: MetricRecomputeFailureInput,
): MetricRecomputeFailure {
  if (input.aborted) {
    return failure(
      "timeout",
      "DEADLINE_EXCEEDED",
      "recompute deadline exceeded",
    );
  }

  const sqlState =
    thrownSqlState(
      input.thrown,
    );

  if (sqlState === SOURCE_TOKEN_MISMATCH) {
    return classifySqlState(
      sqlState,
    ) as MetricRecomputeFailure;
  }

  const rpcError =
    input.rpcError;

  if (rpcError !== null) {
    const code =
      rpcError.code ?? "";

    if (SQLSTATE_PATTERN.test(code)) {
      const classified =
        classifySqlState(
          code,
        );

      if (classified !== null) {
        return classified;
      }
    }

    if (
      rpcError.status !== null &&
      rpcError.status > 0
    ) {
      const classified =
        classifyHttpStatus(
          rpcError.status,
        );

      if (classified !== null) {
        return classified;
      }
    }

    if (
      rpcError.status === 0 ||
      rpcError.status === null
    ) {
      return failure(
        "transient_dependency",
        "NETWORK",
        "database API unreachable",
      );
    }
  }

  if (input.thrown instanceof TypeError) {
    return failure(
      "transient_dependency",
      "NETWORK",
      "database API unreachable",
    );
  }

  /**
   * Frozen M5.5 errors without a structured code.
   */
  const message =
    thrownMessage(
      input.thrown,
    );

  if (
    message ===
    "stores.timezone must be a recognized IANA timezone."
  ) {
    return failure(
      "validation",
      "INVALID_TIMEZONE",
      "store timezone is not a recognized IANA timezone",
    );
  }

  if (
    message ===
      "sales aggregate is missing the metric date." ||
    message ===
      "sku daily metric commit did not return an id."
  ) {
    return failure(
      "invariant_violation",
      "RECOMPUTE_INVARIANT",
      "recompute produced an inconsistent result",
    );
  }

  /**
   * Unknown is not retryable under workers/retry.ts, so it becomes
   * terminal dead work instead of retrying indefinitely.
   */
  return failure(
    "unknown",
    "UNKNOWN",
    "recompute failed for an unclassified reason",
  );
}
