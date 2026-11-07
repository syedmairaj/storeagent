import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthShell, AuthTextLink } from "@/components/auth/auth-shell";
import { SignUpForm } from "@/components/auth/sign-up-form";

export const metadata: Metadata = {
  title: "Create account",
};

export default function SignUpPage() {
  return (
    <AuthShell
      panelLabel="Merchant onboarding"
      title="Create your StoreAgent account"
      description="Sign up locally with email and password. Your first organization is provisioned through the trusted server boundary — never guessed in the browser."
      footer={
        <p>
          Already have an account?{" "}
          <AuthTextLink href="/login">Sign in</AuthTextLink>
        </p>
      }
    >
      <Suspense
        fallback={
          <div className="h-64 animate-pulse rounded-2xl bg-[color-mix(in_srgb,var(--sa-ink)_5%,transparent)]" />
        }
      >
        <SignUpForm />
      </Suspense>
    </AuthShell>
  );
}
