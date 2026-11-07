import { DM_Sans, Fraunces } from "next/font/google";

import { requireAppIdentity } from "@/lib/auth/app-route";
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

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await requireAppIdentity();

  return (
    <div className={cn(dmSans.variable, fraunces.variable)}>{children}</div>
  );
}
