import { cn } from "@/lib/utils";

type BrandMarkProps = {
  className?: string;
  markClassName?: string;
  wordmarkClassName?: string;
  /** Pass `null` for a non-linking mark (e.g. final CTA). Defaults to home. */
  href?: string | null;
};

/**
 * Bespoke StoreAgent.si wordmark: quiet ink letterforms + a calibrated `.si` signal mark.
 * `.si` = Super Intelligent — not a sparkle / generic AI glyph.
 */
export function BrandMark({
  className,
  markClassName,
  wordmarkClassName,
  href = "/",
}: BrandMarkProps) {
  const content = (
    <>
      <span
        className={cn(
          "relative flex size-8 shrink-0 items-center justify-center rounded-[0.65rem] bg-[var(--sa-ink)] text-[var(--sa-porcelain)] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--sa-signal)_35%,transparent)]",
          markClassName,
        )}
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 32 32"
          className="size-[1.15rem]"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M9.2 20.4c0-3.2 2.1-4.6 5.4-5.4 2.2-.5 3.3-1.1 3.3-2.4 0-1.3-1.1-2.1-2.8-2.1-1.9 0-3.1.9-3.4 2.4"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
          <path
            d="M22.8 11.6c0 3.2-2.1 4.6-5.4 5.4-2.2.5-3.3 1.1-3.3 2.4 0 1.3 1.1 2.1 2.8 2.1 1.9 0 3.1-.9 3.4-2.4"
            stroke="var(--sa-signal)"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
          <circle cx="16" cy="16" r="1.35" fill="var(--sa-insight)" />
        </svg>
      </span>
      <span
        className={cn(
          "font-display text-[1.05rem] font-semibold tracking-[-0.03em] text-[var(--sa-ink)]",
          wordmarkClassName,
        )}
      >
        StoreAgent
        <span className="text-[var(--sa-insight)]">.si</span>
      </span>
    </>
  );

  if (typeof href === "string") {
    return (
      <a
        href={href}
        className={cn(
          "inline-flex items-center gap-2.5 no-underline",
          className,
        )}
        aria-label="StoreAgent.si home"
      >
        {content}
      </a>
    );
  }

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      {content}
    </span>
  );
}
