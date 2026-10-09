"use client";

import {
  createBrowserClient,
} from "@supabase/ssr";

import {
  readPublicEnvironment,
} from "@/lib/config/env";

export function createSupabaseBrowserClient() {
  const env =
    readPublicEnvironment();

  return createBrowserClient(
    env.supabaseUrl,
    env.supabasePublishableKey,
  );
}
