"use client";

import { useEffect, useState } from "react";

import { BrandMark } from "@/components/marketing/brand-mark";
import { LandingAuthButton } from "@/components/marketing/landing-auth";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "#demo", label: "Demo" },
  { href: "#decisions", label: "Decisions" },
  { href: "#impact", label: "Impact" },
  { href: "#control", label: "Control" },
] as const;

export function MarketingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b transition-[background,border-color,backdrop-filter] duration-300",
        scrolled
          ? "border-[var(--sa-frame)] bg-[color-mix(in_srgb,var(--sa-porcelain)_88%,transparent)] backdrop-blur-md"
          : "border-transparent bg-transparent",
      )}
    >
      <div className="mx-auto flex h-16 max-w-[72rem] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <BrandMark />

        <nav
          className="hidden items-center gap-7 md:flex"
          aria-label="Primary"
        >
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-[0.8125rem] font-medium tracking-wide text-[var(--sa-ink-muted)] transition-colors hover:text-[var(--sa-ink)]"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-2.5 sm:flex">
          <LandingAuthButton className="rounded-full px-3.5 py-2 text-[0.8125rem] font-semibold text-[var(--sa-ink)] transition-colors hover:bg-[var(--sa-ink-soft)]">
            Sign In
          </LandingAuthButton>
          <a
            href="#demo"
            className="inline-flex items-center rounded-full bg-[var(--sa-ink)] px-4 py-2 text-[0.8125rem] font-semibold text-[var(--sa-porcelain)] transition-[transform,background] hover:bg-[color-mix(in_srgb,var(--sa-ink)_92%,var(--sa-insight))] active:translate-y-px"
          >
            Explore demo
          </a>
        </div>

        <button
          type="button"
          className="inline-flex size-10 items-center justify-center rounded-full border border-[var(--sa-frame)] bg-[var(--sa-porcelain)] text-[var(--sa-ink)] sm:hidden"
          aria-expanded={open}
          aria-controls="marketing-mobile-nav"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="sr-only">Menu</span>
          <span className="flex w-4 flex-col gap-1" aria-hidden="true">
            <span
              className={cn(
                "h-px w-full bg-current transition-transform",
                open && "translate-y-[5px] rotate-45",
              )}
            />
            <span
              className={cn(
                "h-px w-full bg-current transition-opacity",
                open && "opacity-0",
              )}
            />
            <span
              className={cn(
                "h-px w-full bg-current transition-transform",
                open && "-translate-y-[5px] -rotate-45",
              )}
            />
          </span>
        </button>
      </div>

      <div
        id="marketing-mobile-nav"
        hidden={!open}
        className="border-t border-[var(--sa-frame)] bg-[var(--sa-porcelain)] px-4 py-4 sm:hidden"
      >
        <nav className="flex flex-col gap-1" aria-label="Mobile">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-lg px-3 py-2.5 text-sm font-medium text-[var(--sa-ink)] hover:bg-[var(--sa-ink-soft)]"
              onClick={() => setOpen(false)}
            >
              {link.label}
            </a>
          ))}
          <div className="mt-3 flex flex-col gap-2 border-t border-[var(--sa-frame)] pt-3">
            <LandingAuthButton
              className="rounded-full border border-[var(--sa-frame)] px-4 py-2.5 text-center text-sm font-semibold"
              nextPath="/app"
            >
              Sign In
            </LandingAuthButton>
            <a
              href="#demo"
              className="rounded-full bg-[var(--sa-ink)] px-4 py-2.5 text-center text-sm font-semibold text-[var(--sa-porcelain)]"
              onClick={() => setOpen(false)}
            >
              Explore demo
            </a>
          </div>
        </nav>
      </div>
    </header>
  );
}
