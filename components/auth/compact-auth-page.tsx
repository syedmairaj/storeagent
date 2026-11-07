import type { ReactNode } from "react";

import { BrandMark } from "@/components/marketing/brand-mark";

/**
 * Compact passwordless entry surface for /login and /signup.
 * Avoids the oversized split-panel fallback for the primary path.
 */
export function CompactAuthPage({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="marketing-surface flex min-h-screen items-center justify-center bg-[var(--sa-porcelain)] px-4 py-8 text-[var(--sa-ink)] sm:px-6">
      <div className="w-full max-w-[440px] rounded-[1.15rem] border border-[var(--sa-frame)] bg-[var(--sa-porcelain)] p-5 shadow-[0_24px_48px_-28px_rgba(16,22,28,0.35)] sm:p-6">
        <BrandMark href="/" />
        <h1 className="mt-5 font-display text-[1.4rem] font-semibold tracking-[-0.03em] sm:text-[1.5rem]">
          {title}
        </h1>
        <p className="mt-1.5 text-sm leading-snug text-[var(--sa-ink-muted)]">
          {description}
        </p>
        <div className="mt-5">{children}</div>
        {footer ? (
          <div className="mt-4 text-center text-xs text-[var(--sa-ink-muted)]">
            {footer}
          </div>
        ) : null}
      </div>
    </main>
  );
}
