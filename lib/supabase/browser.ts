"use client";

import {
  createBrowserClient,
} from "@supabase/ssr";

import {
  readPublicEnvironment,
} from "@/lib/config/env";

export function createSupabaseBrowserClient() {
  const env =
    readPublicEnvironment({
      NEXT_PUBLIC_SUPABASE_URL:
        process.env.NEXT_PUBLIC_SUPABASE_URL,

      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    });

  return createBrowserClient(
    env.supabaseUrl,
    env.supabasePublishableKey,
  );
}
