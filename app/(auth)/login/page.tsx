import type { Metadata } from "next";
import { Suspense } from "react";

import {
  AuthAlert,
  AuthShell,
  AuthTextLink,
} from "@/components/auth/auth-shell";
import { SignInForm } from "@/components/auth/sign-in-form";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>;
}) {
  const params = await searchParams;

  return (
    <AuthShell
      title="Sign in to StoreAgent"
      description="Use your StoreAgent account to continue to organization selection."
      footer={
        <p>
          New here? <AuthTextLink href="/signup">Create an account</AuthTextLink>
        </p>
      }
    >
      {params.reset === "1" ? (
        <div className="mb-5">
          <AuthAlert tone="success">
            Password updated. Sign in with your new password.
          </AuthAlert>
        </div>
      ) : null}

      <Suspense
        fallback={
          <div className="h-64 animate-pulse rounded-2xl bg-[color-mix(in_srgb,var(--sa-ink)_5%,transparent)]" />
        }
      >
        <SignInForm />
      </Suspense>
    </AuthShell>
  );
}
