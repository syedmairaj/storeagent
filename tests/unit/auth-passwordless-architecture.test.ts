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
    expect(entry).toContain("Continue with Google");
    expect(entry).toContain("Send magic link");
    expect(entry).toContain("Google sign-in is not available yet");
    expect(entry).toContain("pointer-events-none");
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
    expect(login).toContain("SignInForm");
    expect(login).toContain("CompactAuthPage");
    expect(signup).toContain("AuthEntry");
    expect(signup).toContain("CompactAuthPage");
    expect(signup).toContain("isPublicSignupAllowed");
  });
});
