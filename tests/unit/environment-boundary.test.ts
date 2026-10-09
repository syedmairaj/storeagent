import {
  describe,
  expect,
  it,
} from "vitest";

import {
  readPublicEnvironment,
  readServerEnvironment,
} from "@/lib/config/env";

const PUBLIC_ENV = {
  NEXT_PUBLIC_SUPABASE_URL:
    "https://example.supabase.co",

  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    "publishable-test-key",
};

describe(
  "StoreAgent environment boundary",
  () => {
    it(
      "reads public Supabase configuration",
      () => {
        expect(
          readPublicEnvironment(
            PUBLIC_ENV,
          ),
        ).toEqual({
          supabaseUrl:
            "https://example.supabase.co",

          supabasePublishableKey:
            "publishable-test-key",
        });
      },
    );

    it(
      "does not require service role for public configuration",
      () => {
        expect(
          () =>
            readPublicEnvironment(
              PUBLIC_ENV,
            ),
        ).not.toThrow();
      },
    );

    it(
      "requires service-role credentials for privileged configuration",
      () => {
        expect(
          () =>
            readServerEnvironment(
              PUBLIC_ENV,
            ),
        ).toThrow();
      },
    );

    it(
      "reads explicit privileged server configuration",
      () => {
        expect(
          readServerEnvironment({
            ...PUBLIC_ENV,

            SUPABASE_SERVICE_ROLE_KEY:
              "service-role-test-key",
          }),
        ).toEqual({
          supabaseUrl:
            "https://example.supabase.co",

          supabasePublishableKey:
            "publishable-test-key",

          supabaseServiceRoleKey:
            "service-role-test-key",
        });
      },
    );

    it(
      "rejects malformed Supabase URLs",
      () => {
        expect(
          () =>
            readPublicEnvironment({
              ...PUBLIC_ENV,

              NEXT_PUBLIC_SUPABASE_URL:
                "not-a-url",
            }),
        ).toThrow();
      },
    );
  },
);
