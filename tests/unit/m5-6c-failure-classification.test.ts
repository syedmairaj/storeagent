import { describe, expect, it } from "vitest";

import {
  classifyMetricRecomputeFailure,
  type CapturedRpcError,
} from "@/workers/metric-recompute-failure";
import {
  DEFAULT_WORKER_RETRY_POLICY,
  decideWorkerRetry,
  isRetryableWorkerFailure,
} from "@/workers/retry";

class SourceChanged extends Error {
  readonly sqlState = "SA008";
}

function rpc(
  code: string | null,
  status: number | null = 400,
  message = "raw database text with tenant 57160000-0000-4000-8000-000000000001",
): CapturedRpcError {
  return { code, status, message };
}

function classify(
  rpcError: CapturedRpcError | null,
  thrown: unknown = new Error("wrapped"),
  aborted = false,
) {
  return classifyMetricRecomputeFailure({ thrown, rpcError, aborted });
}

describe("M5.6C failure classification", () => {
  it("retries SA008 from the frozen error class or the captured code", () => {
    expect(classify(null, new SourceChanged()).failureClass).toBe(
      "transient_dependency",
    );
    expect(classify(rpc("SA008")).code).toBe("SA008");
  });

  it("maps structured SQLSTATEs before any message text", () => {
    expect(classify(rpc("SA009"))).toMatchObject({
      failureClass: "invariant_violation",
      code: "SA009",
    });
    expect(classify(rpc("55P03", 500)).failureClass).toBe("timeout");
    expect(classify(rpc("57014", 500)).failureClass).toBe("timeout");
    expect(classify(rpc("40001", 500)).failureClass).toBe(
      "transient_dependency",
    );
    expect(classify(rpc("40P01", 500)).failureClass).toBe(
      "transient_dependency",
    );
    expect(classify(rpc("P0001")).failureClass).toBe("validation");
    expect(classify(rpc("42501", 403)).failureClass).toBe("authorization");
  });

  it("maps HTTP 429, 5xx, and network failures", () => {
    expect(classify(rpc(null, 429)).failureClass).toBe("rate_limited");
    expect(classify(rpc("PGRST000", 503)).failureClass).toBe(
      "transient_dependency",
    );
    expect(classify(rpc(null, 0)).failureClass).toBe("transient_dependency");
    expect(classify(null, new TypeError("fetch failed")).failureClass).toBe(
      "transient_dependency",
    );
  });

  it("treats the local deadline as a timeout", () => {
    expect(classify(rpc(null, 0), new Error("x"), true)).toMatchObject({
      failureClass: "timeout",
      code: "DEADLINE_EXCEEDED",
    });
  });

  it("maps codeless frozen M5.5 errors without guessing", () => {
    expect(
      classify(
        null,
        new Error("stores.timezone must be a recognized IANA timezone."),
      ).failureClass,
    ).toBe("validation");
    expect(
      classify(null, new Error("sales aggregate is missing the metric date."))
        .failureClass,
    ).toBe("invariant_violation");
  });

  it("makes unknown errors terminal instead of retrying forever", () => {
    const unknown = classify(null, new Error("something odd"));

    expect(unknown.failureClass).toBe("unknown");
    expect(isRetryableWorkerFailure(unknown.failureClass)).toBe(false);
    expect(
      decideWorkerRetry(unknown.failureClass, 1, DEFAULT_WORKER_RETRY_POLICY)
        .disposition,
    ).toBe("fail");
  });

  it("never returns raw database text", () => {
    for (const code of ["SA008", "SA009", "55P03", "P0001", "XX000", null]) {
      const result = classify(rpc(code, 400));

      expect(result.message).not.toContain("tenant");
      expect(result.message).not.toContain("57160000");
      expect(result.message.length).toBeLessThanOrEqual(300);
      expect(result.code).toMatch(/^[A-Za-z0-9_.:-]{1,64}$/);
    }
  });
});
