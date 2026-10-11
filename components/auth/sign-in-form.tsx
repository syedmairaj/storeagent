"use client";

import {
  useState,
  type FormEvent,
} from "react";

import {
  useRouter,
  useSearchParams,
} from "next/navigation";

import {
  ArrowRight,
  LoaderCircle,
} from "lucide-react";

import {
  createSupabaseBrowserClient,
} from "@/lib/supabase/browser";

function safeNextPath(
  value:
    string | null,
): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    return "/app";
  }

  return value;
}

export function SignInForm() {
  const router =
    useRouter();

  const searchParams =
    useSearchParams();

  const [
    email,
    setEmail,
  ] =
    useState("");

  const [
    password,
    setPassword,
  ] =
    useState("");

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null,
    );

  const [
    submitting,
    setSubmitting,
  ] =
    useState(false);

  async function handleSubmit(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      submitting
    ) {
      return;
    }

    setSubmitting(true);
    setError(null);

    const supabase =
      createSupabaseBrowserClient();

    const {
      error:
        signInError,
    } =
      await supabase.auth
        .signInWithPassword({
          email:
            email.trim(),

          password,
        });

    if (
      signInError
    ) {
      setError(
        "Unable to sign in with those credentials.",
      );

      setSubmitting(false);
      return;
    }

    const nextPath =
      safeNextPath(
        searchParams.get(
          "next",
        ),
      );

    router.replace(
      nextPath,
    );

    router.refresh();
  }

  return (
    <form
      method="post"
      onSubmit={
        handleSubmit
      }
      className="mt-8 space-y-5"
    >
      <div>
        <label
          htmlFor="email"
          className="mb-2 block text-sm font-medium text-zinc-700"
        >
          Email
        </label>

        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(
            event,
          ) =>
            setEmail(
              event.target.value,
            )
          }
          className="h-12 w-full rounded-xl border border-zinc-200 bg-white px-4 text-sm text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-zinc-950 focus:ring-2 focus:ring-zinc-950/10"
          placeholder="you@example.com"
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="mb-2 block text-sm font-medium text-zinc-700"
        >
          Password
        </label>

        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(
            event,
          ) =>
            setPassword(
              event.target.value,
            )
          }
          className="h-12 w-full rounded-xl border border-zinc-200 bg-white px-4 text-sm text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-zinc-950 focus:ring-2 focus:ring-zinc-950/10"
          placeholder="Enter your password"
        />
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={
          submitting
        }
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-zinc-950 px-5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2"
      >
        {submitting ? (
          <>
            <LoaderCircle
              className="size-4 animate-spin"
              aria-hidden="true"
            />
            Signing in
          </>
        ) : (
          <>
            Sign in
            <ArrowRight
              className="size-4"
              aria-hidden="true"
            />
          </>
        )}
      </button>
    </form>
  );
}
