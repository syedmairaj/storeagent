import {
  isAppError,
  type ApplicationErrorCode,
} from "@/lib/observability/app-error";

export interface PublicErrorPayload {
  error: {
    code:
      ApplicationErrorCode;

    message:
      string;

    requestId:
      string;
  };
}

export function publicErrorFromUnknown(
  error:
    unknown,

  requestId:
    string,
): PublicErrorPayload {
  if (
    isAppError(
      error,
    )
  ) {
    return {
      error: {
        code:
          error.code,

        message:
          error.publicMessage,

        requestId,
      },
    };
  }

  return {
    error: {
      code:
        "INTERNAL_ERROR",

      message:
        "Something went wrong. Please try again.",

      requestId,
    },
  };
}
