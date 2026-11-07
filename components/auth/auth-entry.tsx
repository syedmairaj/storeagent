"use client";

import {
  type FormEvent,
  useEffect,
  useId,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { LoaderCircle } from "lucide-react";

import {
  AuthAlert,
  authControlClassName,
  authPrimaryButtonClassName,
} from "@/components/auth/auth-shell";
import {
  MAGIC_LINK_RESEND_COOLDOWN_MS,
  sendMagicLink,
  startGoogleSignIn,
} from "@/lib/auth/passwordless-client";
import { cn } from "@/lib/utils";

function GoogleMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        d="M12 10.2v3.6h5.1c-.2 1.2-.9 2.3-1.9 3l3.1 2.4c1.8-1.7 2.9-4.1 2.9-7 0-.7-.1-1.3-.2-1.9H12z"
        opacity="0.9"
      />
      <path
        fill="currentColor"
        d="M6.6 14.3 5.8 14.9l-2.5 1.9C4.9 20 8.2 22 12 22c2.7 0 5-.9 6.7-2.4l-3.1-2.4c-.9.6-2 1-3.6 1-2.8 0-5.1-1.9-5.9-4.4z"
        opacity="0.75"
      />
      <path
        fill="currentColor"
        d="M3.3 7.2C2.5 8.8 2 10.3 2 12s.5 3.2 1.3 4.8l3.3-2.5C6.3 13.4 6 12.7 6 12s.3-1.4.6-2L3.3 7.2z"
        opacity="0.6"
      />
      <path
        fill="currentColor"
        d="M12 5.9c1.5 0 2.8.5 3.9 1.5l2.9-2.9C16.9 2.7 14.7 2 12 2 8.2 2 4.9 4 3.3 7.2L6.6 9.7C7.4 7.2 9.7 5.9 12 5.9z"
        opacity="0.45"
      />
    </svg>
  );
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AuthEntry({
  nextPath = "/app",
  passwordHref = "/login?mode=password",
  allowCreate,
  googleEnabled,
  onMagicLinkSent,
}: {
  nextPath?: string;
  passwordHref?: string;
  allowCreate: boolean;
  googleEnabled: boolean;
  onMagicLinkSent?: (email: string) => void;
}) {
  const emailId = useId();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [cooldownUntil]);

  const cooldownSeconds = Math.max(
    0,
    Math.ceil((cooldownUntil - now) / 1000),
  );

  function runGoogle() {
    // Hard gate: never start OAuth when the provider is not configured.
    if (!googleEnabled || pending) return;
    setError(null);
    startTransition(async () => {
      const result = await startGoogleSignIn({
        nextPath,
        googleEnabled,
      });
      if (!result.ok) {
        setError(result.error);
      }
    });
  }

  function runMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || cooldownSeconds > 0) return;

    const normalized = email.trim().toLowerCase();
    if (!emailPattern.test(normalized)) {
      setError("Enter a valid work email.");
      return;
    }

    setError(null);

    startTransition(async () => {
      const result = await sendMagicLink({
        email: normalized,
        nextPath,
        allowCreate,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setSentTo(normalized);
      setCooldownUntil(Date.now() + MAGIC_LINK_RESEND_COOLDOWN_MS);
      onMagicLinkSent?.(normalized);
    });
  }

  return (
    <div className="space-y-3.5">
      {googleEnabled ? (
        <button
          type="button"
          onClick={runGoogle}
          disabled={pending}
          className={cn(
            "inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-full border px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sa-insight)]",
            "border-[var(--sa-frame)] bg-white text-[var(--sa-ink)] hover:bg-[var(--sa-ink-soft)]",
            "disabled:cursor-not-allowed disabled:opacity-60",
          )}
        >
          {pending ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <GoogleMark className="size-4" />
          )}
          Continue with Google
        </button>
      ) : (
        <div className="space-y-1.5">
          <button
            type="button"
            disabled
            aria-disabled="true"
            tabIndex={-1}
            className={cn(
              "pointer-events-none inline-flex h-11 w-full cursor-not-allowed items-center justify-center gap-2.5 rounded-full border px-4 text-sm font-semibold",
              "border-[var(--sa-frame)] bg-[color-mix(in_srgb,var(--sa-ink)_3%,white)] text-[var(--sa-ink-muted)] opacity-65",
            )}
          >
            <GoogleMark className="size-4 opacity-70" />
            Continue with Google
          </button>
          <p className="text-center text-[0.72rem] leading-snug text-[var(--sa-ink-muted)]">
            Google sign-in is not available yet
          </p>
        </div>
      )}

      <div className="flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-[var(--sa-frame)]" />
        <span className="text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-[var(--sa-ink-muted)]">
          or
        </span>
        <span className="h-px flex-1 bg-[var(--sa-frame)]" />
      </div>

      <form
        method="post"
        noValidate
        onSubmit={runMagicLink}
        className="space-y-3"
      >
        <div className="space-y-1.5">
          <label
            htmlFor={emailId}
            className="block text-sm font-medium text-[var(--sa-ink)]"
          >
            Work email
          </label>
          <input
            id={emailId}
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            value={email}
            disabled={pending}
            onChange={(event) => {
              setEmail(event.target.value);
              if (error) setError(null);
            }}
            className={cn(authControlClassName, "h-11 bg-white")}
            placeholder="you@company.com"
          />
        </div>

        <button
          type="submit"
          disabled={pending || cooldownSeconds > 0}
          className={cn(authPrimaryButtonClassName, "h-11")}
        >
          {pending ? (
            <>
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              Sending link
            </>
          ) : cooldownSeconds > 0 ? (
            <>Resend in {cooldownSeconds}s</>
          ) : (
            <>Send magic link</>
          )}
        </button>
      </form>

      {sentTo ? (
        <AuthAlert tone="success">
          Check your email for a secure sign-in link.
        </AuthAlert>
      ) : (
        <p className="text-center text-[0.78rem] leading-snug text-[var(--sa-ink-muted)]">
          We&apos;ll email you a secure sign-in link.
        </p>
      )}

      {error ? <AuthAlert>{error}</AuthAlert> : null}

      <p className="pt-0.5 text-center text-[0.75rem] text-[var(--sa-ink-muted)]">
        <Link
          href={passwordHref}
          className="underline-offset-4 hover:text-[var(--sa-ink)] hover:underline"
        >
          Use password instead
        </Link>
      </p>
    </div>
  );
}
