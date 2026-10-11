import {
  describe,
  expect,
  it,
} from "vitest";

import {
  isValidRequestId,
  resolveRequestId,
} from "@/lib/observability/request-id";

describe(
  "application request correlation",
  () => {
    it(
      "accepts a safe caller request id",
      () => {
        expect(
          resolveRequestId(
            "request-123456",
            () =>
              "generated-id",
          ),
        ).toBe(
          "request-123456",
        );
      },
    );

    it(
      "generates an id when none exists",
      () => {
        expect(
          resolveRequestId(
            null,
            () =>
              "generated-id",
          ),
        ).toBe(
          "generated-id",
        );
      },
    );

    it(
      "rejects unsafe inbound correlation values",
      () => {
        expect(
          isValidRequestId(
            "bad value\nheader",
          ),
        ).toBe(false);

        expect(
          resolveRequestId(
            "bad value\nheader",
            () =>
              "replacement-id",
          ),
        ).toBe(
          "replacement-id",
        );
      },
    );

    it(
      "rejects excessively long ids",
      () => {
        expect(
          isValidRequestId(
            "x".repeat(
              129,
            ),
          ),
        ).toBe(false);
      },
    );
  },
);
