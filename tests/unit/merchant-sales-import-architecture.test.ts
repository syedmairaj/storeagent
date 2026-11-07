import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("merchant sales import architecture", () => {
  it("reuses M3 CSV order lanes and SyncRun persistence", () => {
    const actions = read("lib/sales-import/actions.ts");
    expect(actions).toContain("executeCsvImport");
    expect(actions).toContain("createCsvSyncRunPersistence");
    expect(actions).toContain("createCsvSupabasePersistence");
    expect(actions).toContain("ensureCsvStoreIntegration");
    expect(actions).toContain("authorizeMerchantInventoryImport");
    expect(actions).toContain("assertNoConflictingSalesHistory");
    expect(actions).not.toContain("decideInventoryAction");
    expect(actions).not.toContain("enqueue");
    expect(actions).not.toContain("metric-recompute");

    const plan = read("lib/sales-import/build-csv-plan.ts");
    expect(plan).toContain('resourceType: "order"');
    expect(plan).toContain('resourceType: "order_item"');
    expect(plan).toContain("variantExternalId");
    expect(plan).not.toContain("return_refund");
    expect(plan).not.toContain("returnedQuantity");

    const guard = read("lib/sales-import/conflict-guard.ts");
    expect(guard).toContain('import "server-only"');
    expect(guard).toContain("collectSalesHistoryConflicts");
  });

  it("loads SKUs through the member-scoped server client", () => {
    const load = read("lib/sales-import/load-known-skus.ts");
    expect(load).toContain('import "server-only"');
    expect(load).toContain("createSupabaseServerClient");
    expect(load).toContain('from("product_variants")');
    expect(load).not.toContain("createSupabaseAdminClient");
  });

  it("defers returns and keeps readiness cover fail-closed", () => {
    const contract = read("lib/sales-import/contract.ts");
    expect(contract).toContain("MERCHANT_SALES_CSV_DEFERRED_RETURN_HEADERS");
    expect(contract).toContain("Returns / net-sales-after-returns");

    const assess = read("lib/inventory-readiness/assess.ts");
    expect(assess).toContain("grainAlignedKnownDemandCount");
    expect(assess).toContain("Import sales history CSV");
  });

  it("wires the sales import page and inventory entry points", () => {
    expect(
      read(
        "app/(app)/app/[organizationId]/inventory/sales-import/page.tsx",
      ),
    ).toContain("SalesImportWizard");
    expect(
      read("app/(app)/app/[organizationId]/inventory/page.tsx"),
    ).toContain("inventory/sales-import");
    expect(
      read("components/inventory-readiness/decision-readiness-panel.tsx"),
    ).toContain("inventory/sales-import");
  });
});
