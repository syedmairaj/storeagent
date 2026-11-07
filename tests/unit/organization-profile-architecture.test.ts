import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function profileMigration(): string {
  const directory = path.join(ROOT, "supabase", "migrations");
  const matches = fs
    .readdirSync(directory)
    .filter((file) => file.endsWith("_m1_7_organization_profile_completion.sql"));

  expect(matches).toHaveLength(1);

  return fs.readFileSync(path.join(directory, matches[0]!), "utf8");
}

describe("StoreAgent M1.7 organization profile completion architecture", () => {
  it("uses a security definer boundary bound to auth.uid", () => {
    const source = profileMigration().replace(/\s+/g, " ").toLowerCase();

    expect(source).toContain("security definer");
    expect(source).toContain("auth.uid()");
    expect(source).toContain("set search_path = ''");
    expect(source).toContain("role = 'owner'");
  });

  it("does not grant authenticated clients direct organization mutation", () => {
    const rls = read(
      "supabase/migrations/20261009150000_m1_5_rls_tenant_enforcement.sql",
    );

    expect(rls).toContain("revoke insert, update, delete");
    expect(rls).toContain("on table public.organizations");
    expect(rls).not.toContain("create policy organizations_update");
  });

  it("rejects bootstrap currency at the database boundary", () => {
    const source = profileMigration();
    expect(source).toContain("normalized_currency = 'XXX'");
  });

  it("routes first-time setup through the trusted RPC", () => {
    const actions = read("lib/auth/actions.ts");
    expect(actions).toContain("complete_current_user_organization_profile");
    expect(actions).toContain('"use server"');
  });

  it("keeps password authentication on the provisioning path", () => {
    const signIn = read("components/auth/sign-in-form.tsx");
    const signUp = read("components/auth/sign-up-form.tsx");
    const appPage = read("app/(app)/app/page.tsx");

    expect(signIn).toContain("provisionAuthenticatedUserAction");
    expect(signUp).toContain("provisionAuthenticatedUserAction");
    expect(appPage).toContain("ensureCurrentUserProvisioned");
  });

  it("does not arbitrarily select among multiple incomplete organizations", () => {
    const onboarding = read("app/(app)/app/onboarding/page.tsx");
    expect(onboarding).toContain("organizationId");
    expect(onboarding).toContain("incomplete.length === 1");
    expect(onboarding).toContain('redirect("/app")');
    expect(onboarding).not.toContain("incomplete.find(() => true)");
  });

  it("updates only owned incomplete organizations atomically", () => {
    const source = profileMigration();
    expect(source).toContain("returning organization.id");
    expect(source).toContain("organization.default_currency = 'XXX'");
    expect(source).toContain("membership.role = 'owner'");
  });
});
