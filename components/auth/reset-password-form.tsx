"use client";

import { type FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, LoaderCircle } from "lucide-react";

import {
  AuthAlert,
  authPrimaryButtonClassName,
} from "@/components/auth/auth-shell";
import { PasswordField } from "@/components/auth/password-field";
import { completePasswordRecoveryAction } from "@/lib/auth/recovery-actions";

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await completePasswordRecoveryAction({
        password,
        confirmPassword,
      });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      router.replace("/login?reset=1");
      router.refresh();
    });
  }

  return (
    <form method="post" onSubmit={handleSubmit} className="space-y-5">
      <PasswordField
        id="password"
        label="New password"
        autoComplete="new-password"
        placeholder="Create a new password"
        minLength={8}
        value={password}
        onChange={setPassword}
      />

      <PasswordField
        id="confirm-password"
        label="Confirm new password"
        autoComplete="new-password"
        placeholder="Repeat new password"
        minLength={8}
        value={confirmPassword}
        onChange={setConfirmPassword}
      />

      {error ? <AuthAlert>{error}</AuthAlert> : null}

      <button
        type="submit"
        disabled={pending}
        className={authPrimaryButtonClassName}
      >
        {pending ? (
          <>
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            Updating password
          </>
        ) : (
          <>
            Save new password
            <ArrowRight className="size-4" aria-hidden="true" />
          </>
        )}
      </button>
    </form>
  );
}
