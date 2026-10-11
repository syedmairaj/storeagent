import {
  describe,
  expect,
  it,
} from "vitest";

import {
  AppError,
  isAppError,
} from "@/lib/observability/app-error";

import {
  publicErrorFromUnknown,
} from "@/lib/observability/public-error";

describe(
  "application error boundary",
  () => {
    it(
      "keeps internal and public messages separate",
      () => {
        const error =
          new AppError({
            code:
              "TENANT_PERSISTENCE_FAILED",

            kind:
              "operational",

            message:
              "organization_members query failed",

            publicMessage:
              "Unable to load this workspace right now.",

            httpStatus:
              500,
          });

        expect(
          isAppError(
            error,
          ),
        ).toBe(true);

        expect(
          error.message,
        ).toBe(
          "organization_members query failed",
        );

        expect(
          publicErrorFromUnknown(
            error,
            "request-123",
          ),
        ).toEqual({
          error: {
            code:
              "TENANT_PERSISTENCE_FAILED",

            message:
              "Unable to load this workspace right now.",

            requestId:
              "request-123",
          },
        });
      },
    );

    it(
      "maps unknown failures to a generic public error",
      () => {
        const payload =
          publicErrorFromUnknown(
            new Error(
              "database password leaked here",
            ),
            "request-456",
          );

        expect(
          payload,
        ).toEqual({
          error: {
            code:
              "INTERNAL_ERROR",

            message:
              "Something went wrong. Please try again.",

            requestId:
              "request-456",
          },
        });

        expect(
          JSON.stringify(
            payload,
          ),
        ).not.toContain(
          "database password",
        );
      },
    );
  },
);
