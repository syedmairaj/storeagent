import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

const QUEUE = read("lib/persistence/metric-rollover.ts");
const ROUTE = read("app/api/internal/metric-rollover/route.ts");
const MIGRATION = read(
  "supabase/migrations/20261020100000_m5_6d_metric_daily_rollover.sql",
);

describe("M5.6D metric rollover architecture", () => {
  it("does not recalculate metrics or open later pipeline stages", () => {
    for (const source of [QUEUE, ROUTE, MIGRATION]) {
      for (const forbidden of [
        "@/lib/metrics/",
        "commit_sku_daily_metric",
        "@/lib/forecasting",
        "@/lib/decision-engine",
        "@/lib/ai",
        "forecast_generation",
        "action_generation",
        "explanation_generation",
      ]) {
        expect(source).not.toContain(forbidden);
      }
    }
  });

  it("keeps a single recompute request queue and no second work queue", () => {
    expect(MIGRATION).toContain("sku_daily_metric_recompute_requests");
    expect(MIGRATION).toContain("sku_daily_metric_rollover_runs");
    expect(MIGRATION).toContain("sku_daily_metric_rollover_enqueues");
    expect(MIGRATION).not.toMatch(/create table public\.worker_jobs\b/i);
    expect(MIGRATION).toContain("Enrollment ledger");
    expect(MIGRATION).toContain("not a work queue");
  });

  it("freezes eligibility, uses lookahead completion, and recovers late events via M5.6A/B", () => {
    expect(MIGRATION).toContain("eligible_cutoff_at");
    expect(MIGRATION).toContain("v_batch_limit + 1");
    expect(MIGRATION).toContain("M5.6A statement triggers");
    expect(MIGRATION).toContain("M5.6B expansion");
    expect(MIGRATION).toContain("on conflict do nothing");
    expect(MIGRATION).toContain("pg_advisory_xact_lock(5606004)");
  });

  it("recovers only invalid_iana_timezone failures after timezone correction", () => {
    expect(MIGRATION).toContain("Invalid timezone recovery");
    expect(MIGRATION).toContain("invalid_iana_timezone");
    expect(MIGRATION).toContain(
      "is distinct from 'invalid_iana_timezone'",
    );
    expect(MIGRATION).toContain("Recover only invalid_iana_timezone failures");
  });

  it("keeps service-role-only security definer contracts", () => {
    expect(MIGRATION).toContain("security definer");
    expect(MIGRATION).toContain("set search_path = ''");
    expect(MIGRATION).toContain("grant execute");
    expect(MIGRATION).toContain("to service_role");
    expect(MIGRATION).toContain("from public, anon, authenticated");
    expect(QUEUE).toContain('import "server-only"');
    expect(QUEUE).toContain("RLS_IS_BYPASSED = true");
    expect(ROUTE).toContain('import "server-only"');
  });

  it("protects the internal trigger and returns counts only", () => {
    expect(ROUTE).toContain('export const runtime = "nodejs"');
    expect(ROUTE).toContain("readMetricRolloverWorkerConfig(process.env)");
    expect(ROUTE).toContain("isAuthorizedMetricRolloverRequest(");
    expect(ROUTE).toContain("export async function POST(");
    expect(ROUTE).not.toMatch(/export async function (GET|PUT|PATCH|DELETE)/);
    expect(ROUTE).not.toContain("request.json(");
    expect(ROUTE).not.toContain("searchParams");
    expect(QUEUE).toContain("timingSafeEqual(");
    expect(QUEUE).toContain('=== "1"');
  });

  it("does not configure a scheduler", () => {
    expect(fs.existsSync(path.join(ROOT, "vercel.json"))).toBe(false);
    expect(ROUTE.toLowerCase()).not.toContain("cron");
    expect(QUEUE.toLowerCase()).not.toContain("cron");
  });
});
