import type { Metadata } from "next";

import {
  AuthAlert,
  AuthShell,
  AuthTextLink,
} from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = {
  title: "Forgot password",
};

const RECOVERY_ERROR_COPY: Record<string, string> = {
  invalid: "That reset link was incomplete or malformed.",
  wrong_purpose: "That link was not a password-recovery link.",
  exchange_failed: "That reset link is invalid or has already been used.",
  missing: "Open a fresh reset link from your email to choose a new password.",
  expired: "That recovery challenge has expired. Request a new reset link.",
  mismatch:
    "That recovery challenge does not match the signed-in account. Request a new reset link.",
};

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ recovery_error?: string }>;
}) {
  const params = await searchParams;
  const recoveryError = params.recovery_error
    ? RECOVERY_ERROR_COPY[params.recovery_error] ??
      "Unable to start password recovery."
    : null;

  return (
    <AuthShell
      panelLabel="Account recovery"
      title="Reset your password"
      description="We’ll email a secure link. Opening it verifies recovery through Supabase Auth and creates a short-lived, one-time server challenge."
      footer={
        <p>
          Remembered it? <AuthTextLink href="/login">Back to sign in</AuthTextLink>
        </p>
      }
    >
      {recoveryError ? (
        <div className="mb-5">
          <AuthAlert>{recoveryError}</AuthAlert>
        </div>
      ) : null}
      <ForgotPasswordForm />
    </AuthShell>
  );
}
