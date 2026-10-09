import "server-only";

import {
  createClient,
} from "@supabase/supabase-js";

import {
  readServerEnvironment,
} from "@/lib/config/env";

export function createSupabaseAdminClient() {
  const env =
    readServerEnvironment();

  return createClient(
    env.supabaseUrl,
    env.supabaseServiceRoleKey,
    {
      auth: {
        autoRefreshToken:
          false,

        persistSession:
          false,
      },
    },
  );
}
