/**
 * Hosted public signup remains closed unless explicitly opted in.
 *
 * Local (no VERCEL_ENV) defaults to allowed so Magic Link / password
 * signup can be exercised against local Supabase.
 * Hosted preview/production require STOREAGENT_PUBLIC_SIGNUP=1.
 */
type EnvLike = Record<string, string | undefined>;

export function isPublicSignupAllowed(
  env: EnvLike = process.env,
): boolean {
  if (env.STOREAGENT_PUBLIC_SIGNUP === "1") {
    return true;
  }

  // Hosted Vercel runtimes keep the gate closed by default.
  if (env.VERCEL_ENV === "production" || env.VERCEL_ENV === "preview") {
    return false;
  }

  return true;
}

export function isGoogleAuthConfigured(
  env: EnvLike = process.env,
): boolean {
  return env.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED === "1";
}
