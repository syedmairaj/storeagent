import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function read(relativePath: string): string {
  return fs.readFileSync(
    path.join(process.cwd(), relativePath),
    "utf8",
  );
}

describe("M5.5 persistence architecture", () => {
  const migration = read(
    "supabase/migrations/20261015110000_m5_5_sku_daily_metric_recompute.sql",
  );
  const coverage = read(
    "supabase/migrations/20261015120000_m5_5_coverage_identity.sql",
  );
  const recompute = read(
    "lib/persistence/recompute-sku-daily-metric.ts",
  );

  it("locks source tables before validating the token and upserting", () => {
    const commit = migration.slice(
      migration.indexOf(
        "create or replace function public.commit_sku_daily_metric",
      ),
    );
    const lockAt = commit.indexOf("lock table public.stores");
    const tokenAt = commit.indexOf(
      "sku_daily_metric_source_snapshot",
    );
    const insertAt = commit.indexOf(
      "insert into public.sku_daily_metrics",
    );

    expect(lockAt).toBeGreaterThan(-1);
    expect(lockAt).toBeLessThan(tokenAt);
    expect(tokenAt).toBeLessThan(insertAt);
    expect(commit).toContain("lock table public.orders in share mode");
    expect(commit).toContain(
      "lock table public.order_items in share mode",
    );
    expect(commit).toContain(
      "lock table public.return_refunds in share mode",
    );
    expect(commit).toContain(
      "lock table public.inventory_snapshots in share mode",
    );
    expect(commit).toContain("errcode = 'SA008'");
    expect(commit).not.toContain("pg_advisory_xact_lock");
  });

  it("covers the whole grain and computes coverage in PostgreSQL", () => {
    expect(migration).toContain("i.location_id = p_location_id");
    expect(migration).toContain("i.variant_id = p_variant_id");
    expect(migration).toContain("o.status");
    expect(migration).toContain("r.returned_quantity");
    expect(migration).toContain("n.available_quantity");
    expect(migration).not.toContain("xmin");
    expect(migration).toContain(
      "(p_metric->>'eligibleDays7d')::numeric / 7",
    );
    expect(migration).toContain(
      "(p_metric->>'eligibleDays90d')::numeric / 90",
    );
    expect(migration).toContain(
      "'m5-derived-metrics-v1'",
    );
    expect(migration).toContain("algorithm_version");
    expect(migration).not.toContain("created_at = excluded.created_at");
    expect(migration).toContain("'incoming_state_unknown'");
    expect(migration).toContain("'inventory_age_unknown'");
  });

  it("grants execution only to service_role", () => {
    expect(migration).toContain(
      "from public, anon, authenticated",
    );
    expect(migration).toContain("to service_role");
    expect(migration).not.toContain("to authenticated");
    expect(migration).not.toContain("to anon");
  });

  it("keeps calculation in the closed aggregators", () => {
    expect(recompute).toContain("aggregateSales");
    expect(recompute).toContain("aggregateInventoryMetrics");
    expect(recompute).not.toContain(
      "calculateRecommendedOrderQuantity",
    );
    expect(recompute).not.toContain("calculateStockoutRisk");
    expect(recompute).not.toContain("forecast");
    expect(recompute).toContain('import "server-only"');
  });

  it("reads the source token and payloads from one statement", () => {
    const oldSnapshot = migration.slice(
      migration.indexOf(
        "function public.sku_daily_metric_source_snapshot",
      ),
      migration.indexOf(
        "function public.commit_sku_daily_metric",
      ),
    );
    const corrected = read(
      "supabase/migrations/20261015130000_m5_5_source_snapshot_consistency.sql",
    );

    expect(oldSnapshot).toContain("into source_token");
    expect(oldSnapshot).toContain("into orders_json");
    expect(corrected).not.toContain("into source_token");
    expect(corrected).not.toContain("into orders_json");
    expect(corrected).toContain("from (select 1) as snapshot_anchor");
    expect(corrected).toContain("scoped_items");
    expect(corrected).toContain("i.location_id = p_location_id");
    expect(corrected).toContain("i.variant_id = p_variant_id");
  });

  it("corrects coverage identity and bounds the commit lock wait", () => {
    expect(coverage).toContain("abs(coverage_ratio_%sd * %s - eligible_days_%sd) < 0.000001");
    expect(coverage).toContain("coverage_ratio_%sd >= 0");
    expect(coverage).toContain("coverage_ratio_%sd <= 1");
    expect(coverage).toContain("unexpected coverage constraint");
    expect(coverage).toContain(
      "set_config('lock_timeout', '2s', true)",
    );
    expect(coverage).not.toContain(
      "supabase/migrations/20261014100000_m5_2_sku_daily_metrics.sql",
    );
  });
});
