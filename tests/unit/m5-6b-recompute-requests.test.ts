import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function read(relativePath: string): string {
  return fs.readFileSync(
    path.join(process.cwd(), relativePath),
    "utf8",
  );
}

describe("M5.6B recompute request generation", () => {
  const migration = read(
    "supabase/migrations/20261016100000_m5_6b_metric_recompute_requests.sql",
  );

  it("stores generation-aware requests behind service-role access", () => {
    expect(migration).toContain(
      "create table public.sku_daily_metric_recompute_requests",
    );
    expect(migration).toContain("dirty_generation bigint not null");
    expect(migration).toContain("claimed_generation bigint not null");
    expect(migration).toContain("applied_generation bigint not null");
    expect(migration).toContain("attempt_count integer not null");
    expect(migration).toContain("lease_owner_id text null");
    expect(migration).toContain("lease_claim_token text null");
    expect(migration).toContain("lease_claimed_at timestamptz null");
    expect(migration).toContain("lease_expires_at timestamptz null");
    expect(migration).toContain("'queued'");
    expect(migration).toContain("'claimed'");
    expect(migration).toContain("'running'");
    expect(migration).toContain("'retry_wait'");
    expect(migration).toContain("'succeeded'");
    expect(migration).toContain("'failed'");
    expect(migration).toContain("'cancelled'");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain(
      "from public, anon, authenticated, service_role",
    );
    expect(migration).toContain("grant select");
    expect(migration).not.toContain("grant insert");
    expect(migration).not.toContain("grant update");
    expect(migration).toContain(
      "to service_role",
    );
  });

  it("consumes locked events in the same transaction", () => {
    expect(migration).toContain(
      "consume_sku_daily_metric_source_events",
    );
    expect(migration).toContain("where event.consumed_at is null");
    expect(migration).toContain("for update skip locked");
    expect(migration).toContain("set consumed_at = pg_catalog.now()");
    expect(migration).toContain("source_date + 89");
    expect(migration).toContain(
      "in ('claimed', 'running')",
    );
    expect(migration).not.toContain("max(event_id)");
    expect(migration).not.toContain("commit_sku_daily_metric");
    expect(migration).not.toContain("purchase_orders");
  });
});
