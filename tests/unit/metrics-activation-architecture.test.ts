import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("merchant sales metrics activation architecture", () => {
  it("reuses the canonical org-scoped M5 tick without enabling cron or workers", () => {
    const runner = read("lib/metrics-activation/run-org-recompute.ts");
    expect(runner).toContain("runMetricRecomputeTick");
    expect(runner).toContain("createMetricRecomputeQueue");
    expect(runner).toContain("createSkuDailyMetricRecomputeExecutor");
    expect(runner).toContain("METRIC_RECOMPUTE_WORKER_SETTINGS");
    expect(runner).toContain("countPendingMetricWorkForOrganization");
    expect(runner).toContain("pendingRemaining");
    expect(runner).not.toContain("CRON_SECRET");
    expect(runner).not.toContain("process.env");
    expect(runner).not.toContain("decideInventoryAction");

    const actions = read("lib/metrics-activation/actions.ts");
    expect(actions).toContain("authorizeMerchantInventoryImport");
    expect(actions).toContain("runAuthorizedOrgMetricRecompute");
    expect(actions).toContain("authorized.scope.organizationId");
    expect(actions).toContain("requireAppIdentity");
    expect(actions).toContain("merchantMetricsActivationNote");
    expect(actions).not.toContain("process.env");
    expect(actions).not.toContain("CRON_SECRET");
  });

  it("keeps merchant copy free of worker jargon and reports incomplete drains", () => {
    const copy = read("lib/metrics-activation/merchant-copy.ts");
    expect(copy).toContain("pending");
    expect(copy).toContain("retryable");
    expect(copy).not.toContain("cron");
    expect(copy).not.toContain("lease");
    expect(copy).not.toContain("worker");
    expect(copy).not.toContain("stopped=");

    const salesActions = read("lib/sales-import/actions.ts");
    expect(salesActions).toContain("runAuthorizedOrgMetricRecompute");
    expect(salesActions).toContain("metricsStatus");
    expect(salesActions).toContain("Sales imported");
    expect(salesActions).not.toMatch(/Workers and cron/);
    expect(salesActions).not.toContain("stopped=");
  });

  it("wires readiness freshness to pending source processing", () => {
    const align = read("lib/inventory-readiness/align.ts");
    expect(align).toContain("asOfMetricDateByStoreId");
    expect(align).toContain("metric_date !== asOf");

    const load = read("lib/inventory-readiness/load.ts");
    expect(load).toContain("storeLocalAsOfDate");
    expect(load).toContain("countPendingMetricWorkForOrganization");
    expect(load).toContain("organization_members");

    const assess = read("lib/inventory-readiness/assess.ts");
    expect(assess).toContain("hasPendingMetricWork");
    expect(assess).toMatch(/canCommercial = false/);

    const panel = read(
      "components/inventory-readiness/decision-readiness-panel.tsx",
    );
    expect(panel).toContain("ActivateDemandMetricsButton");
    expect(panel).toContain("activationScope");
  });
});
