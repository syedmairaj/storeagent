import { NextResponse, type NextRequest } from "next/server";

import { establishRecoveryChallengeResponse } from "@/lib/auth/password-recovery";
import { AppError } from "@/lib/observability/app-error";
import { resolveRequestId } from "@/lib/observability/request-id";
import { logServerFailure } from "@/lib/observability/server-failure";

function recoveryFailure(
  request: NextRequest,
  requestId: string,
  code: "invalid" | "wrong_purpose" | "exchange_failed",
) {
  const location =
    `/forgot-password?recovery_error=${encodeURIComponent(code)}` +
    `&request_id=${encodeURIComponent(requestId)}`;
  return new NextResponse(null, {
    status: 303,
    headers: { Location: location },
  });
}

export async function GET(request: NextRequest) {
  const requestId = resolveRequestId(
    request.headers.get("x-request-id"),
  );

  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");

  if (!tokenHash) {
    return recoveryFailure(request, requestId, "invalid");
  }

  const result = await establishRecoveryChallengeResponse({
    request,
    tokenHash,
    type,
  });

  if (!result.ok) {
    const error = new AppError({
      code: "AUTH_RECOVERY_FAILED",
      kind: result.reason === "wrong_purpose" ? "expected" : "operational",
      message: "Password recovery verification failed.",
      publicMessage: "Unable to start password recovery.",
      httpStatus: 400,
    });

    logServerFailure({
      eventType: "auth_recovery_failed",
      error,
      context: {
        requestId,
        route: "/auth/recovery",
        action: "verify_recovery_token",
        userId: null,
        organizationId: null,
        storeId: null,
      },
    });

    return recoveryFailure(request, requestId, result.reason);
  }

  return result.response;
}
