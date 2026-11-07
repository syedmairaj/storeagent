import type { Metadata } from "next";

import { AuthAlert, AuthShell, AuthTextLink } from "@/components/auth/auth-shell";

export const metadata: Metadata = {
  title: "Confirm your email",
};

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const params = await searchParams;
  const email = params.email?.trim();

  return (
    <AuthShell
      panelLabel="Email confirmation"
      title="Confirm your email"
      description="If this Auth project requires email confirmation, open the link we sent. That returns through the secure auth callback, which provisions your first organization exactly once."
      footer={
        <p>
          Wrong address? <AuthTextLink href="/signup">Start over</AuthTextLink>
          {" · "}
          <AuthTextLink href="/login">Sign in</AuthTextLink>
        </p>
      }
    >
      <div className="space-y-3">
        <AuthAlert tone="info">
          {email ? (
            <>
              A confirmation message was requested for{" "}
              <span className="font-semibold text-[var(--sa-ink)]">{email}</span>.
            </>
          ) : (
            <>A confirmation message was requested for your email address.</>
          )}
        </AuthAlert>
        <AuthAlert tone="info">
          Local Supabase often has email confirmation disabled, so signup may
          create a session immediately without this step. Hosted email
          verification is a separate Auth configuration and is not assumed
          complete by this page.
        </AuthAlert>
      </div>
    </AuthShell>
  );
}
