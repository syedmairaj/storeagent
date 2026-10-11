import {
  NextResponse,
  type NextRequest,
} from "next/server";

import {
  safeAuthNextPath,
} from "@/lib/auth/redirect";

import {
  AppError,
} from "@/lib/observability/app-error";

import {
  resolveRequestId,
} from "@/lib/observability/request-id";

import {
  logServerFailure,
} from "@/lib/observability/server-failure";

import {
  ensureCurrentUserProvisioned,
} from "@/lib/provisioning/current-user";

import {
  createSupabaseServerClient,
} from "@/lib/supabase/server";

function callbackFailure(
  request:
    NextRequest,

  requestId:
    string,

  errorCode:
    "callback" |
    "provisioning",
) {
  const failure =
    new URL(
      "/",
      request.url,
    );

  failure.searchParams.set(
    "auth_error",
    errorCode,
  );

  failure.searchParams.set(
    "request_id",
    requestId,
  );

  return NextResponse.redirect(
    failure,
  );
}

export async function GET(
  request:
    NextRequest,
) {
  const requestId =
    resolveRequestId(
      request.headers.get(
        "x-request-id",
      ),
    );

  const code =
    request.nextUrl
      .searchParams
      .get(
        "code",
      );

  const nextPath =
    safeAuthNextPath(
      request.nextUrl
        .searchParams
        .get(
          "next",
        ),
    );

  if (!code) {
    const error =
      new AppError({
        code:
          "AUTH_CALLBACK_FAILED",

        kind:
          "expected",

        message:
          "Authentication callback did not contain an authorization code.",

        publicMessage:
          "Unable to complete sign in.",

        httpStatus:
          400,
      });

    logServerFailure({
      eventType:
        "auth_callback_failed",

      error,

      context: {
        requestId,
        route:
          "/auth/callback",
        action:
          "exchange_auth_code",
        userId:
          null,
        organizationId:
          null,
        storeId:
          null,
      },
    });

    return callbackFailure(
      request,
      requestId,
      "callback",
    );
  }

  const supabase =
    await createSupabaseServerClient();

  const {
    error:
      exchangeError,
  } =
    await supabase.auth
      .exchangeCodeForSession(
        code,
      );

  if (exchangeError) {
    const error =
      new AppError({
        code:
          "AUTH_CALLBACK_FAILED",

        kind:
          "operational",

        message:
          "Supabase authentication code exchange failed.",

        publicMessage:
          "Unable to complete sign in.",

        httpStatus:
          500,

        cause:
          exchangeError,
      });

    logServerFailure({
      eventType:
        "auth_callback_failed",

      error,

      context: {
        requestId,
        route:
          "/auth/callback",
        action:
          "exchange_auth_code",
        userId:
          null,
        organizationId:
          null,
        storeId:
          null,
      },
    });

    return callbackFailure(
      request,
      requestId,
      "callback",
    );
  }

  try {
    await ensureCurrentUserProvisioned(
      supabase,
    );
  } catch (cause) {
    const error =
      new AppError({
        code:
          "PROVISIONING_FAILED",

        kind:
          "operational",

        message:
          "Authenticated user provisioning failed.",

        publicMessage:
          "Unable to prepare your StoreAgent workspace.",

        httpStatus:
          500,

        cause,
      });

    logServerFailure({
      eventType:
        "user_provisioning_failed",

      error,

      context: {
        requestId,
        route:
          "/auth/callback",
        action:
          "ensure_user_provisioned",
        userId:
          null,
        organizationId:
          null,
        storeId:
          null,
      },
    });

    return callbackFailure(
      request,
      requestId,
      "provisioning",
    );
  }

  return NextResponse.redirect(
    new URL(
      nextPath,
      request.url,
    ),
  );
}
