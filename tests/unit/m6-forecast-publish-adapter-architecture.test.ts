import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

const ROOT = process.cwd();
const PUBLISH = "lib/persistence/publish-forecast-sku-demand.ts";
const PERSIST = "lib/persistence/persist-forecast-sku-demand.ts";

function source(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

describe("M6 P3d.2 forecast publish adapter architecture", () => {
  it("is server-only and writes only through publish_sku_forecast RPC", () => {
    const text = source(PUBLISH);

    expect(text.startsWith('import "server-only"')).toBe(true);
    expect(text).toContain('const RPC_NAME = "publish_sku_forecast"');
    expect(text).toContain("client.rpc(RPC_NAME");
    expect(text).toContain("p_forecast_run_id");
    expect(text).not.toContain("create table");
    expect(text).not.toMatch(/\.insert\(/);
    expect(text).not.toMatch(/\.update\(/);
    expect(text).not.toMatch(/\.delete\(/);
    expect(text).not.toContain("sku_forecast_publications");
    expect(text).not.toContain("sku_forecast_current");
  });

  it("keeps publish explicit and never auto-hooks from persistence", () => {
    const publish = source(PUBLISH);
    const persist = source(PERSIST);

    expect(publish).toContain("export async function publishForecastSkuDemand");
    expect(publish).toContain("Never auto-invoked from persist");
    expect(persist).not.toContain("publishForecastSkuDemand");
    expect(persist).not.toContain("publish_sku_forecast");
    expect(persist).toContain("published: false");
    expect(persist).toContain("They are never published");
  });

  it("preserves dispositions, fails closed on stale/pending, and never claims freshness or M7", () => {
    const text = source(PUBLISH);

    expect(text).toContain('"published"');
    expect(text).toContain('"replayed"');
    expect(text).toContain('"withheld"');
    expect(text).toContain("ForecastPublishStaleTokenError");
    expect(text).toContain("ForecastPublishPendingCorrectionError");
    expect(text).toContain("ForecastPublishForeignGrainError");
    expect(text).toContain("m7Eligible: false");
    expect(text).toContain("publicationClaimsPostCommitFreshness: false");
    expect(text).toContain("never silently retries a stale forecast");
    expect(text).toContain("FORBIDDEN_INPUT_KEYS");
    expect(text).toContain('"trustedCompleteDates"');
    expect(text).toContain('"confidenceIntervals"');
    expect(text).not.toContain("@/lib/decision-engine");
    expect(text).not.toContain("calculateSalesVelocity");
    expect(text).not.toContain("forecastSkuDemand(");
  });
});
