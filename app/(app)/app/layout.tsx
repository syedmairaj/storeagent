import {
  requireAppIdentity,
} from "@/lib/auth/app-route";

export default async function AppLayout({
  children,
}: Readonly<{
  children:
    React.ReactNode;
}>) {
  await requireAppIdentity();

  return children;
}
