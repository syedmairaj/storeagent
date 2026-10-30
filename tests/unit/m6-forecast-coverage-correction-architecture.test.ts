import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

const ROOT = process.cwd();
const MIGRATION =
  "supabase/migrations/20261030120000_m6_p2b2c3b_forecast_coverage_correction_outbox.sql";
const M5_6A =
  "supabase/migrations/20261015140000_m5_6a_metric_source_events.sql";

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

function normalized(relative: string): string {
  return read(relative).replace(/\s+/g, " ").toLowerCase();
}

describe("M6 P2b.2c.3b forecast coverage correction architecture", () => {
  it("adds a separate outbox without modifying M5.6A", () => {
    const sql = normalized(MIGRATION);
    const m56a = read(M5_6A);

    expect(sql).toContain(
      "create table public.forecast_coverage_correction_events",
    );
    expect(sql).toContain("arrived_at");
    expect(sql).toContain("business_at");
    expect(sql).not.toContain("sku_daily_metric_source_events");
    expect(m56a).not.toContain("forecast_coverage_correction");
  });

  it("captures orders, order_items, and return_refunds with TZ fail-closed", () => {
    const source = read(MIGRATION);

    expect(source).toContain(
      "orders_capture_forecast_coverage_corrections",
    );
    expect(source).toContain(
      "order_items_capture_forecast_coverage_corrections_insert",
    );
    expect(source).toContain(
      "order_items_capture_forecast_coverage_corrections_update",
    );
    expect(source).toContain(
      "order_items_capture_forecast_coverage_corrections_delete",
    );
    expect(source).toContain(
      "return_refunds_capture_forecast_coverage_corrections_insert",
    );
    expect(source).toContain(
      "return_refunds_capture_forecast_coverage_corrections_update",
    );
    expect(source).toContain(
      "return_refunds_capture_forecast_coverage_corrections_delete",
    );
    expect(source).toContain("invalid_iana_timezone");
    expect(source).toContain("pg_timezone_names");
    expect(source).toContain("clock_timestamp()");
  });

  it("applies with existing integration XOR actor auth and grain locks", () => {
    const source = read(MIGRATION);
    const sql = normalized(MIGRATION);

    expect(source).toContain("apply_forecast_coverage_correction_events");
    expect(source).toContain(
      "coverage invalidation requires exactly one of integration_id or actor_user_id",
    );
    expect(source).toContain("forecast_evidence_assert_provider_integration");
    expect(source).toContain("forecast_evidence_assert_merchant_actor");
    expect(source).toContain("invalidate_forecast_day_coverage_evidence");
    expect(source).toContain("for update skip locked");
    expect(source).toContain("forecast_coverage_correction_grain_lock");
    expect(sql).toContain("5606203");
    expect(source).toContain("already_invalidated");
    expect(source).not.toMatch(/system[_-]?agent/i);
  });

  it("exposes a reader fence and documents that forecast readers must use it", () => {
    const source = read(MIGRATION);

    expect(source).toContain("forecast_coverage_has_pending_corrections");
    expect(source).toMatch(/Reader safety/i);
    expect(source).toMatch(
      /does not wire the fence into forecast readers/i,
    );
    expect(source).toContain(
      "forecast_coverage_correction_matches_evidence",
    );
  });

  it("keeps outbox DML revoked from clients and EXECUTE on service_role only", () => {
    const source = read(MIGRATION);

    expect(source).toContain(
      "revoke all\non table public.forecast_coverage_correction_events",
    );
    expect(source).toContain(
      "from public, anon, authenticated, service_role",
    );
    expect(source).toContain("grant select");
    expect(source).toContain("to service_role");
    expect(source).toContain(
      "grant execute\non function public.apply_forecast_coverage_correction_events",
    );
  });
});
