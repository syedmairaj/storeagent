"use client";

import { type FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, LoaderCircle } from "lucide-react";

import {
  AuthAlert,
  AuthField,
  authControlClassName,
  authPrimaryButtonClassName,
} from "@/components/auth/auth-shell";
import { PasswordField } from "@/components/auth/password-field";
import { provisionAuthenticatedUserAction } from "@/lib/auth/actions";
import { safeAppNextPath } from "@/lib/auth/safe-next";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

function originRedirect(path: string) {
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}

export function SignUpForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError(null);

    if (password.length < 8) {
      setError("Use a password with at least 8 characters.");
      setSubmitting(false);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      setSubmitting(false);
      return;
    }

    const nextPath = safeAppNextPath(searchParams.get("next"));
    const supabase = createSupabaseBrowserClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: originRedirect(
          `/auth/callback?next=${encodeURIComponent(nextPath)}`,
        ),
      },
    });

    if (signUpError) {
      setError("Unable to create an account with those details.");
      setSubmitting(false);
      return;
    }

    // Email confirmation required — no session yet.
    if (!data.session) {
      router.replace(
        `/check-email?email=${encodeURIComponent(email.trim())}&next=${encodeURIComponent(nextPath)}`,
      );
      return;
    }

    const provisioned = await provisionAuthenticatedUserAction();
    if (!provisioned.ok) {
      setError(provisioned.error);
      setSubmitting(false);
      return;
    }

    router.replace(nextPath);
    router.refresh();
  }

  return (
    <form method="post" onSubmit={handleSubmit} className="space-y-5">
      <AuthField id="email" label="Work email">
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

      <PasswordField
        id="password"
        label="Password"
        autoComplete="new-password"
        placeholder="Create a password"
        hint="At least 8 characters. You stay in control of the account."
        minLength={8}
        value={password}
        onChange={setPassword}
      />

      <PasswordField
        id="confirm-password"
        label="Confirm password"
        autoComplete="new-password"
        placeholder="Repeat password"
        minLength={8}
        value={confirmPassword}
        onChange={setConfirmPassword}
      />

      {error ? <AuthAlert>{error}</AuthAlert> : null}

      <button
        type="submit"
        disabled={submitting}
        className={authPrimaryButtonClassName}
      >
        {submitting ? (
          <>
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            Creating account
          </>
        ) : (
          <>
            Create account
            <ArrowRight className="size-4" aria-hidden="true" />
          </>
        )}
      </button>
    </form>
  );
}
