import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

import {
  assessWorkerEnqueue,
  assertWorkerMutationFence,
} from "@/workers/concurrency";

import {
  buildWorkerTerminalFailureRecord,
  workerFailureIsDeadWork,
} from "@/workers/failure";

import {
  buildWorkerTelemetryEvent,
} from "@/workers/observability";

import {
  assessPipelineStageReadiness,
} from "@/workers/pipeline";

import {
  workerStatusMayDirectlyOwnSyncRunStatus,
} from "@/workers/sync-run";

import {
  triggerEstablishesTenantOwnership,
} from "@/workers/trigger";

const ROOT = process.cwd();

function read(
  relativePath: string,
): string {
  return fs.readFileSync(
    path.join(
      ROOT,
      relativePath,
    ),
    "utf8",
  );
}

describe("StoreAgent background-job invariants", () => {
  it("never lets scheduled trigger provenance establish tenant ownership", () => {
    expect(
      triggerEstablishesTenantOwnership({
        kind: "scheduled",
        triggerKey:
          "nightly-sync",
      }),
    ).toBe(false);
  });

  it("never lets provider-event provenance establish tenant ownership", () => {
    expect(
      triggerEstablishesTenantOwnership({
        kind: "event",
        triggerKey:
          "provider-event-1",
        sourceType:
          "integration",
        sourceId:
          "integration-1",
      }),
    ).toBe(false);
  });

  it("treats repeated active logical work as duplicate instead of replacement work", () => {
    expect(
      assessWorkerEnqueue(
        {
          idempotencyKey:
            "job-key-1",
          status:
            "running",
        },
        "job-key-1",
      ),
    ).toEqual({
      disposition:
        "duplicate_active",
      idempotencyKey:
        "job-key-1",
    });
  });

  it("does not silently recreate already-terminal logical work", () => {
    expect(
      assessWorkerEnqueue(
        {
          idempotencyKey:
            "job-key-1",
          status:
            "succeeded",
        },
        "job-key-1",
      ),
    ).toEqual({
      disposition:
        "duplicate_terminal",
      idempotencyKey:
        "job-key-1",
    });
  });

  it("fences stale worker execution after lease ownership changes", () => {
    expect(() =>
      assertWorkerMutationFence(
        {
          ownerId:
            "worker-new",
          claimToken:
            "claim-new",
          claimedAt:
            "2026-10-08T07:00:00Z",
          expiresAt:
            "2026-10-08T07:05:00Z",
        },
        "worker-old",
        "claim-old",
      ),
    ).toThrow(
      "Worker lease ownership mismatch.",
    );
  });

  it("never treats retry_wait as canonical SyncRun failure", () => {
    expect(
      workerStatusMayDirectlyOwnSyncRunStatus(
        "retry_wait",
      ),
    ).toBe(false);
  });

  it("blocks forecast execution until deterministic metrics complete", () => {
    expect(
      assessPipelineStageReadiness(
        "forecast",
        {
          canonicalDataReady:
            true,
          metricsReady:
            false,
          forecastReady:
            false,
          decisionReady:
            false,
        },
      ),
    ).toEqual({
      ready: false,
      reason:
        "METRICS_NOT_READY",
    });
  });

  it("blocks deterministic decision execution until forecast stage completes", () => {
    expect(
      assessPipelineStageReadiness(
        "decision",
        {
          canonicalDataReady:
            true,
          metricsReady:
            true,
          forecastReady:
            false,
          decisionReady:
            false,
        },
      ),
    ).toEqual({
      ready: false,
      reason:
        "FORECAST_NOT_READY",
    });
  });

  it("blocks AI explanation until deterministic decision completes", () => {
    expect(
      assessPipelineStageReadiness(
        "ai_explanation",
        {
          canonicalDataReady:
            true,
          metricsReady:
            true,
          forecastReady:
            true,
          decisionReady:
            false,
        },
      ),
    ).toEqual({
      ready: false,
      reason:
        "DECISION_NOT_READY",
    });
  });

  it("retains terminal failed work as dead work under the same logical identity", () => {
    const failure =
      buildWorkerTerminalFailureRecord({
        idempotencyKey:
          "job-key-1",
        jobType:
          "provider_sync",
        organizationId:
          "org-a",
        storeId:
          "store-a",
        attemptCount: 5,
        reason:
          "retry_exhausted",
        errorCode:
          "PROVIDER_TIMEOUT",
        errorMessage:
          "Provider synchronization exhausted retry budget.",
        failedAt:
          "2026-10-08T07:00:00Z",
      });

    expect(
      failure.idempotencyKey,
    ).toBe(
      "job-key-1",
    );

    expect(
      workerFailureIsDeadWork(
        failure,
      ),
    ).toBe(true);
  });

  it("keeps telemetry correlated to logical work without replacing its identity", () => {
    const event =
      buildWorkerTelemetryEvent({
        level:
          "error",
        eventType:
          "job_failed",
        context: {
          idempotencyKey:
            "job-key-1",
          jobType:
            "provider_sync",
          organizationId:
            "org-a",
          storeId:
            "store-a",
          executionId:
            "execution-5",
          canonicalRunId:
            "sync-run-1",
          attemptCount: 5,
        },
        code:
          "PROVIDER_TIMEOUT",
        message:
          "Provider synchronization failed.",
        occurredAt:
          "2026-10-08T07:00:00Z",
      });

    expect(
      event.context.idempotencyKey,
    ).toBe(
      "job-key-1",
    );

    expect(
      event.context.executionId,
    ).toBe(
      "execution-5",
    );

    expect(
      event.context.canonicalRunId,
    ).toBe(
      "sync-run-1",
    );
  });

  it("keeps the entire worker subsystem independent from AI UI and provider SDKs", () => {
    const directory =
      path.join(
        ROOT,
        "workers",
      );

    const files =
      fs.readdirSync(
        directory,
      ).filter(
        (file) =>
          file.endsWith(".ts"),
      );

    const forbidden = [
      "openai",
      "@anthropic",
      "@google/generative-ai",
      "react",
      "next/",
      "@shopify",
      "stripe",
    ];

    for (
      const file of files
    ) {
      const source =
        read(
          `workers/${file}`,
        );

      for (
        const dependency
        of forbidden
      ) {
        expect(
          source.includes(
            dependency,
          ),
          `${file} must not depend on ${dependency}`,
        ).toBe(false);
      }
    }
  });

  it("keeps the worker architecture independent from queue and scheduler vendors", () => {
    const directory =
      path.join(
        ROOT,
        "workers",
      );

    const files =
      fs.readdirSync(
        directory,
      ).filter(
        (file) =>
          file.endsWith(".ts"),
      );

    const forbidden = [
      "inngest",
      "trigger.dev",
      "bullmq",
      "pg-boss",
      "upstash",
      "vercel.cron",
    ];

    for (
      const file of files
    ) {
      const source =
        read(
          `workers/${file}`,
        );

      for (
        const dependency
        of forbidden
      ) {
        expect(
          source.toLowerCase().includes(
            dependency.toLowerCase(),
          ),
          `${file} must not depend on ${dependency}`,
        ).toBe(false);
      }
    }
  });

  it("does not emit logs directly from worker architecture modules", () => {
    const directory =
      path.join(
        ROOT,
        "workers",
      );

    const files =
      fs.readdirSync(
        directory,
      ).filter(
        (file) =>
          file.endsWith(".ts"),
      );

    const forbidden = [
      "console.log(",
      "console.warn(",
      "console.error(",
    ];

    for (
      const file of files
    ) {
      const source =
        read(
          `workers/${file}`,
        );

      for (
        const call
        of forbidden
      ) {
        expect(
          source.includes(
            call,
          ),
          `${file} must not directly emit ${call}`,
        ).toBe(false);
      }
    }
  });

  it("documents the worker layer as infrastructure orchestration rather than canonical truth", () => {
    const spec =
      read(
        "docs/BACKGROUND_JOBS.md",
      );

    expect(
      spec,
    ).toContain(
      "Worker job",
    );

    expect(
      spec,
    ).toContain(
      "SyncRun",
    );

    expect(
      spec,
    ).toContain(
      "AI explanation",
    );

    expect(
      spec,
    ).toContain(
      "does not own numerical inventory intelligence",
    );
  });
});
