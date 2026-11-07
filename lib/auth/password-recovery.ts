import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

import { readPublicEnvironment } from "@/lib/config/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const RECOVERY_COOKIE_NAME = "sa_pw_recovery";
export const RECOVERY_TTL_SECONDS = 15 * 60;

type ChallengeRow = {
  id: string;
  user_id: string;
  secret_hash: string;
  expires_at: string;
  consumed_at: string | null;
};

function hashSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function parseCookieValue(
  raw: string | undefined,
): { challengeId: string; secret: string } | null {
  if (!raw) return null;
  const separator = raw.indexOf(".");
  if (separator <= 0 || separator === raw.length - 1) return null;
  const challengeId = raw.slice(0, separator);
  const secret = raw.slice(separator + 1);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      challengeId,
    )
  ) {
    return null;
  }
  if (!/^[0-9a-f]{64}$/i.test(secret)) {
    return null;
  }
  return { challengeId, secret };
}

function shouldUseSecureCookies(request?: NextRequest): boolean {
  if (request) {
    return (
      request.nextUrl.protocol === "https:" ||
      request.headers.get("x-forwarded-proto") === "https"
    );
  }

  // Server actions / RSC: opt in for HTTPS deployments only.
  // Default false so local `next start` over http://127.0.0.1 keeps cookies.
  return process.env.AUTH_COOKIE_SECURE === "1";
}

function recoveryCookieOptions(maxAge: number, request?: NextRequest) {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    secure: shouldUseSecureCookies(request),
    path: "/",
    maxAge,
  };
}

export async function clearRecoveryCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(RECOVERY_COOKIE_NAME, "", recoveryCookieOptions(0));
}

/**
 * Verifies recovery token_hash and returns a redirect response that carries
 * both the Auth session cookies and the one-time recovery challenge cookie.
 */
export async function establishRecoveryChallengeResponse(input: {
  request: NextRequest;
  tokenHash: string;
  type: string | null;
}): Promise<
  | { ok: true; response: NextResponse }
  | { ok: false; reason: "invalid" | "wrong_purpose" | "exchange_failed" }
> {
  if (input.type !== "recovery") {
    return { ok: false, reason: "wrong_purpose" };
  }

  const tokenHash = input.tokenHash.trim();
  if (!tokenHash || tokenHash.length > 512) {
    return { ok: false, reason: "invalid" };
  }

  // Relative Location keeps the client on the same host it used
  // (127.0.0.1 vs localhost). Absolute nextUrl can rewrite the host.
  const response = new NextResponse(null, {
    status: 303,
    headers: {
      Location: "/reset-password",
    },
  });

  const env = readPublicEnvironment();
  const supabase = createServerClient(
    env.supabaseUrl,
    env.supabasePublishableKey,
    {
      cookies: {
        getAll() {
          return input.request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const { data, error } = await supabase.auth.verifyOtp({
    type: "recovery",
    token_hash: tokenHash,
  });

  if (error || !data.user?.id || !data.session) {
    return { ok: false, reason: "exchange_failed" };
  }

  const userId = data.user.id;
  const secret = randomBytes(32).toString("hex");
  const secretHash = hashSecret(secret);
  const expiresAt = new Date(
    Date.now() + RECOVERY_TTL_SECONDS * 1000,
  ).toISOString();

  const admin = createSupabaseAdminClient();
  const { data: inserted, error: insertError } = await admin
    .from("password_recovery_challenges")
    .insert({
      user_id: userId,
      secret_hash: secretHash,
      expires_at: expiresAt,
    })
    .select("id")
    .single();

  if (insertError || !inserted?.id) {
    return { ok: false, reason: "exchange_failed" };
  }

  response.cookies.set(
    RECOVERY_COOKIE_NAME,
    `${inserted.id}.${secret}`,
    recoveryCookieOptions(RECOVERY_TTL_SECONDS, input.request),
  );

  return { ok: true, response };
}

export type RecoveryAuthorization =
  | {
      ok: true;
      challengeId: string;
      userId: string;
      email: string | null;
    }
  | { ok: false; reason: "missing" | "invalid" | "expired" | "mismatch" };

/**
 * Server-side authorization for the recovery-only password update surface.
 * Ordinary sessions without a valid unconsumed challenge are rejected.
 */
export async function authorizePasswordRecovery(): Promise<RecoveryAuthorization> {
  const jar = await cookies();
  const parsed = parseCookieValue(jar.get(RECOVERY_COOKIE_NAME)?.value);
  if (!parsed) {
    return { ok: false, reason: "missing" };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { ok: false, reason: "missing" };
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("password_recovery_challenges")
    .select("id,user_id,secret_hash,expires_at,consumed_at")
    .eq("id", parsed.challengeId)
    .maybeSingle();

  if (error || !data) {
    return { ok: false, reason: "invalid" };
  }

  const row = data as ChallengeRow;

  if (row.consumed_at) {
    return { ok: false, reason: "invalid" };
  }

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    return { ok: false, reason: "expired" };
  }

  if (row.user_id !== user.id) {
    return { ok: false, reason: "mismatch" };
  }

  if (!safeEqualHex(row.secret_hash, hashSecret(parsed.secret))) {
    return { ok: false, reason: "invalid" };
  }

  return {
    ok: true,
    challengeId: row.id,
    userId: user.id,
    email: user.email ?? null,
  };
}

/**
 * Atomically consumes the recovery challenge, then updates the password.
 */
export async function completePasswordRecovery(input: {
  password: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (input.password.length < 8) {
    return { ok: false, error: "Use a password with at least 8 characters." };
  }

  const authz = await authorizePasswordRecovery();
  if (!authz.ok) {
    return {
      ok: false,
      error: "Open a fresh password reset link to continue.",
    };
  }

  const admin = createSupabaseAdminClient();
  const consumedAt = new Date().toISOString();
  const { data: consumed, error: consumeError } = await admin
    .from("password_recovery_challenges")
    .update({ consumed_at: consumedAt })
    .eq("id", authz.challengeId)
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .eq("user_id", authz.userId)
    .select("id")
    .maybeSingle();

  if (consumeError || !consumed) {
    await clearRecoveryCookie();
    return {
      ok: false,
      error: "This reset link is no longer valid. Request a new password reset email to continue.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error: updateError } = await supabase.auth.updateUser({
    password: input.password,
  });

  if (updateError) {
    // Challenge was already consumed; this one-time context cannot be reused.
    await clearRecoveryCookie();
    return {
      ok: false,
      error:
        "Unable to update your password right now. Request a new password reset email and try again.",
    };
  }

  await clearRecoveryCookie();
  await supabase.auth.signOut();
  return { ok: true };
}
