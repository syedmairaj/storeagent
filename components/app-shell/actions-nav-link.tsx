"use client";

import Link from "next/link";

import {
  usePathname,
} from "next/navigation";

import {
  ClipboardCheck,
} from "lucide-react";

interface ActionsNavLinkProps {
  organizationId: string;
  variant?:
    | "desktop"
    | "mobile";
  onNavigate?: () => void;
}

export function ActionsNavLink({
  organizationId,
  variant = "desktop",
  onNavigate,
}: ActionsNavLinkProps) {
  const pathname =
    usePathname();

  const href =
    `/app/${organizationId}/actions`;

  const isCurrent =
    pathname === href ||
    pathname === `${href}/`;

  const className =
    variant === "mobile"
      ? isCurrent
        ? "flex min-h-11 items-center justify-between gap-3 rounded-xl bg-zinc-950 px-3.5 text-sm font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
        : "flex min-h-11 items-center justify-between gap-3 rounded-xl px-3.5 text-sm font-medium text-zinc-700 motion-safe:transition-[background-color,color] motion-safe:duration-150 motion-reduce:transition-none hover:bg-zinc-100 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
      : isCurrent
        ? "flex min-h-11 items-center justify-between gap-3 rounded-xl bg-zinc-950 px-3.5 text-sm font-medium text-white shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2"
        : "flex min-h-11 items-center justify-between gap-3 rounded-xl px-3.5 text-sm font-medium text-zinc-600 motion-safe:transition-[background-color,color] motion-safe:duration-150 motion-reduce:transition-none hover:bg-zinc-100 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2";

  const demoBadgeClassName =
    isCurrent
      ? "rounded-md border border-white/25 bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-200"
      : "rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500";

  return (
    <Link
      href={href}
      aria-current={
        isCurrent
          ? "page"
          : undefined
      }
      aria-label="Actions demonstration"
      title="Actions — synthetic demonstration"
      onClick={onNavigate}
      className={className}
    >
      <span className="flex min-w-0 items-center gap-3">
        <ClipboardCheck
          className="size-[18px] shrink-0"
          aria-hidden="true"
        />

        Actions
      </span>

      <span
        className={demoBadgeClassName}
        aria-hidden="true"
      >
        Demo
      </span>
    </Link>
  );
}
