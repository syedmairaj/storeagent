"use client";

import { type FormEvent, useState } from "react";
import { LoaderCircle } from "lucide-react";

import {
  AuthAlert,
  AuthField,
  authControlClassName,
  authPrimaryButtonClassName,
} from "@/components/auth/auth-shell";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError(null);

    const supabase = createSupabaseBrowserClient();
    // Custom recovery template uses token_hash → /auth/recovery.
    // redirectTo remains an allow-listed app origin for Auth mailer safety.
    const redirectTo = `${window.location.origin}/auth/recovery`;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      { redirectTo },
    );

    if (resetError) {
      setError("Unable to send a reset email right now.");
      setSubmitting(false);
      return;
    }

    setSent(true);
    setSubmitting(false);
  }

  if (sent) {
    return (
      <AuthAlert tone="success">
        If an account exists for that email, a reset link is on the way. Open it
        on this device to choose a new password.
      </AuthAlert>
    );
  }

  return (
    <form method="post" onSubmit={handleSubmit} className="space-y-5">
      <AuthField
        id="email"
        label="Email"
        hint="We only email the address on the account. No confirmation of existence beyond this message."
      >
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={authControlClassName}
          placeholder="you@company.com"
        />
      </AuthField>

      {error ? <AuthAlert>{error}</AuthAlert> : null}

      <button
        type="submit"
        disabled={submitting}
        className={authPrimaryButtonClassName}
      >
        {submitting ? (
          <>
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            Sending link
          </>
        ) : (
          "Send reset link"
        )}
      </button>
    </form>
  );
}
