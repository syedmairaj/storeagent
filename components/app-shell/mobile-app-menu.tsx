"use client";

import {
  useEffect,
  useState,
} from "react";

import {
  createPortal,
} from "react-dom";

import Link from "next/link";

import {
  Boxes,
  ChartNoAxesCombined,
  ClipboardCheck,
  Database,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldCheck,
  X,
} from "lucide-react";

import type {
  OrganizationMemberRole,
} from "@/lib/commerce-domain/types";

interface MobileAppMenuProps {
  organization: {
    id: string;
    name: string;
  };

  identity: {
    email: string | null;
  };

  role:
    OrganizationMemberRole;
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

export function MobileAppMenu({
  organization,
  identity,
  role,
}: MobileAppMenuProps) {
  const [
    open,
    setOpen,
  ] =
    useState(false);

  useEffect(
    () => {
      if (!open) {
        return;
      }

      const previousOverflow =
        document.body.style.overflow;

      document.body.style.overflow =
        "hidden";

      return () => {
        document.body.style.overflow =
          previousOverflow;
      };
    },
    [open],
  );

  useEffect(
    () => {
      if (!open) {
        return;
      }

      function handleKeyDown(
        event: KeyboardEvent,
      ) {
        if (
          event.key === "Escape"
        ) {
          setOpen(false);
        }
      }

      window.addEventListener(
        "keydown",
        handleKeyDown,
      );

      return () => {
        window.removeEventListener(
          "keydown",
          handleKeyDown,
        );
      };
    },
    [open],
  );

  const drawer =
    open &&
    typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[100] lg:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Application navigation"
          >
            <button
              type="button"
              aria-label="Close navigation"
              className="absolute inset-0 bg-black/40"
              onClick={() =>
                setOpen(false)
              }
            />

            <aside className="absolute inset-y-0 left-0 z-10 flex w-[min(88vw,340px)] flex-col overflow-y-auto overscroll-contain border-r border-zinc-200 bg-white shadow-2xl">
              <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-5 py-5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-zinc-950">
                    {organization.name}
                  </p>

                  <p className="mt-0.5 text-xs text-zinc-500">
                    StoreAgent workspace
                  </p>
                </div>

                <button
                  type="button"
                  aria-label="Close navigation"
                  title="Close navigation"
                  onClick={() =>
                    setOpen(false)
                  }
                  className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
                >
                  <X
                    className="size-5"
                    aria-hidden="true"
                  />
                </button>
              </div>

              <nav
                aria-label="Mobile primary"
                className="space-y-1 p-4"
              >
                <Link
                  href={`/app/${organization.id}`}
                  onClick={() =>
                    setOpen(false)
                  }
                  className="flex min-h-11 items-center gap-3 rounded-xl bg-zinc-950 px-3.5 text-sm font-medium text-white"
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

              <div className="mt-auto border-t border-zinc-200 p-4">
                <Link
                  href="/app"
                  onClick={() =>
                    setOpen(false)
                  }
                  className="mb-3 block rounded-2xl bg-zinc-50 px-4 py-3 transition hover:bg-zinc-100"
                >
                  <span className="block text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-500">
                    Switch organization
                  </span>

                  <span className="mt-1 block truncate text-sm font-semibold text-zinc-900">
                    {organization.name}
                  </span>
                </Link>

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
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        type="button"
        aria-label="Open navigation"
        title="Menu"
        aria-expanded={open}
        onClick={() =>
          setOpen(true)
        }
        className="flex size-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
      >
        <Menu
          className="size-5"
          aria-hidden="true"
        />
      </button>

      {drawer}
    </>
  );
}
