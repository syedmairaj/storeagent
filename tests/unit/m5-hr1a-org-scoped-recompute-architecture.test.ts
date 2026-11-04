import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

const QUEUE = read("lib/persistence/metric-recompute-queue.ts");
const WORKER = read("workers/aggregate-metrics.ts");
const ROUTE = read("app/api/internal/metric-recompute/route.ts");
const ENV = read(".env.example");
const ROLLOVER_ROUTE = read("app/api/internal/metric-rollover/route.ts");

describe("M5-HR1.a org-scoped recompute architecture", () => {
  it("T13: route never selects tenant from body/query/org headers", () => {
    expect(ROUTE).not.toMatch(/request\.(json|text)\s*\(/);
    expect(ROUTE).not.toContain("searchParams");
    expect(ROUTE).not.toMatch(
      /headers\.get\(\s*["'](?:x-organization-id|organization-id|organizationId)["']\s*\)/,
    );
    expect(ROUTE).toContain("evaluateMetricRecomputeHttpGate");
    expect(ROUTE).toContain("organizationId: gate.organizationId");
  });

  it("T14: tick always passes trusted organizationId; never hard-codes null on HTTP path", () => {
    expect(WORKER).toContain("organizationId: string");
    expect(WORKER).toContain("trustedOrganizationId");
    expect(WORKER).toContain(
      "settings.consumeBatchSize,\n          trustedOrganizationId,",
    );
    expect(WORKER).toContain("organizationId: trustedOrganizationId");
    expect(WORKER).toContain("ORG_SCOPE_MISMATCH");
    expect(WORKER).not.toMatch(
      /\.consume\(\s*settings\.consumeBatchSize\s*\)/,
    );
    expect(ROUTE).not.toContain("p_organization_id: null");
    expect(QUEUE).toContain("scopedOrganizationArg");
  });

  it("T15: workers remain OFF by default in env example and config", () => {
    expect(ENV).toMatch(/METRIC_RECOMPUTE_WORKER_ENABLED=\s*$/m);
    expect(ENV).toMatch(/METRIC_RECOMPUTE_ORGANIZATION_ID=\s*$/m);
    expect(ENV).toContain("zero queue RPCs");
    expect(QUEUE).toContain("isMetricWorkerEnvEnabled");
    expect(QUEUE).toContain("METRIC_RECOMPUTE_WORKER_ENABLED");
    expect(QUEUE).toContain('error: "organization_scope_required"');
  });

  it("does not wire rollover HTTP org scope in HR1.a (HR1.b)", () => {
    expect(ROLLOVER_ROUTE).not.toContain("METRIC_RECOMPUTE_ORGANIZATION_ID");
    expect(ROUTE).not.toContain("metric-rollover");
  });

  it("preserves fail-closed distinguishable 404 vs org-scope 503", () => {
    expect(QUEUE).toContain('error: "not_found"');
    expect(QUEUE).toContain('status: 404');
    expect(QUEUE).toContain('error: "organization_scope_required"');
    expect(QUEUE).toContain('status: 503');
  });
});
