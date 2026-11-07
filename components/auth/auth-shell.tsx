import Link from "next/link";
import type { ReactNode } from "react";

import { BrandMark } from "@/components/marketing/brand-mark";
import { cn } from "@/lib/utils";

export function AuthShell({
  title,
  description,
  children,
  footer,
  panelLabel = "Secure access",
}: {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
  panelLabel?: string;
}) {
  return (
    <main className="marketing-surface relative min-h-screen overflow-hidden px-4 py-8 text-[var(--sa-ink)] sm:px-6 sm:py-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(165deg,color-mix(in_srgb,var(--sa-stone)_42%,transparent)_0%,transparent_48%),radial-gradient(ellipse_at_88%_12%,color-mix(in_srgb,var(--sa-insight)_14%,transparent),transparent_42%)]"
      />

      <div className="relative mx-auto flex w-full max-w-6xl items-center justify-center lg:min-h-[calc(100vh-5rem)]">
        <div className="grid w-full overflow-hidden rounded-[1.75rem] border border-[var(--sa-frame)] bg-[var(--sa-porcelain)] shadow-[0_28px_56px_-28px_color-mix(in_srgb,var(--sa-ink)_42%,transparent)] lg:grid-cols-[0.92fr_1.08fr]">
          <section className="flex flex-col justify-between gap-6 bg-[var(--sa-ink)] p-6 text-[var(--sa-porcelain)] sm:p-8 lg:min-h-[38rem] lg:p-12">
            <BrandMark
              href="/"
              className="text-[var(--sa-porcelain)]"
              markClassName="bg-[color-mix(in_srgb,var(--sa-porcelain)_12%,transparent)] text-[var(--sa-porcelain)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--sa-signal)_40%,transparent)]"
              wordmarkClassName="text-[var(--sa-porcelain)]"
            />

            <div className="max-w-md">
              <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-[color-mix(in_srgb,var(--sa-porcelain)_55%,transparent)]">
                {panelLabel}
              </p>
              <h1 className="mt-3 font-display text-[clamp(1.55rem,3vw,2.45rem)] font-semibold leading-[1.08] tracking-[-0.035em]">
                Inventory decisions start with trusted identity.
              </h1>
              <p className="mt-3 hidden text-[0.98rem] leading-relaxed text-[color-mix(in_srgb,var(--sa-porcelain)_68%,transparent)] sm:block">
                Authentication confirms who you are. Organization membership
                separately decides where you may work.
              </p>
            </div>

            <p className="hidden text-xs leading-5 text-[color-mix(in_srgb,var(--sa-porcelain)_48%,transparent)] lg:block">
              A valid session never grants tenant access by itself.
            </p>
          </section>

          <section className="flex items-center p-6 sm:p-8 lg:p-12">
            <div className="mx-auto w-full max-w-md">
              <h2 className="font-display text-[1.65rem] font-semibold tracking-[-0.03em] text-[var(--sa-ink)] sm:text-[1.9rem]">
                {title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[var(--sa-ink-muted)]">
                {description}
              </p>
              <div className="mt-6 sm:mt-8">{children}</div>
              {footer ? (
                <div className="mt-5 text-sm text-[var(--sa-ink-muted)] sm:mt-6">
                  {footer}
                </div>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

export function AuthField({
  id,
  label,
  children,
  hint,
}: {
  id: string;
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-2 block text-sm font-medium text-[var(--sa-ink)]"
      >
        {label}
      </label>
      {children}
      {hint ? (
        <p className="mt-1.5 text-xs text-[var(--sa-ink-muted)]">{hint}</p>
      ) : null}
    </div>
  );
}

export const authControlClassName = cn(
  "h-12 w-full rounded-xl border border-[var(--sa-frame)] bg-[var(--sa-porcelain)] px-4 text-sm text-[var(--sa-ink)] outline-none transition",
  "placeholder:text-[color-mix(in_srgb,var(--sa-ink)_35%,transparent)]",
  "focus:border-[color-mix(in_srgb,var(--sa-ink)_35%,var(--sa-frame))] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--sa-insight)_35%,transparent)]",
);

export const authPrimaryButtonClassName = cn(
  "flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--sa-ink)] px-5 text-sm font-semibold text-[var(--sa-porcelain)] transition",
  "hover:bg-[color-mix(in_srgb,var(--sa-ink)_90%,var(--sa-insight))]",
  "disabled:cursor-not-allowed disabled:opacity-60",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sa-insight)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--sa-porcelain)]",
);

export function AuthAlert({
  children,
  tone = "error",
}: {
  children: ReactNode;
  tone?: "error" | "success" | "info";
}) {
  const tones = {
    error:
      "border-[color-mix(in_srgb,#b42318_28%,var(--sa-frame))] bg-[color-mix(in_srgb,#b42318_8%,var(--sa-porcelain))] text-[#8a1c14]",
    success:
      "border-[color-mix(in_srgb,var(--sa-signal)_45%,var(--sa-frame))] bg-[color-mix(in_srgb,var(--sa-signal)_16%,var(--sa-porcelain))] text-[var(--sa-ink)]",
    info: "border-[var(--sa-frame)] bg-[color-mix(in_srgb,var(--sa-ink)_3%,var(--sa-porcelain))] text-[var(--sa-ink-muted)]",
  } as const;

  return (
    <div role="alert" className={cn("rounded-xl border px-4 py-3 text-sm", tones[tone])}>
      {children}
    </div>
  );
}

export function AuthTextLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="font-semibold text-[var(--sa-ink)] underline-offset-4 hover:underline"
    >
      {children}
    </Link>
  );
}
