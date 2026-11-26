import { loadLocalEnvFiles } from "./env";

const LOCAL_HOSTS = new Set([
  "127.0.0.1",
  "localhost",
]);

export type LocalStackEndpoints = {
  supabaseUrl: string;
  mailpitUrl: string;
  appBaseUrl: string;
};

function assertLocalHttpUrl(
  label: string,
  raw: string,
  allowedPorts?: number[],
): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(
      `E2E safety BLOCKED: ${label} is not a valid URL.`,
    );
  }

  if (
    url.protocol !== "http:" &&
    url.protocol !== "https:"
  ) {
    throw new Error(
      `E2E safety BLOCKED: ${label} must be http(s).`,
    );
  }

  if (
    !LOCAL_HOSTS.has(url.hostname)
  ) {
    throw new Error(
      `E2E safety BLOCKED: ${label} must target localhost/127.0.0.1 (hosted Supabase refused).`,
    );
  }

  if (
    allowedPorts &&
    allowedPorts.length > 0
  ) {
    const port = url.port
      ? Number(url.port)
      : url.protocol === "https:"
        ? 443
        : 80;
    if (
      !allowedPorts.includes(port)
    ) {
      throw new Error(
        `E2E safety BLOCKED: ${label} port ${port} is not an allowed local endpoint.`,
      );
    }
  }

  return url;
}

/**
 * Fail closed unless the acceptance stack is local-only.
 * Never accepts hosted Supabase project URLs.
 */
export function assertLocalAcceptanceStack(): LocalStackEndpoints {
  loadLocalEnvFiles();

  const supabaseUrl = assertLocalHttpUrl(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
      "http://127.0.0.1:55321",
    [55321],
  ).toString().replace(/\/$/, "");

  const mailpitUrl = assertLocalHttpUrl(
    "PLAYWRIGHT_MAILPIT_URL",
    process.env.PLAYWRIGHT_MAILPIT_URL?.trim() ||
      "http://127.0.0.1:55324",
    [55324],
  ).toString().replace(/\/$/, "");

  const appBaseUrl = assertLocalHttpUrl(
    "PLAYWRIGHT_BASE_URL",
    process.env.PLAYWRIGHT_BASE_URL?.trim() ||
      "http://localhost:3000",
    [3000, 3013, 3014],
  ).toString().replace(/\/$/, "");

  return {
    supabaseUrl,
    mailpitUrl,
    appBaseUrl,
  };
}

export function redactAuthUrl(
  value: string,
): string {
  return value
    .replace(
      /([?&](?:token|code|access_token|refresh_token|type)=)[^&]+/gi,
      "$1REDACTED",
    )
    .replace(
      /Bearer\s+[A-Za-z0-9._-]+/gi,
      "Bearer REDACTED",
    );
}
