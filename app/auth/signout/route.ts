import {
  NextResponse,
  type NextRequest,
} from "next/server";

import {
  createSupabaseServerClient,
} from "@/lib/supabase/server";

export async function POST(
  request: NextRequest,
) {
  const supabase =
    await createSupabaseServerClient();

  const {
    error,
  } =
    await supabase
      .auth
      .signOut();

  if (
    error
  ) {
    return NextResponse.json(
      {
        error:
          "Unable to sign out.",
      },
      {
        status:
          500,
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
    },
  );
}
