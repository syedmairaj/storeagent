"use client";

import {
  buildAuthCallbackUrl,
  resolveAuthBrowserOrigin,
} from "@/lib/auth/auth-origin";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export const MAGIC_LINK_RESEND_COOLDOWN_MS = 60_000;

export type PasswordlessResult =
  | { ok: true; kind: "magic_link_sent" }
  | { ok: true; kind: "oauth_redirect" }
  | { ok: false; error: string };

export async function startGoogleSignIn(input: {
  nextPath?: string | null;
  googleEnabled: boolean;
}): Promise<PasswordlessResult> {
  if (!input.googleEnabled) {
    return {
      ok: false,
      error:
        "Google sign-in is not configured for this environment yet.",
    };
  }

  const origin = resolveAuthBrowserOrigin(
    typeof window !== "undefined" ? window.location.origin : null,
  );
  const redirectTo = buildAuthCallbackUrl({
    origin,
    nextPath: input.nextPath ?? "/app",
  });

  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      queryParams: {
        access_type: "offline",
        prompt: "select_account",
      },
    },
  });

  if (error) {
    return {
      ok: false,
      error:
        "Unable to start Google sign-in. Try email, or use password sign-in.",
    };
  }

  return { ok: true, kind: "oauth_redirect" };
}

export async function sendMagicLink(input: {
  email: string;
  nextPath?: string | null;
  allowCreate: boolean;
}): Promise<PasswordlessResult> {
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { ok: false, error: "Enter a valid email address." };
  }

  const origin = resolveAuthBrowserOrigin(
    typeof window !== "undefined" ? window.location.origin : null,
  );
  const emailRedirectTo = buildAuthCallbackUrl({
    origin,
    nextPath: input.nextPath ?? "/app",
  });

  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo,
      shouldCreateUser: input.allowCreate,
    },
  });

  if (error) {
    // Non-enumerating feedback when public signup is closed.
    if (
      !input.allowCreate &&
      (error.message.toLowerCase().includes("signups not allowed") ||
        error.message.toLowerCase().includes("user not found") ||
        error.status === 422)
    ) {
      return { ok: true, kind: "magic_link_sent" };
    }

    if (error.status === 429) {
      return {
        ok: false,
        error: "Please wait a moment before requesting another email.",
      };
    }

    return {
      ok: false,
      error: "Unable to send a sign-in link right now. Try again shortly.",
    };
  }

  return { ok: true, kind: "magic_link_sent" };
}

export function magicLinkSentCopy(): string {
  return "Check your email for a secure sign-in link.";
}
