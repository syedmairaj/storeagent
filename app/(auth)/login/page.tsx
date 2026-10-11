import type {
  Metadata,
} from "next";

import {
  Suspense,
} from "react";

import {
  LockKeyhole,
  Sparkles,
} from "lucide-react";

import {
  SignInForm,
} from "@/components/auth/sign-in-form";

export const metadata:
Metadata = {
  title:
    "Sign in",
};

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-[#f7f8f7] px-4 py-8 text-zinc-950 sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-6xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-[2rem] border border-zinc-200 bg-white shadow-xl shadow-zinc-950/[0.04] lg:grid-cols-[0.9fr_1.1fr]">
          <section className="flex flex-col justify-between bg-zinc-950 p-8 text-white sm:p-10 lg:min-h-[680px] lg:p-12">
            <div className="inline-flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-white text-zinc-950">
                <Sparkles
                  className="size-4"
                  aria-hidden="true"
                />
              </span>

              <div>
                <p className="font-semibold tracking-[-0.02em]">
                  StoreAgent
                </p>

                <p className="text-xs text-zinc-400">
                  Inventory operating system
                </p>
              </div>
            </div>

            <div className="max-w-md py-16 lg:py-0">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">
                Secure workspace
              </p>

              <h1 className="mt-5 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
                Inventory decisions start with trusted context.
              </h1>

              <p className="mt-5 text-base leading-7 text-zinc-400">
                Sign in first. StoreAgent then separately verifies which organization you are allowed to enter.
              </p>
            </div>

            <p className="text-xs leading-5 text-zinc-500">
              Authentication does not grant organization access.
            </p>
          </section>

          <section className="flex items-center p-7 sm:p-10 lg:p-14">
            <div className="mx-auto w-full max-w-md">
              <div className="flex size-11 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700">
                <LockKeyhole
                  className="size-5"
                  aria-hidden="true"
                />
              </div>

              <h2 className="mt-7 text-3xl font-semibold tracking-[-0.035em]">
                Sign in to StoreAgent
              </h2>

              <p className="mt-3 text-sm leading-6 text-zinc-600">
                Use your StoreAgent account to continue to your organization workspace.
              </p>

              <Suspense
                fallback={
                  <div className="mt-8 h-64 animate-pulse rounded-2xl bg-zinc-100" />
                }
              >
                <SignInForm />
              </Suspense>

              <p className="mt-6 text-xs leading-5 text-zinc-400">
                M1.6 verification sign-in. Additional authentication methods are intentionally deferred.
              </p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
