import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthEntry } from "@/components/auth/auth-entry";
import {
  AuthAlert,
  AuthTextLink,
} from "@/components/auth/auth-shell";
import { CompactAuthPage } from "@/components/auth/compact-auth-page";
import { SignInForm } from "@/components/auth/sign-in-form";
import {
  isGoogleAuthConfigured,
  isPublicSignupAllowed,
} from "@/lib/auth/public-signup";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string; mode?: string }>;
}) {
  const params = await searchParams;
  const passwordMode = params.mode === "password";
  const allowCreate = isPublicSignupAllowed();
  const googleEnabled = isGoogleAuthConfigured();

  if (passwordMode) {
    return (
      <CompactAuthPage
        title="Sign in with password"
        description="Use your email and password to continue."
        footer={
          <p>
            Prefer a magic link?{" "}
            <AuthTextLink href="/login">Sign in without a password</AuthTextLink>
          </p>
        }
      >
        {params.reset === "1" ? (
          <div className="mb-4">
            <AuthAlert tone="success">
              Password updated. Sign in with your new password.
            </AuthAlert>
          </div>
        ) : null}
        <Suspense
          fallback={
            <div className="h-48 animate-pulse rounded-2xl bg-[color-mix(in_srgb,var(--sa-ink)_5%,transparent)]" />
          }
        >
          <SignInForm />
        </Suspense>
      </CompactAuthPage>
    );
  }

  return (
    <CompactAuthPage
      title="Welcome to StoreAgent"
      description="Sign in or create your account in seconds."
      footer={
        <p>
          Need a password account?{" "}
          <AuthTextLink href="/signup?mode=password">
            Create with password
          </AuthTextLink>
        </p>
      }
    >
      {params.reset === "1" ? (
        <div className="mb-4">
          <AuthAlert tone="success">
            Password updated. You can sign in with a magic link or password.
          </AuthAlert>
        </div>
      ) : null}
      <Suspense
        fallback={
          <div className="h-48 animate-pulse rounded-2xl bg-[color-mix(in_srgb,var(--sa-ink)_5%,transparent)]" />
        }
      >
        <AuthEntry
          nextPath="/app"
          passwordHref="/login?mode=password"
          allowCreate={allowCreate}
          googleEnabled={googleEnabled}
        />
      </Suspense>
    </CompactAuthPage>
  );
}
