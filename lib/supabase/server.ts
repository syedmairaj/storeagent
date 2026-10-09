import "server-only";

import {
  createServerClient,
} from "@supabase/ssr";

import {
  cookies,
} from "next/headers";

import {
  readPublicEnvironment,
} from "@/lib/config/env";

export async function createSupabaseServerClient() {
  const env =
    readPublicEnvironment();

  const cookieStore =
    await cookies();

  return createServerClient(
    env.supabaseUrl,
    env.supabasePublishableKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },

        setAll(cookiesToSet) {
          try {
            for (
              const {
                name,
                value,
                options,
              }
              of cookiesToSet
            ) {
              cookieStore.set(
                name,
                value,
                options,
              );
            }
          } catch {
            /*
             * Server Components cannot always write cookies.
             *
             * Session-refresh ownership will be established
             * explicitly in M1.2.
             */
          }
        },
      },
    },
  );
}
