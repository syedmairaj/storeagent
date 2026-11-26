import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildAuthCallbackUrl,
  resolveAuthBrowserOrigin,
} from "@/lib/auth/auth-origin";
import {
  isGoogleAuthConfigured,
  isPublicSignupAllowed,
} from "@/lib/auth/public-signup";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("passwordless auth architecture", () => {
  it("keeps hosted public signup closed by default", () => {
    expect(isPublicSignupAllowed({ VERCEL_ENV: "production" })).toBe(false);
    expect(isPublicSignupAllowed({ VERCEL_ENV: "preview" })).toBe(false);
    expect(
      isPublicSignupAllowed({
        VERCEL_ENV: "production",
        STOREAGENT_PUBLIC_SIGNUP: "1",
      }),
    ).toBe(true);
    expect(isPublicSignupAllowed({})).toBe(true);
  });

  it("does not claim Google is ready without the public flag", () => {
    expect(isGoogleAuthConfigured({})).toBe(false);
    expect(
      isGoogleAuthConfigured({ NEXT_PUBLIC_AUTH_GOOGLE_ENABLED: "1" }),
    ).toBe(true);
  });

  it("allowlists auth callback origins and rejects open redirects", () => {
    expect(
      resolveAuthBrowserOrigin("http://127.0.0.1:3014", {
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:55321",
      }),
    ).toBe("http://127.0.0.1:3014");
    expect(
      resolveAuthBrowserOrigin("https://evil.example", {
        NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3000",
      }),
    ).toBe("http://127.0.0.1:3000");
    expect(
      buildAuthCallbackUrl({
        origin: "http://127.0.0.1:3014",
        nextPath: "/app",
      }),
    ).toContain("/auth/callback?next=%2Fapp");
  });

  it("wires modal + magic link + google entry without deleting recovery", () => {
    const modal = read("components/auth/auth-modal.tsx");
    const entry = read("components/auth/auth-entry.tsx");
    const client = read("lib/auth/passwordless-client.ts");
    expect(modal).toContain('role="dialog"');
    expect(modal).toContain("aria-modal");
    expect(modal).toContain("Escape");
    expect(modal).toContain("bg-[var(--sa-porcelain)]");
    expect(modal).toContain("max-w-[460px]");
    expect(modal).toContain("backdrop-blur");
    // Portal mounts after client mount — no render-time document/window branch.
    expect(modal).toContain("useSyncExternalStore");
    expect(modal).toContain("useHasClientMounted");
    expect(modal).toContain("if (!mounted || !open)");
    expect(modal).not.toMatch(/typeof document\s*===\s*["']undefined["']/);
    expect(entry).toContain("Continue with Google");
    expect(entry).toContain("Send magic link");
    expect(entry).toContain("Google sign-in is not available yet");
    expect(entry).toContain("pointer-events-none");
    expect(entry).toContain("setCooldownSeconds");
    expect(entry).not.toMatch(/useState\(\(\)\s*=>\s*Date\.now\(\)\)/);
    expect(client).toContain("signInWithOtp");
    expect(client).toContain("signInWithOAuth");
    expect(client).toContain("shouldCreateUser");
    expect(fs.existsSync(path.join(ROOT, "lib/auth/password-recovery.ts"))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(ROOT, "app/auth/recovery/route.ts"))).toBe(
      true,
    );
  });

  it("keeps login password mode and signup routes available", () => {
    const login = read("app/(auth)/login/page.tsx");
    const signup = read("app/(auth)/signup/page.tsx");
    expect(login).toContain('mode === "password"');
    expect(login).toContain("Sign in with password");
    expect(login).toContain("SignInForm");
    expect(login).toContain("CompactAuthPage");
    expect(login).toContain("Welcome to StoreAgent");
    expect(signup).toContain("AuthEntry");
    expect(signup).toContain("CompactAuthPage");
    expect(signup).toContain("isPublicSignupAllowed");
  });

  it("aligns Playwright auth setup with automated magic-link + optional password", () => {
    const setup = read("tests/e2e/auth.setup.ts");
    const envHelper = read("tests/e2e/helpers/env.ts");
    const magic = read("tests/e2e/helpers/magic-link-auth.ts");
    const mailpit = read("tests/e2e/helpers/mailpit.ts");
    const local = read("tests/e2e/helpers/local-stack.ts");
    const org = read("tests/e2e/helpers/org-contract.ts");
    expect(setup).toContain("authenticateWithMagicLink");
    expect(setup).toContain("ORG_MEMBERSHIP_BLOCKED");
    expect(setup).toContain("/login?mode=password&next=/app");
    expect(setup).toContain("/sign in with password/i");
    expect(setup).not.toContain("/sign in to storeagent/i");
    expect(magic).toContain('/login?next=/app');
    expect(magic).toContain("/welcome to storeagent/i");
    expect(magic).toContain("/^send magic link$/i");
    expect(magic).toContain("waitForMagicLinkEmail");
    expect(magic).toContain("assertExistingLocalAuthUser");
    expect(magic).toContain("page.goto(captured.verifyUrl");
    expect(mailpit).toContain("extractVerifyHref");
    expect(mailpit).toContain(":55324");
    expect(local).toContain("hosted Supabase refused");
    expect(local).toContain("55321");
    expect(local).toContain("55324");
    expect(org).toContain("/set your organization context/i");
    expect(org).toContain("ORG_MEMBERSHIP_BLOCKED");
    expect(envHelper).toContain("PLAYWRIGHT_AUTH_DIR");
    expect(envHelper).toContain("resolveE2EEmail");
    expect(envHelper).toContain("resolveE2EAuthMode");
  });

  it("keeps manual capture on default magic-link /login without harness /verify", () => {
    const capture = read("tests/e2e/capture-auth.manual.ts");
    const config = read("playwright.config.ts");
    const readme = read("tests/e2e/README.md");
    expect(capture).toContain('/login?next=/app');
    expect(capture).toContain("/welcome to storeagent/i");
    expect(capture).toContain("page.pause()");
    expect(capture).toContain('[data-actions-synthetic-banner="true"]');
    expect(capture).toContain("storageState");
    expect(capture).toContain("ORG_MEMBERSHIP_BLOCKED");
    expect(capture).not.toMatch(/\/auth\/v1\/verify/);
    expect(capture).not.toContain("/login?mode=password");
    expect(readme).toContain("127.0.0.1:55324");
    expect(readme).toContain("Paste that URL **once**");
    expect(config).toContain("PLAYWRIGHT_AUTH_DIR");
    expect(config).toContain("resolveAuthStateFile");
    expect(config).toContain("merchant-acceptance");
  });
});
