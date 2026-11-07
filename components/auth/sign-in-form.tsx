"use client";

import { type FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, LoaderCircle } from "lucide-react";

import {
  AuthAlert,
  AuthField,
  AuthTextLink,
  authControlClassName,
  authPrimaryButtonClassName,
} from "@/components/auth/auth-shell";
import { PasswordField } from "@/components/auth/password-field";
import { provisionAuthenticatedUserAction } from "@/lib/auth/actions";
import { safeAppNextPath } from "@/lib/auth/safe-next";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setSubmitting(true);
    setError(null);

    const supabase = createSupabaseBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      setError("Unable to sign in with those credentials.");
      setSubmitting(false);
      return;
    }

    const provisioned = await provisionAuthenticatedUserAction();
    if (!provisioned.ok) {
      setError(provisioned.error);
      setSubmitting(false);
      return;
    }

    router.replace(safeAppNextPath(searchParams.get("next")));
    router.refresh();
  }

  return (
    <form method="post" onSubmit={handleSubmit} className="space-y-5">
      <AuthField id="email" label="Email">
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className={authControlClassName}
          placeholder="you@example.com"
        />
      </AuthField>

      <PasswordField
        id="password"
        label="Password"
        autoComplete="current-password"
        placeholder="Enter your password"
        value={password}
        onChange={setPassword}
      />

      <div className="flex justify-end">
        <AuthTextLink href="/forgot-password">Forgot password?</AuthTextLink>
      </div>

      {error ? <AuthAlert>{error}</AuthAlert> : null}

      <button
        type="submit"
        disabled={submitting}
        className={authPrimaryButtonClassName}
      >
        {submitting ? (
          <>
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            Signing in
          </>
        ) : (
          <>
            Sign in
            <ArrowRight className="size-4" aria-hidden="true" />
          </>
        )}
      </button>
    </form>
  );
}
