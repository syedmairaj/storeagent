"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Boxes } from "lucide-react";

interface InventoryNavLinkProps {
  organizationId: string;
  variant?: "desktop" | "mobile";
  onNavigate?: () => void;
}

export function InventoryNavLink({
  organizationId,
  variant = "desktop",
  onNavigate,
}: InventoryNavLinkProps) {
  const pathname = usePathname();
  const href = `/app/${organizationId}/inventory`;
  const isCurrent =
    pathname === href ||
    pathname.startsWith(`${href}/`);

  const className =
    variant === "mobile"
      ? isCurrent
        ? "flex min-h-11 items-center gap-3 rounded-xl bg-zinc-950 px-3.5 text-sm font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
        : "flex min-h-11 items-center gap-3 rounded-xl px-3.5 text-sm font-medium text-zinc-700 motion-safe:transition-[background-color,color] motion-safe:duration-150 motion-reduce:transition-none hover:bg-zinc-100 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
      : isCurrent
        ? "flex min-h-11 items-center gap-3 rounded-xl bg-zinc-950 px-3.5 text-sm font-medium text-white shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2"
        : "flex min-h-11 items-center gap-3 rounded-xl px-3.5 text-sm font-medium text-zinc-600 motion-safe:transition-[background-color,color] motion-safe:duration-150 motion-reduce:transition-none hover:bg-zinc-100 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-2";

  return (
    <Link
      href={href}
      aria-current={isCurrent ? "page" : undefined}
      onClick={onNavigate}
      className={className}
    >
      <Boxes className="size-[18px]" aria-hidden="true" />
      Inventory
    </Link>
  );
}
