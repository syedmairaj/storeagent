/**
 * Hosted project pin for M5.6E.4 Stage 3 one-shot execution.
 * Fail closed unless the Supabase URL names this project ref.
 */

export const M56E4_HOSTED_PROJECT_REF =
  "qlsqminsfdntpqdkhxjx" as const;

export const M56E4_HOSTED_URL_ENV =
  "M56E4_HOSTED_SUPABASE_URL" as const;

export const M56E4_HOSTED_SERVICE_ROLE_ENV =
  "M56E4_HOSTED_SERVICE_ROLE_KEY" as const;

/**
 * Accepts https://<ref>.supabase.co or https://<ref>.supabase.co/...
 * Rejects localhost, 127.0.0.1, and any other project ref.
 */
export function assertM56E4HostedSupabaseUrl(
  url: string | null | undefined,
): string {
  if (url === null || url === undefined || url.trim().length === 0) {
    throw new Error(
      `${M56E4_HOSTED_URL_ENV} is required for Stage 3 hosted execution.`,
    );
  }

  let parsed: URL;

  try {
    parsed = new URL(url.trim());
  } catch {
    throw new Error(
      `${M56E4_HOSTED_URL_ENV} must be a valid URL.`,
    );
  }

  if (parsed.protocol !== "https:") {
    throw new Error(
      `${M56E4_HOSTED_URL_ENV} must use https.`,
    );
  }

  const host = parsed.hostname.toLowerCase();

  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".local")
  ) {
    throw new Error(
      `${M56E4_HOSTED_URL_ENV} must not point at a local Supabase instance.`,
    );
  }

  const expectedHost =
    `${M56E4_HOSTED_PROJECT_REF}.supabase.co`;

  if (host !== expectedHost) {
    throw new Error(
      `${M56E4_HOSTED_URL_ENV} must be https://${expectedHost} (got host ${host}).`,
    );
  }

  // Normalize to origin only (no query/fragment leakage in logs).
  return `https://${expectedHost}`;
}

export function assertM56E4HostedServiceRoleKey(
  key: string | null | undefined,
): string {
  if (key === null || key === undefined || key.trim().length === 0) {
    throw new Error(
      `${M56E4_HOSTED_SERVICE_ROLE_ENV} is required for Stage 3 hosted execution.`,
    );
  }

  const trimmed = key.trim();

  if (trimmed.length < 20) {
    throw new Error(
      `${M56E4_HOSTED_SERVICE_ROLE_ENV} looks invalid (too short).`,
    );
  }

  return trimmed;
}

/** Never log the key; only length for diagnostics. */
export function redactSecretMeta(
  key: string,
): { present: true; length: number } {
  return {
    present: true,
    length: key.length,
  };
}
