import type { Metadata } from "next";
import { DM_Sans, Fraunces } from "next/font/google";

import { cn } from "@/lib/utils";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-marketing-sans",
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-marketing-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    absolute: "StoreAgent.si — Quiet inventory intelligence",
  },
  description:
    "StoreAgent turns inventory and sales evidence into clear buying decisions. Know what to reorder, reduce, promote, or watch — with the merchant in control.",
};

export default function MarketingLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div
      className={cn(
        "marketing-surface min-h-screen bg-[var(--sa-porcelain)] text-[var(--sa-ink)] antialiased",
        dmSans.variable,
        fraunces.variable,
      )}
    >
      {children}
    </div>
  );
}
