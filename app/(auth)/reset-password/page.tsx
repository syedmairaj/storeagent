import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  AuthAlert,
  AuthShell,
  AuthTextLink,
} from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { authorizePasswordRecovery } from "@/lib/auth/password-recovery";

export const metadata: Metadata = {
  title: "Choose a new password",
};

export default async function ResetPasswordPage() {
  const authz = await authorizePasswordRecovery();

  if (!authz.ok) {
    redirect(`/forgot-password?recovery_error=${authz.reason}`);
  }

  return (
    <AuthShell
      panelLabel="Account recovery"
      title="Choose a new password"
      description="This page requires a verified, short-lived recovery challenge from your reset email. Ordinary sign-in sessions cannot open it."
      footer={
        <p>
          Need a new link?{" "}
          <AuthTextLink href="/forgot-password">Request another reset</AuthTextLink>
        </p>
      }
    >
      <div className="mb-5">
        <AuthAlert tone="info">
          Recovery verified for{" "}
          <span className="font-semibold text-[var(--sa-ink)]">
            {authz.email ?? "your account"}
          </span>
          . This challenge expires soon and can be used once.
        </AuthAlert>
      </div>
      <ResetPasswordForm />
    </AuthShell>
  );
}
