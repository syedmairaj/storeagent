import "server-only";

import {
  identityFromVerifiedClaims,
} from "@/lib/auth/claims";

import type {
  AuthenticatedIdentity,
  AuthenticationResolution,
} from "@/lib/auth/types";

import {
  createSupabaseServerClient,
} from "@/lib/supabase/server";

export class AuthenticationRequiredError
  extends Error {
  constructor() {
    super(
      "Authentication required.",
    );

    this.name =
      "AuthenticationRequiredError";
  }
}

export async function resolveAuthentication():
Promise<AuthenticationResolution> {
  const supabase =
    await createSupabaseServerClient();

  const {
    data,
    error,
  } =
    await supabase
      .auth
      .getClaims();

  if (
    error
  ) {
    return {
      status:
        "unauthenticated",
    };
  }

  const identity =
    identityFromVerifiedClaims(
      data?.claims,
    );

  if (
    identity === null
  ) {
    return {
      status:
        "unauthenticated",
    };
  }

  return {
    status:
      "authenticated",

    identity,
  };
}

export async function requireAuthenticatedIdentity():
Promise<AuthenticatedIdentity> {
  const resolution =
    await resolveAuthentication();

  if (
    resolution.status !==
      "authenticated"
  ) {
    throw new AuthenticationRequiredError();
  }

  return resolution.identity;
}
