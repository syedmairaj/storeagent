import {
  NextResponse,
  type NextRequest,
} from "next/server";

import {
  AppError,
} from "@/lib/observability/app-error";

import {
  publicErrorFromUnknown,
} from "@/lib/observability/public-error";

import {
  resolveRequestId,
} from "@/lib/observability/request-id";

import {
  logServerFailure,
} from "@/lib/observability/server-failure";

import {
  createSupabaseServerClient,
} from "@/lib/supabase/server";

export async function POST(
  request:
    NextRequest,
) {
  const requestId =
    resolveRequestId(
      request.headers.get(
        "x-request-id",
      ),
    );

  const supabase =
    await createSupabaseServerClient();

  const {
    error:
      signOutError,
  } =
    await supabase.auth
      .signOut();

  if (signOutError) {
    const error =
      new AppError({
        code:
          "SIGN_OUT_FAILED",

        kind:
          "operational",

        message:
          "Supabase sign-out operation failed.",

        publicMessage:
          "Unable to sign out right now.",

        httpStatus:
          500,

        cause:
          signOutError,
      });

    logServerFailure({
      eventType:
        "sign_out_failed",

      error,

      context: {
        requestId,
        route:
          "/auth/signout",
        action:
          "sign_out",
        userId:
          null,
        organizationId:
          null,
        storeId:
          null,
      },
    });

    return NextResponse.json(
      publicErrorFromUnknown(
        error,
        requestId,
      ),
      {
        status:
          error.httpStatus,

        headers: {
          "x-request-id":
            requestId,
        },
      },
    );
  }

  return NextResponse.redirect(
    new URL(
      "/",
      request.url,
    ),
    {
      status:
        303,

      headers: {
        "x-request-id":
          requestId,
      },
    },
  );
}
