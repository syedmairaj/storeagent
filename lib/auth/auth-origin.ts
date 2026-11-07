const DEFAULT_LOCAL_ORIGINS = [
  "http://127.0.0.1:3000",
  "http://localhost:3000",
  "http://127.0.0.1:3013",
  "http://127.0.0.1:3014",
  "http://localhost:3013",
  "http://localhost:3014",
] as const;

/**
 * Allowlisted browser origins for Auth emailRedirectTo / OAuth redirectTo.
 * Rejects open redirects.
 */
type EnvLike = Record<string, string | undefined>;

export function resolveAuthBrowserOrigin(
  candidate: string | null | undefined,
  env: EnvLike = process.env,
): string {
  const allowlist = new Set<string>(DEFAULT_LOCAL_ORIGINS);

  const siteUrl = env.NEXT_PUBLIC_SITE_URL?.trim();
  if (siteUrl) {
    try {
      allowlist.add(new URL(siteUrl).origin);
    } catch {
      // ignore invalid site URL
    }
  }

  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (supabaseUrl?.includes("127.0.0.1") || supabaseUrl?.includes("localhost")) {
    for (const origin of DEFAULT_LOCAL_ORIGINS) {
      allowlist.add(origin);
    }
  }

  if (!candidate) {
    // Prefer localhost:3000 for consistent local Magic Link callbacks.
    return siteUrl
      ? new URL(siteUrl).origin
      : "http://localhost:3000";
  }

  try {
    const origin = new URL(candidate).origin;
    if (allowlist.has(origin)) {
      return origin;
    }
  } catch {
    // fall through
  }

  return siteUrl
    ? new URL(siteUrl).origin
    : "http://localhost:3000";
}

export function buildAuthCallbackUrl(input: {
  origin: string;
  nextPath?: string | null;
}): string {
  const url = new URL("/auth/callback", input.origin);
  const next = (input.nextPath ?? "/app").trim() || "/app";
  url.searchParams.set("next", next.startsWith("/") ? next : "/app");
  return url.toString();
}
