import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthEntry } from "@/components/auth/auth-entry";
import {
  AuthAlert,
  AuthTextLink,
} from "@/components/auth/auth-shell";
import { CompactAuthPage } from "@/components/auth/compact-auth-page";
import { SignUpForm } from "@/components/auth/sign-up-form";
import {
  isGoogleAuthConfigured,
  isPublicSignupAllowed,
} from "@/lib/auth/public-signup";

export const metadata: Metadata = {
  title: "Create account",
};

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const params = await searchParams;
  const passwordMode = params.mode === "password";
  const allowCreate = isPublicSignupAllowed();
  const googleEnabled = isGoogleAuthConfigured();

  if (passwordMode) {
    return (
      <CompactAuthPage
        title="Create an account"
        description={
          allowCreate
            ? "Create your StoreAgent account with email and password."
            : "Public signup is closed in this environment."
        }
        footer={
          <p>
            Already have an account?{" "}
            <AuthTextLink href="/login">Sign in</AuthTextLink>
          </p>
        }
      >
        {!allowCreate ? (
          <AuthAlert tone="info">
            Public signup is closed. Use a magic link with an existing account.
          </AuthAlert>
        ) : (
          <Suspense
            fallback={
              <div className="h-48 animate-pulse rounded-2xl bg-[color-mix(in_srgb,var(--sa-ink)_5%,transparent)]" />
            }
          >
            <SignUpForm />
          </Suspense>
        )}
      </CompactAuthPage>
    );
  }

  return (
    <CompactAuthPage
      title="Welcome to StoreAgent"
      description="Sign in or create your account in seconds."
      footer={
        <p>
          Already have an account?{" "}
          <AuthTextLink href="/login">Continue</AuthTextLink>
        </p>
      }
    >
      <Suspense
        fallback={
          <div className="h-48 animate-pulse rounded-2xl bg-[color-mix(in_srgb,var(--sa-ink)_5%,transparent)]" />
        }
      >
        <AuthEntry
          nextPath="/app"
          passwordHref={
            allowCreate ? "/signup?mode=password" : "/login?mode=password"
          }
          allowCreate={allowCreate}
          googleEnabled={googleEnabled}
        />
      </Suspense>
    </CompactAuthPage>
  );
}
