import "server-only";

import {
  redirect,
} from "next/navigation";

import type {
  AuthenticatedIdentity,
} from "@/lib/auth/types";

import {
  resolveAuthentication,
} from "@/lib/auth/session";

export async function requireAppIdentity():
Promise<AuthenticatedIdentity> {
  const authentication =
    await resolveAuthentication();

  if (
    authentication.status !==
      "authenticated"
  ) {
    redirect(
      "/login?next=/app",
    );
  }

  return authentication.identity;
}
