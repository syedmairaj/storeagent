import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

const QUEUE = read("lib/persistence/metric-rollover.ts");
const ROUTE = read("app/api/internal/metric-rollover/route.ts");
const ENV = read(".env.example");
const RECOMPUTE_ROUTE = read("app/api/internal/metric-recompute/route.ts");
const RECOMPUTE_QUEUE = read("lib/persistence/metric-recompute-queue.ts");

describe("M5-HR1.b org-scoped rollover architecture", () => {
  it("T10: route never selects tenant from body/query/org headers", () => {
    expect(ROUTE).not.toMatch(/request\.(json|text)\s*\(/);
    expect(ROUTE).not.toContain("searchParams");
    expect(ROUTE).not.toMatch(
      /headers\.get\(\s*["'](?:x-organization-id|organization-id|organizationId)["']\s*\)/,
    );
    expect(ROUTE).toContain("evaluateMetricRolloverHttpGate");
    expect(ROUTE).toContain("organizationId: gate.organizationId");
  });

  it("T11: enabled HTTP path never hard-codes or omits org into null enqueue", () => {
    expect(ROUTE).toContain("organizationId: gate.organizationId");
    expect(ROUTE).not.toMatch(/\.enqueue\(\s*\)/);
    expect(ROUTE).not.toContain("p_organization_id: null");
    expect(ROUTE).not.toContain("organizationId: null");
    expect(QUEUE).toContain('error: "organization_scope_required"');
  });

  it("T12: route does not call stats()", () => {
    expect(ROUTE).not.toMatch(/\.stats\s*\(/);
    expect(ROUTE).not.toContain("sku_daily_metric_rollover_stats");
  });

  it("T13: no scheduler / no cron / no metrics formula imports", () => {
    expect(fs.existsSync(path.join(ROOT, "vercel.json"))).toBe(false);
    expect(ROUTE.toLowerCase()).not.toContain("cron");
    expect(QUEUE.toLowerCase()).not.toContain("cron");
    expect(ROUTE).not.toContain("@/lib/metrics/");
    expect(ROUTE).not.toContain("commit_sku_daily_metric");
  });

  it("T14: workers remain OFF by default in env example and config", () => {
    expect(ENV).toMatch(/METRIC_ROLLOVER_WORKER_ENABLED=\s*$/m);
    expect(ENV).toMatch(/METRIC_ROLLOVER_ORGANIZATION_ID=\s*$/m);
    expect(ENV).toContain("zero enqueue RPCs");
    expect(QUEUE).toContain("isMetricWorkerEnvEnabled");
    expect(QUEUE).toContain("METRIC_ROLLOVER_WORKER_ENABLED");
    expect(QUEUE).toContain('error: "organization_scope_required"');
  });

  it("T15: does not fall back to METRIC_RECOMPUTE_ORGANIZATION_ID", () => {
    expect(QUEUE).not.toContain("METRIC_RECOMPUTE_ORGANIZATION_ID");
    expect(ROUTE).not.toContain("METRIC_RECOMPUTE_ORGANIZATION_ID");
    expect(QUEUE).toContain("METRIC_ROLLOVER_ORGANIZATION_ID");
    expect(ENV).toContain("never from recompute org env");
  });

  it("preserves fail-closed distinguishable 404 vs org-scope 503", () => {
    expect(QUEUE).toContain('error: "not_found"');
    expect(QUEUE).toContain("status: 404");
    expect(QUEUE).toContain('error: "organization_scope_required"');
    expect(QUEUE).toContain("status: 503");
  });

  it("does not weaken HR1.a recompute org gate", () => {
    expect(RECOMPUTE_ROUTE).toContain("evaluateMetricRecomputeHttpGate");
    expect(RECOMPUTE_ROUTE).toContain("organizationId: gate.organizationId");
    expect(RECOMPUTE_QUEUE).toContain('error: "organization_scope_required"');
    expect(RECOMPUTE_QUEUE).toContain("METRIC_RECOMPUTE_ORGANIZATION_ID");
    expect(ROUTE).not.toContain("metric-recompute");
  });
});
