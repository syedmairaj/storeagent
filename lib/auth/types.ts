export interface AuthenticatedIdentity {
  readonly userId:
    string;

  readonly email:
    string | null;
}

export type AuthenticationResolution =
  | {
      readonly status:
        "authenticated";

      readonly identity:
        AuthenticatedIdentity;
    }
  | {
      readonly status:
        "unauthenticated";
    };
