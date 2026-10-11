export type ApplicationErrorKind =
  | "expected"
  | "operational"
  | "programming";

export type ApplicationErrorCode =
  | "AUTHENTICATION_REQUIRED"
  | "AUTH_CALLBACK_FAILED"
  | "PROVISIONING_FAILED"
  | "SIGN_OUT_FAILED"
  | "ORGANIZATION_REQUIRED"
  | "TENANT_ACCESS_DENIED"
  | "TENANT_PERSISTENCE_FAILED"
  | "DATA_LOAD_FAILED"
  | "INVALID_REQUEST"
  | "INTERNAL_ERROR";

export interface AppErrorOptions {
  code:
    ApplicationErrorCode;

  kind:
    ApplicationErrorKind;

  message:
    string;

  publicMessage:
    string;

  httpStatus:
    number;

  cause?:
    unknown;
}

export class AppError
  extends Error {
  readonly code:
    ApplicationErrorCode;

  readonly kind:
    ApplicationErrorKind;

  readonly publicMessage:
    string;

  readonly httpStatus:
    number;

  constructor(
    options:
      AppErrorOptions,
  ) {
    super(
      options.message,
      {
        cause:
          options.cause,
      },
    );

    this.name =
      "AppError";

    this.code =
      options.code;

    this.kind =
      options.kind;

    this.publicMessage =
      options.publicMessage;

    this.httpStatus =
      options.httpStatus;
  }
}

export function isAppError(
  error: unknown,
): error is AppError {
  return (
    error instanceof AppError
  );
}
