import type {
  AuthenticatedIdentity,
} from "@/lib/auth/types";

function isRecord(
  value: unknown,
): value is Readonly<
  Record<
    string,
    unknown
  >
> {
  return (
    typeof value ===
      "object" &&
    value !== null &&
    !Array.isArray(
      value,
    )
  );
}

export function identityFromVerifiedClaims(
  claims: unknown,
): AuthenticatedIdentity | null {
  if (
    !isRecord(
      claims,
    )
  ) {
    return null;
  }

  const subject =
    claims.sub;

  if (
    typeof subject !==
      "string" ||
    subject.trim()
      .length === 0
  ) {
    return null;
  }

  const email =
    typeof claims.email ===
      "string" &&
    claims.email.trim()
      .length > 0
      ? claims.email
      : null;

  return {
    userId:
      subject,

    email,
  };
}
