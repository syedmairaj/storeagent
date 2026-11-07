import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function storeBootstrapMigration(): string {
  const directory = path.join(ROOT, "supabase", "migrations");
  const matches = fs
    .readdirSync(directory)
    .filter((file) => file.endsWith("_m1_9_first_store_bootstrap.sql"));

  expect(matches).toHaveLength(1);

  return fs.readFileSync(path.join(directory, matches[0]!), "utf8");
}

describe("StoreAgent M1.9 first-store bootstrap architecture", () => {
  it("uses a security definer boundary bound to auth.uid", () => {
    const source = storeBootstrapMigration().replace(/\s+/g, " ").toLowerCase();

    expect(source).toContain("security definer");
    expect(source).toContain("auth.uid()");
    expect(source).toContain("set search_path = ''");
    expect(source).toContain("'owner', 'admin'");
    expect(source).toContain("pg_advisory_xact_lock");
  });

  it("does not grant authenticated clients direct store mutation", () => {
    const rls = read(
      "supabase/migrations/20261009150000_m1_5_rls_tenant_enforcement.sql",
    );

    expect(rls).toContain("revoke insert, update, delete");
    expect(rls).toContain("on table public.stores");
    expect(rls).not.toContain("create policy stores_insert");
    expect(rls).not.toContain("create policy stores_update");
  });

  it("requires a completed organization profile and refuses bootstrap currency", () => {
    const source = storeBootstrapMigration();
    expect(source).toContain("Organization profile is incomplete.");
    expect(source).toContain("normalized_currency = 'XXX'");
    expect(source).toContain("Organization already has a store.");
  });

  it("creates a default location without inventing inventory", () => {
    const source = storeBootstrapMigration();
    expect(source).toContain("insert into public.locations");
    expect(source).toContain("'Main'");
    expect(source).not.toContain("inventory_snapshots");
  });

  it("routes creation through the trusted server action", () => {
    const actions = read("lib/auth/actions.ts");
    expect(actions).toContain("create_current_user_first_organization_store");
    expect(actions).toContain("createFirstOrganizationStoreAction");
    expect(actions).toContain('"use server"');
  });

  it("keeps first-store setup outside arbitrary tenant auto-selection", () => {
    const onboarding = read("app/(app)/app/onboarding/store/page.tsx");
    const home = read("app/(app)/app/[organizationId]/page.tsx");
    const orgForm = read("components/auth/organization-setup-form.tsx");

    expect(onboarding).toContain("completeOrganizations.length === 1");
    expect(onboarding).toContain('redirect("/app")');
    expect(home).toContain("storeRows.length === 0 && canCreateStore");
    expect(home).toContain("/app/onboarding/store?organizationId=");
    expect(orgForm).toContain("/app/onboarding/store?organizationId=");
    expect(home).not.toContain("stores[0].id");
  });

  it("lands merchants on an honest inventory import entry point", () => {
    const form = read("components/auth/store-setup-form.tsx");
    const importPage = read(
      "app/(app)/app/[organizationId]/inventory/import/page.tsx",
    );

    expect(form).toContain("/inventory/import");
    expect(importPage).toContain("will not");
    expect(importPage).toContain("invent");
    expect(importPage).toContain("/actions");
  });
});
