import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("password recovery architecture", () => {
  it("verifies recovery with token_hash and type=recovery", () => {
    const route = read("app/auth/recovery/route.ts");
    const service = read("lib/auth/password-recovery.ts");

    expect(service).toContain('type: "recovery"');
    expect(service).toContain("token_hash");
    expect(service).toContain("verifyOtp");
    expect(service).toContain("response.cookies.set");
    expect(route).toContain("token_hash");
    expect(route).toContain("establishRecoveryChallengeResponse");
    expect(route).not.toContain("searchParams.get(\"next\")");
  });

  it("gates reset-password on server-side recovery authorization", () => {
    const page = read("app/(auth)/reset-password/page.tsx");
    const form = read("components/auth/reset-password-form.tsx");

    expect(page).toContain("authorizePasswordRecovery");
    expect(page).not.toContain("getUser()");
    expect(form).toContain("completePasswordRecoveryAction");
    expect(form).not.toContain("updateUser");
  });

  it("consumes challenges atomically and keeps the table client-inaccessible", () => {
    const service = read("lib/auth/password-recovery.ts");
    const migration = read(
      "supabase/migrations/20261107120000_m1_8_password_recovery_challenges.sql",
    );

    expect(service).toContain('.is("consumed_at", null)');
    expect(service).toContain("consumed_at");
    expect(migration).toContain("revoke all");
    expect(migration).toContain("from authenticated");
    expect(migration).toContain("enable row level security");
    expect(migration).not.toContain("create policy");
  });

  it("uses a token_hash recovery email template", () => {
    const template = read("supabase/templates/recovery.html");
    const config = read("supabase/config.toml");

    expect(template).toContain("token_hash={{ .TokenHash }}");
    expect(template).toContain("type=recovery");
    expect(template).toContain("/auth/recovery");
    expect(config).toContain("./supabase/templates/recovery.html");
  });
});
