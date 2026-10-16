import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function read(relativePath: string): string {
  return fs.readFileSync(
    path.join(process.cwd(), relativePath),
    "utf8",
  );
}

describe("M5.6A metric source events", () => {
  const migration = read(
    "supabase/migrations/20261015140000_m5_6a_metric_source_events.sql",
  );

  it("captures unconsumed source dates without recomputation", () => {
    expect(migration).toContain(
      "create table public.sku_daily_metric_source_events",
    );
    expect(migration).toContain("consumed_at timestamptz null");
    expect(migration).toContain(
      "algorithm_version = 'm5-derived-metrics-v1'",
    );
    expect(migration).toContain("where consumed_at is null");
    expect(migration).toContain(
      "enable row level security",
    );
    expect(migration).toContain(
      "from public, anon, authenticated, service_role",
    );
    expect(migration).toContain("grant select");
    expect(migration).not.toContain("grant insert");
    expect(migration).not.toContain("grant update");
    expect(migration).not.toContain(
      "sku_daily_metric_recompute_requests",
    );
    expect(migration).not.toContain("dirty_generation");
    expect(migration).not.toContain("commit_sku_daily_metric");
  });

  it("keeps old and new grains for the approved source tables", () => {
    expect(migration).toContain(
      "after update on public.orders",
    );
    expect(migration).toContain(
      "referencing old table as old_orders new table as new_orders",
    );
    expect(migration).toContain(
      "previous_order.ordered_at is distinct from next_order.ordered_at",
    );
    expect(migration).toContain(
      "after insert on public.order_items",
    );
    expect(migration).toContain(
      "after update on public.order_items",
    );
    expect(migration).toContain(
      "after delete on public.order_items",
    );
    expect(migration).toContain("item.location_id is not null");
    expect(migration).toContain(
      "after insert on public.return_refunds",
    );
    expect(migration).toContain(
      "after update on public.return_refunds",
    );
    expect(migration).toContain(
      "after delete on public.return_refunds",
    );
    expect(migration).toContain(
      "after insert on public.inventory_snapshots",
    );
    expect(migration).not.toContain("purchase_orders");
    expect(migration).not.toContain(
      "after update on public.inventory_snapshots",
    );
    expect(migration).not.toContain(
      "after delete on public.inventory_snapshots",
    );
  });
});
