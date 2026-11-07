"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { AuthEntry } from "@/components/auth/auth-entry";
import { BrandMark } from "@/components/marketing/brand-mark";
import { cn } from "@/lib/utils";

type AuthModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nextPath?: string;
  allowCreate: boolean;
  googleEnabled: boolean;
};

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function AuthModal({
  open,
  onOpenChange,
  nextPath = "/app",
  allowCreate,
  googleEnabled,
}: AuthModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusTimer = window.setTimeout(() => {
      const firstField = panelRef.current?.querySelector<HTMLElement>(
        'input[type="email"]',
      );
      (firstField ?? closeRef.current)?.focus();
    }, 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }

      if (event.key !== "Tab" || !panelRef.current) return;

      const nodes = [
        ...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      ].filter(
        (node) =>
          !node.hasAttribute("disabled") &&
          node.getAttribute("aria-disabled") !== "true" &&
          node.tabIndex !== -1,
      );

      if (nodes.length === 0) return;

      const first = nodes[0]!;
      const last = nodes[nodes.length - 1]!;
      const active = document.activeElement;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      const restoreTarget = previouslyFocused.current;
      // Defer until after portal unmount so focus is not stolen by body.
      window.setTimeout(() => {
        restoreTarget?.focus?.({ preventScroll: true });
      }, 0);
    };
  }, [open, close]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="marketing-surface fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-6"
      data-auth-modal-root=""
    >
      {/* Dim + blur landing backdrop only — not the dialog surface */}
      <button
        type="button"
        aria-label="Dismiss sign-in"
        className={cn(
          "absolute inset-0 bg-[color-mix(in_srgb,#10161c_58%,transparent)]",
          "motion-safe:backdrop-blur-[2px] motion-reduce:backdrop-blur-none",
          "motion-safe:transition-opacity motion-safe:duration-200",
          "motion-reduce:transition-none",
        )}
        onClick={close}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        data-auth-modal-panel=""
        className={cn(
          "relative z-[81] flex w-full flex-col isolate",
          // Compact merchant card: ~420–460px on desktop
          "max-w-[460px] sm:w-[min(100%,440px)]",
          // Fit ordinary desktop viewports without an inner scrollbar
          "max-h-[min(100dvh,100%)] sm:max-h-[min(90dvh,36rem)]",
          "rounded-t-[1.15rem] sm:rounded-[1.15rem]",
          // Fully opaque surface — never translucent over the landing page
          "border border-[var(--sa-frame)] bg-[var(--sa-porcelain)]",
          "shadow-[0_28px_56px_-24px_rgba(16,22,28,0.55)]",
          "motion-safe:transition-transform motion-safe:duration-200",
          "motion-reduce:transition-none",
        )}
      >
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col",
            // Short mobile viewports may scroll; keep actions reachable
            "overflow-y-auto overscroll-contain",
            "px-5 pb-[max(1.15rem,env(safe-area-inset-bottom))] pt-5 sm:px-6 sm:pb-6 sm:pt-6",
          )}
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <BrandMark href={null} />
            <button
              ref={closeRef}
              type="button"
              onClick={close}
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-[var(--sa-frame)] bg-white text-[var(--sa-ink-muted)] transition hover:text-[var(--sa-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sa-insight)]"
              aria-label="Close"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>

          <h2
            id={titleId}
            className="font-display text-[1.4rem] font-semibold tracking-[-0.03em] text-[var(--sa-ink)] sm:text-[1.5rem]"
          >
            Welcome to StoreAgent
          </h2>
          <p
            id={descriptionId}
            className="mt-1.5 text-sm leading-snug text-[var(--sa-ink-muted)]"
          >
            Sign in or create your account in seconds.
          </p>

          <div className="mt-5">
            <AuthEntry
              nextPath={nextPath}
              passwordHref="/login?mode=password"
              allowCreate={allowCreate}
              googleEnabled={googleEnabled}
            />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function AuthModalTrigger({
  children,
  className,
  onOpen,
}: {
  children: ReactNode;
  className?: string;
  onOpen: () => void;
}) {
  return (
    <button type="button" className={className} onClick={onOpen}>
      {children}
    </button>
  );
}
