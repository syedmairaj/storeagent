import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("merchant inventory import architecture", () => {
  it("routes confirmations through trusted CSV execution, not client inserts", () => {
    const actions = read("lib/inventory-import/actions.ts");
    const authorize = read("lib/inventory-import/authorize.ts");
    expect(actions).toContain('"use server"');
    expect(actions).toContain("executeCsvImport");
    expect(actions).toContain("ensureCsvStoreIntegration");
    expect(authorize).toContain("integrations.manage");
    expect(actions).not.toContain('.from("inventory_snapshots").insert');
  });

  it("keeps service-role usage server-only", () => {
    const ensure = read("lib/inventory-import/ensure-integration.ts");
    const actions = read("lib/inventory-import/actions.ts");
    expect(ensure).toContain('import "server-only"');
    expect(actions).toContain("createSupabaseAdminClient");
    expect(read("components/inventory-import/inventory-import-wizard.tsx")).not.toContain(
      "createSupabaseAdminClient",
    );
  });

  it("requires explicit confirmation and rejects files with invalid rows", () => {
    const actions = read("lib/inventory-import/actions.ts");
    expect(actions).toContain("confirmationToken");
    expect(actions).toContain("No valid rows are ready to import.");
    expect(actions).toContain("still need fixes before import");
  });

  it("exposes inventory view and import entry routes", () => {
    expect(
      fs.existsSync(
        path.join(
          ROOT,
          "app/(app)/app/[organizationId]/inventory/import/page.tsx",
        ),
      ),
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(ROOT, "app/(app)/app/[organizationId]/inventory/page.tsx"),
      ),
    ).toBe(true);
    expect(read("components/app-shell/app-shell.tsx")).toContain(
      "InventoryNavLink",
    );
  });
});
