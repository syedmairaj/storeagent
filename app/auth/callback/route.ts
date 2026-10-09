import {
  NextResponse,
  type NextRequest,
} from "next/server";

import {
  safeAuthNextPath,
} from "@/lib/auth/redirect";

import {
  ensureCurrentUserProvisioned,
} from "@/lib/provisioning/current-user";

import {
  createSupabaseServerClient,
} from "@/lib/supabase/server";

function callbackFailure(
  request: NextRequest,
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

  return NextResponse.redirect(
    failure,
  );
}

export async function GET(
  request: NextRequest,
) {
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

  if (
    !code
  ) {
    return callbackFailure(
      request,
      "callback",
    );
  }

  const supabase =
    await createSupabaseServerClient();

  const {
    error,
  } =
    await supabase
      .auth
      .exchangeCodeForSession(
        code,
      );

  if (
    error
  ) {
    return callbackFailure(
      request,
      "callback",
    );
  }

  try {
    await ensureCurrentUserProvisioned(
      supabase,
    );
  } catch {
    return callbackFailure(
      request,
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
