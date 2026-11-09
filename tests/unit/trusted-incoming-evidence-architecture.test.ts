import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

function read(relativePath: string): string {
  return fs.readFileSync(
    path.join(process.cwd(), relativePath),
    "utf8",
  );
}

describe("Trusted Incoming Evidence V1 architecture", () => {
  const migration = read(
    "supabase/migrations/20261108180000_trusted_incoming_evidence_v1.sql",
  );
  const resolve = read("lib/metrics/resolve-eligible-incoming.ts");
  const record = read("lib/metrics/sku-daily-metric-record.ts");
  const recompute = read("lib/persistence/recompute-sku-daily-metric.ts");
  const aggregates = read("lib/metrics/inventory-aggregates.ts");
  const assess = read("lib/inventory-readiness/assess.ts");

  it("adds completeness attestation before empty sets become known zero", () => {
    expect(migration).toContain("store_incoming_evidence_attestations");
    expect(migration).toContain("evidence_complete");
    expect(migration).toContain(
      "upsert_current_user_store_incoming_evidence_attestation",
    );
    expect(resolve).toContain("incomingEvidenceComplete");
    expect(resolve).toContain("calculateValidIncomingPurchaseOrders");
    expect(resolve).not.toContain("calculateValidIncomingPurchaseOrderLine =");
  });

  it("keeps PO math outside inventory-aggregates and reuses frozen helpers", () => {
    expect(aggregates).not.toContain("calculateValidIncomingPurchaseOrders");
    expect(aggregates).toContain("INCOMING_STATE_UNKNOWN");
    expect(resolve).toContain(
      'from "@/lib/metrics/inventory-math"',
    );
    expect(recompute).toContain("resolveEligibleIncoming");
    expect(record).toContain("incoming?: EligibleIncomingEvidence");
  });

  it("wires PO source events and source-token fencing", () => {
    expect(migration).toContain(
      "capture_purchase_order_metric_source_events",
    );
    expect(migration).toContain(
      "capture_purchase_order_item_update_metric_source_events",
    );
    expect(migration).toContain("destination_location_id is not null");
    expect(migration).toContain("purchaseOrderLines");
    expect(migration).toContain("incomingEvidenceComplete");
    expect(migration).toContain("lock table public.purchase_orders");
    expect(migration).toContain(
      "lock table public.store_incoming_evidence_attestations",
    );
    expect(migration).toContain("errcode = 'SA008'");
    expect(migration).toContain("errcode = 'SA009'");
  });

  it("lifts SA009 only for qualified current-day incoming reasons", () => {
    expect(migration).toContain("purchase_order_status_unknown");
    expect(migration).toContain("received_quantity_unknown");
    expect(migration).toContain("received_exceeds_ordered");
    expect(migration).toContain("inventory_age_unknown");
    expect(migration).toContain("p_metric_date is distinct from v_as_of");
  });

  it("preserves commercial gate and least-privilege grants", () => {
    expect(assess).toMatch(/const canCommercial = false/);
    expect(migration).toMatch(
      /revoke all[\s\S]*from public, anon, authenticated/i,
    );
    expect(migration).toContain("to service_role");
    expect(migration).toContain("to authenticated");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("security definer");
  });

  it("does not treat snapshot incoming as trusted", () => {
    expect(recompute).not.toContain("incomingQuantity");
    expect(assess).toMatch(/CSV snapshot incoming/i);
  });
});
