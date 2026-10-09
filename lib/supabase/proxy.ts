import {
  createServerClient,
} from "@supabase/ssr";

import {
  NextResponse,
  type NextRequest,
} from "next/server";

import {
  readPublicEnvironment,
} from "@/lib/config/env";

export async function refreshAuthSession(
  request: NextRequest,
) {
  const env =
    readPublicEnvironment();

  let response =
    NextResponse.next({
      request,
    });

  const supabase =
    createServerClient(
      env.supabaseUrl,
      env.supabasePublishableKey,
      {
        cookies: {
          getAll() {
            return request.cookies
              .getAll();
          },

          setAll(
            cookiesToSet,
            headers,
          ) {
            for (
              const {
                name,
                value,
              }
              of cookiesToSet
            ) {
              request.cookies.set(
                name,
                value,
              );
            }

            response =
              NextResponse.next({
                request,
              });

            for (
              const {
                name,
                value,
                options,
              }
              of cookiesToSet
            ) {
              response.cookies.set(
                name,
                value,
                options,
              );
            }

            for (
              const [
                key,
                value,
              ]
              of Object.entries(
                headers,
              )
            ) {
              response.headers.set(
                key,
                value,
              );
            }
          },
        },
      },
    );

  /*
   * Authentication refresh only.
   *
   * Organization/store authorization must remain
   * outside Proxy.
   */
  await supabase
    .auth
    .getClaims();

  return response;
}
