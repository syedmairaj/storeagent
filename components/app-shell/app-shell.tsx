import Link from "next/link";

import {
  Boxes,
  ChartNoAxesCombined,
  ChevronDown,
  ClipboardCheck,
  Database,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import {
  MobileAppMenu,
} from "@/components/app-shell/mobile-app-menu";

import type {
  OrganizationMemberRole,
} from "@/lib/commerce-domain/types";

interface AppShellProps {
  organization: {
    id: string;
    name: string;
  };

  identity: {
    email: string | null;
  };

  role:
    OrganizationMemberRole;

  children:
    React.ReactNode;
}

const FUTURE_NAVIGATION = [
  {
    label: "Actions",
    icon: ClipboardCheck,
  },
  {
    label: "Inventory",
    icon: Boxes,
  },
  {
    label: "Forecasting",
    icon: ChartNoAxesCombined,
  },
  {
    label: "Data quality",
    icon: Database,
  },
] as const;

export function AppShell({
  organization,
  identity,
  role,
  children,
}: AppShellProps) {
  return (
    <div className="min-h-screen bg-[#f7f8f7] text-zinc-950">
      <div className="mx-auto flex min-h-screen w-full max-w-[1800px]">
        <aside className="hidden w-72 shrink-0 border-r border-zinc-200/80 bg-white lg:flex lg:flex-col">
          <div className="px-7 pb-8 pt-7">
            <Link
              href="/app"
              className="inline-flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950 focus-visible:ring-offset-4"
            >
              <span className="flex size-9 items-center justify-center rounded-xl bg-zinc-950 text-white shadow-sm">
                <Sparkles
                  className="size-4"
                  aria-hidden="true"
                />
              </span>

              <span>
                <span className="block text-[15px] font-semibold tracking-[-0.02em]">
                  StoreAgent
                </span>

                <span className="block text-[11px] font-medium tracking-wide text-zinc-500">
                  INVENTORY OS
                </span>
              </span>
            </Link>
          </div>

          <div className="px-4">
            <Link
              href="/app"
              className="group flex items-center justify-between rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3.5 transition hover:border-zinc-300 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
            >
              <span className="min-w-0">
                <span className="block text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500">
                  Organization
                </span>

                <span className="mt-1 block truncate text-sm font-semibold">
                  {organization.name}
                </span>
              </span>

              <ChevronDown
                className="size-4 shrink-0 text-zinc-500"
                aria-hidden="true"
              />
            </Link>
          </div>

          <nav
            aria-label="Primary"
            className="mt-8 space-y-1 px-4"
          >
            <Link
              href={`/app/${organization.id}`}
              aria-current="page"
              className="flex min-h-11 items-center gap-3 rounded-xl bg-zinc-950 px-3.5 text-sm font-medium text-white shadow-sm"
            >
              <LayoutDashboard
                className="size-[18px]"
                aria-hidden="true"
              />

              Overview
            </Link>

            {FUTURE_NAVIGATION.map(
              ({
                label,
                icon: Icon,
              }) => (
                <div
                  key={label}
                  aria-disabled="true"
                  className="flex min-h-11 cursor-default items-center justify-between rounded-xl px-3.5 text-sm text-zinc-400"
                >
                  <span className="flex items-center gap-3">
                    <Icon
                      className="size-[18px]"
                      aria-hidden="true"
                    />

                    {label}
                  </span>

                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
                    Later
                  </span>
                </div>
              ),
            )}
          </nav>

          <div className="mt-auto border-t border-zinc-200/80 p-4">
            <div className="mb-3 rounded-2xl bg-zinc-50 px-4 py-3">
              <div className="flex items-center gap-2 text-xs font-medium text-zinc-500">
                <ShieldCheck
                  className="size-3.5"
                  aria-hidden="true"
                />

                {role}
              </div>

              <p className="mt-1 truncate text-sm font-medium text-zinc-900">
                {identity.email ??
                  "Authenticated user"}
              </p>
              </div>

            <form
              action="/auth/signout"
              method="post"
            >
              <button
                type="submit"
                title="Sign out"
                className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3.5 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
              >
                <LogOut
                  className="size-[18px]"
                  aria-hidden="true"
                />

                Sign out
              </button>
            </form>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 border-b border-zinc-200/80 bg-white/95 backdrop-blur lg:hidden">
            <div className="flex min-h-16 items-center justify-between gap-4 px-4 sm:px-6">
              <Link
                href="/app"
                className="flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-zinc-950 text-white">
                  <Sparkles
                    className="size-3.5"
                    aria-hidden="true"
                  />
                </span>

                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">
                    {organization.name}
                  </span>

                  <span className="block text-[11px] text-zinc-500">
                    Switch organization
                  </span>
                </span>
              </Link>

              <div className="flex shrink-0 items-center">
                <MobileAppMenu
                  organization={organization}
                  identity={identity}
                  role={role}
                />
                </div>
            </div>
          </header>

          <main className="px-4 pb-16 pt-7 sm:px-6 sm:py-9 xl:px-10 xl:py-10">
            <div className="mx-auto w-full max-w-[1360px]">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
