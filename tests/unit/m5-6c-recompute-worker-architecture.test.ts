import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

const WORKER = read("workers/aggregate-metrics.ts");
const CLASSIFIER = read("workers/metric-recompute-failure.ts");
const QUEUE = read("lib/persistence/metric-recompute-queue.ts");
const ROUTE = read("app/api/internal/metric-recompute/route.ts");

describe("M5.6C recompute worker architecture", () => {
  it("stops at metrics and never calls later pipeline stages", () => {
    for (const source of [WORKER, CLASSIFIER, QUEUE, ROUTE]) {
      for (const forbidden of [
        "@/lib/forecasting",
        "@/lib/decision-engine",
        "@/lib/decisions",
        "@/lib/ai",
        "@/lib/actions",
        "./pipeline",
        "@/workers/pipeline",
        "./sync-run",
        "calculate-forecast",
        "generate-actions",
        "explain-actions",
        "forecast_generation",
        "action_generation",
        "explanation_generation",
      ]) {
        expect(source).not.toContain(forbidden);
      }
    }
  });

  it("invokes the frozen M5.5 recompute instead of recalculating", () => {
    expect(QUEUE).toContain(
      'from "@/lib/persistence/recompute-sku-daily-metric"',
    );
    expect(QUEUE).toContain("recomputeSkuDailyMetric(");
    expect(QUEUE).toContain(".abortSignal(signal)");

    for (const source of [WORKER, QUEUE, ROUTE]) {
      expect(source).not.toContain("@/lib/metrics/");
      expect(source).not.toContain("commit_sku_daily_metric");
    }
  });

  it("keeps the worker free of direct table writes, logging, and vendors", () => {
    for (const source of [WORKER, CLASSIFIER, QUEUE]) {
      expect(source).not.toMatch(/\.from\(\s*["']/);
      expect(source).not.toContain("console.");
    }

    for (const source of [WORKER, CLASSIFIER, QUEUE, ROUTE]) {
      for (const vendor of [
        "inngest",
        "trigger.dev",
        "bullmq",
        "pg-boss",
        "redis",
        "upstash",
        "vercel.cron",
      ]) {
        expect(source.toLowerCase()).not.toContain(vendor);
      }
    }
  });

  it("keeps durable correctness out of process-local timers and locks", () => {
    expect(WORKER).not.toContain("setTimeout");
    expect(WORKER).not.toContain("setInterval");
    expect(WORKER).not.toMatch(/\bnew Mutex\b|\bSemaphore\b/);
  });

  it("marks service-role orchestration server-only", () => {
    expect(QUEUE).toContain('import "server-only"');
    expect(QUEUE).toContain("RLS_IS_BYPASSED = true");
    expect(ROUTE).toContain('import "server-only"');
  });

  it("protects the internal trigger and returns counts only", () => {
    expect(ROUTE).toContain('export const runtime = "nodejs"');
    expect(ROUTE).toContain("readMetricRecomputeWorkerConfig(process.env)");
    expect(ROUTE).toContain("isAuthorizedMetricRecomputeRequest(");
    expect(ROUTE).toContain("export async function POST(");
    expect(ROUTE).not.toMatch(/export async function (GET|PUT|PATCH|DELETE)/);
    expect(ROUTE).not.toContain("request.json(");
    expect(ROUTE).not.toContain("searchParams");
    expect(QUEUE).toContain("timingSafeEqual(");
    expect(QUEUE).toContain('=== "1"');
  });

  it("wires F2 containment concurrency from env into the tick", () => {
    expect(WORKER).toMatch(/maxActive:\s*1/);
    expect(WORKER).toMatch(/claimLimit:\s*1/);
    expect(QUEUE).toContain("METRIC_RECOMPUTE_MAX_ACTIVE");
    expect(QUEUE).toContain("METRIC_RECOMPUTE_CLAIM_LIMIT");
    expect(QUEUE).toContain("MetricRecomputeWorkerConfigError");
    expect(ROUTE).toContain("maxActive: config.maxActive");
    expect(ROUTE).toContain("claimLimit: config.claimLimit");
    expect(ROUTE).toContain("worker_misconfigured");
    expect(ROUTE).toContain('eventType: "tick_summary"');
    expect(ROUTE).toContain("activeLeases");
    expect(ROUTE).not.toContain("claimToken");
    expect(ROUTE).not.toContain("lease_claim_token");
  });

  it("does not configure a scheduler", () => {
    expect(fs.existsSync(path.join(ROOT, "vercel.json"))).toBe(false);
  });

  it("leaves frozen M5.5 persistence files untouched in content", () => {
    const recompute = read("lib/persistence/recompute-sku-daily-metric.ts");

    expect(recompute).toContain("const SOURCE_READ_ATTEMPTS = 3;");
    expect(recompute).toContain("throw new Error(committed.error.message);");
  });
});
