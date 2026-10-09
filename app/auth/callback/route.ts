import {
  NextResponse,
  type NextRequest,
} from "next/server";

import {
  safeAuthNextPath,
} from "@/lib/auth/redirect";

import {
  createSupabaseServerClient,
} from "@/lib/supabase/server";

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
    const failure =
      new URL(
        "/",
        request.url,
      );

    failure.searchParams.set(
      "auth_error",
      "callback",
    );

    return NextResponse.redirect(
      failure,
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
    const failure =
      new URL(
        "/",
        request.url,
      );

    failure.searchParams.set(
      "auth_error",
      "callback",
    );

    return NextResponse.redirect(
      failure,
    );
  }

  return NextResponse.redirect(
    new URL(
      nextPath,
      request.url,
    ),
  );
}
