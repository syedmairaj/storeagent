import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

const WORKER = read("workers/aggregate-metrics.ts");
const QUEUE = read("lib/persistence/metric-recompute-queue.ts");
const ROUTE = read("app/api/internal/metric-recompute/route.ts");
const ENV = read(".env.example");
const COMMIT = read(
  "supabase/migrations/20261015120000_m5_5_coverage_identity.sql",
);
const TYPES = read("workers/types.ts");

describe("M5.7 Phase 5B F2 containment architecture", () => {
  it("defaults worker concurrency to single-flight 1/1", () => {
    expect(WORKER).toMatch(/maxActive:\s*1,/);
    expect(WORKER).toMatch(/claimLimit:\s*1,/);
    expect(QUEUE).toContain("METRIC_RECOMPUTE_DEFAULT_MAX_ACTIVE = 1");
    expect(QUEUE).toContain("METRIC_RECOMPUTE_DEFAULT_CLAIM_LIMIT = 1");
  });

  it("parses optional concurrency env fail-closed without silent fallback to 4", () => {
    expect(QUEUE).toContain("METRIC_RECOMPUTE_MAX_ACTIVE");
    expect(QUEUE).toContain("METRIC_RECOMPUTE_CLAIM_LIMIT");
    expect(QUEUE).toContain("/^[1-4]$/");
    expect(QUEUE).toContain("MetricRecomputeWorkerConfigError");
    expect(QUEUE).not.toMatch(
      /METRIC_RECOMPUTE_MAX_ACTIVE[\s\S]{0,200}fallback.*4|maxActive:\s*4/,
    );
    expect(ENV).toContain("METRIC_RECOMPUTE_MAX_ACTIVE=");
    expect(ENV).toContain("METRIC_RECOMPUTE_CLAIM_LIMIT=");
  });

  it("preserves activation gates and does not enable workers", () => {
    expect(QUEUE).toContain('METRIC_RECOMPUTE_WORKER_ENABLED === "1"');
    expect(ROUTE).toContain("worker_not_configured");
    expect(ROUTE).toContain("not_found");
    expect(ROUTE).toContain("unauthorized");
    expect(fs.existsSync(path.join(ROOT, "vercel.json"))).toBe(false);
    expect(ENV).toMatch(/METRIC_RECOMPUTE_WORKER_ENABLED=\s*$/m);
  });

  it("keeps SHARE locks and SA008 fencing untouched", () => {
    expect(COMMIT).toMatch(/lock table[\s\S]*share mode/i);
    expect(COMMIT).toContain("SA008");
    expect(WORKER).not.toContain("commit_sku_daily_metric");
    expect(WORKER).not.toContain("LOCK TABLE");
    expect(QUEUE).toContain("recomputeSkuDailyMetric(");
  });

  it("emits end-to-end execute duration and tick summary without secrets", () => {
    expect(WORKER).toContain("executeDurationMs");
    expect(TYPES).toContain("End-to-end item execution time");
    expect(TYPES).toContain("Not lock-wait duration");
    expect(ROUTE).toContain('eventType: "tick_summary"');
    expect(ROUTE).toContain("activeLeases");
    expect(ROUTE).toContain("oldestClaimableAgeSeconds");
    expect(ROUTE).toContain("unconsumedEvents");
    expect(ROUTE).not.toContain("claimToken");
    expect(ROUTE).not.toContain("lease_claim_token");
    expect(ROUTE).not.toContain("SERVICE_ROLE");
  });
});
