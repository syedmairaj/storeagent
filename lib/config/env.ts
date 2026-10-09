import {
  z,
} from "zod";

type EnvironmentSource =
  Readonly<
    Record<
      string,
      string | undefined
    >
  >;

const publicEnvSchema =
  z.object({
    NEXT_PUBLIC_SUPABASE_URL:
      z
        .string()
        .url(),

    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      z
        .string()
        .min(1),
  });

const serverEnvSchema =
  publicEnvSchema.extend({
    SUPABASE_SERVICE_ROLE_KEY:
      z
        .string()
        .min(1),
  });

export interface PublicEnvironment {
  readonly supabaseUrl:
    string;

  readonly supabasePublishableKey:
    string;
}

export interface ServerEnvironment
  extends PublicEnvironment {
  readonly supabaseServiceRoleKey:
    string;
}

export function readPublicEnvironment(
  source: EnvironmentSource =
    process.env,
): PublicEnvironment {
  const parsed =
    publicEnvSchema.parse(
      source,
    );

  return {
    supabaseUrl:
      parsed
        .NEXT_PUBLIC_SUPABASE_URL,

    supabasePublishableKey:
      parsed
        .NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}

export function readServerEnvironment(
  source: EnvironmentSource =
    process.env,
): ServerEnvironment {
  const parsed =
    serverEnvSchema.parse(
      source,
    );

  return {
    supabaseUrl:
      parsed
        .NEXT_PUBLIC_SUPABASE_URL,

    supabasePublishableKey:
      parsed
        .NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,

    supabaseServiceRoleKey:
      parsed
        .SUPABASE_SERVICE_ROLE_KEY,
  };
}
