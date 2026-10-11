"use client";

import {
  AlertTriangle,
  RotateCcw,
} from "lucide-react";

interface AppErrorPageProps {
  error:
    Error & {
      digest?:
        string;
    };

  reset:
    () => void;
}

export default function AppErrorPage({
  error,
  reset,
}: AppErrorPageProps) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f8f7] px-4 py-12 sm:px-6">
      <section className="w-full max-w-xl rounded-3xl border border-zinc-200 bg-white p-7 shadow-sm sm:p-10">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700">
          <AlertTriangle
            className="size-5"
            aria-hidden="true"
          />
        </div>

        <p className="mt-7 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
          StoreAgent
        </p>

        <h1 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-zinc-950 sm:text-3xl">
          We couldn&apos;t load this workspace.
        </h1>

        <p className="mt-4 text-sm leading-6 text-zinc-600">
          Your data has not been changed. Try the request again. If the problem continues, contact support.
        </p>

        {error.digest && (
          <p className="mt-5 break-all font-mono text-[11px] text-zinc-400">
            Reference: {error.digest}
          </p>
        )}

        <button
          type="button"
          onClick={reset}
          className="mt-8 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-zinc-950 px-5 text-sm font-semibold text-white transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2"
        >
          <RotateCcw
            className="size-4"
            aria-hidden="true"
          />

          Try again
        </button>
      </section>
    </main>
  );
}
