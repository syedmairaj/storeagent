import {
  describe,
  expect,
  it,
} from "vitest";

import {
  redactObservabilityValue,
} from "@/lib/observability/redact";

describe(
  "application observability redaction",
  () => {
    it(
      "redacts sensitive object fields recursively",
      () => {
        expect(
          redactObservabilityValue({
            authorization:
              "Bearer super-secret",

            password:
              "password-123",

            nested: {
              accessToken:
                "token-value",

              organizationId:
                "org-a",
            },
          }),
        ).toEqual({
          authorization:
            "[REDACTED]",

          password:
            "[REDACTED]",

          nested: {
            accessToken:
              "[REDACTED]",

            organizationId:
              "org-a",
          },
        });
      },
    );

    it(
      "redacts bearer credentials inside ordinary strings",
      () => {
        const value =
          redactObservabilityValue(
            "request failed with Bearer abc123SECRET",
          );

        expect(
          value,
        ).toBe(
          "request failed with Bearer [REDACTED]",
        );
      },
    );

    it(
      "redacts jwt-looking values",
      () => {
        const value =
          redactObservabilityValue(
            "token eyJabc.def.ghi",
          );

        expect(
          value,
        ).toBe(
          "token [REDACTED]",
        );
      },
    );

    it(
      "handles circular metadata without crashing",
      () => {
        const value:
          Record<
            string,
            unknown
          > =
            {};

        value.self =
          value;

        expect(
          redactObservabilityValue(
            value,
          ),
        ).toEqual({
          self:
            "[CIRCULAR]",
        });
      },
    );
  },
);
