import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const MIGRATION =
  "supabase/migrations/20261108040000_m3_merchant_sales_history_immutable.sql";

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("merchant sales history immutable architecture", () => {
  it("scopes SA002 commercial immutability to merchant-sales-import-v1", () => {
    const migration = read(MIGRATION);
    expect(migration).toContain("merchant-sales-import-v1%");
    expect(migration).toContain("errcode = 'SA002'");
    expect(migration).toContain("CSV merchant sales order history conflict");
    expect(migration).toContain(
      "CSV merchant sales order-item history conflict",
    );
    expect(migration).toContain("csv_lock_reconciliation_identity");
    expect(migration).toContain("grant execute");
    expect(migration).toContain("to service_role");
    expect(migration).toContain("revoke all");
    expect(migration).toContain("from public, anon, authenticated");
  });

  it("keeps merchant sales persistence on the SA002 history-conflict path", () => {
    const actions = read("lib/sales-import/actions.ts");
    expect(actions).toContain("executeCsvImport");
    expect(actions).toContain("merchant-sales-import-v1");

    const contract = read("lib/sales-import/contract.ts");
    expect(contract).toContain('merchant-sales-import-v1"');

    const plan = read("lib/sales-import/build-csv-plan.ts");
    expect(plan).toContain("MERCHANT_SALES_IMPORT_ADAPTER_VERSION");
    expect(plan).toContain(
      "${MERCHANT_SALES_IMPORT_ADAPTER_VERSION}-order",
    );
  });
});
