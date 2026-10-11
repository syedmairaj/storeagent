import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

const ROOT =
  process.cwd();

function read(
  relativePath:
    string,
): string {
  return fs.readFileSync(
    path.join(
      ROOT,
      relativePath,
    ),
    "utf8",
  );
}

describe(
  "M1.7 application observability integration",
  () => {
    it(
      "auth callback uses request correlation and structured failure logging",
      () => {
        const source =
          read(
            "app/auth/callback/route.ts",
          );

        expect(
          source,
        ).toContain(
          "resolveRequestId",
        );

        expect(
          source,
        ).toContain(
          "logServerFailure",
        );

        expect(
          source,
        ).not.toContain(
          "console.",
        );
      },
    );

    it(
      "does not log authentication callback codes",
      () => {
        const source =
          read(
            "app/auth/callback/route.ts",
          );

        expect(
          source,
        ).not.toContain(
          "metadata: {\n        code",
        );

        expect(
          source,
        ).not.toContain(
          "console.log(code",
        );
      },
    );

    it(
      "sign out returns structured safe failures with request correlation",
      () => {
        const source =
          read(
            "app/auth/signout/route.ts",
          );

        expect(
          source,
        ).toContain(
          "publicErrorFromUnknown",
        );

        expect(
          source,
        ).toContain(
          '"x-request-id"',
        );

        expect(
          source,
        ).not.toContain(
          "signOutError.message",
        );
      },
    );

    it(
      "tenant persistence failures belong to the application error boundary",
      () => {
        const source =
          read(
            "lib/tenancy/server-organization-context.ts",
          );

        expect(
          source,
        ).toContain(
          "extends AppError",
        );

        expect(
          source,
        ).toContain(
          '"TENANT_PERSISTENCE_FAILED"',
        );
      },
    );

    it(
      "application persistence loads use typed operational errors",
      () => {
        for (
          const file of [
            "app/(app)/app/page.tsx",
            "app/(app)/app/[organizationId]/layout.tsx",
          ]
        ) {
          const source =
            read(file);

          expect(
            source,
          ).toContain(
            "new AppError",
          );

          expect(
            source,
          ).toContain(
            '"operational"',
          );
        }
      },
    );

    it(
      "provides a responsive application error boundary",
      () => {
        const source =
          read(
            "app/(app)/app/error.tsx",
          );

        expect(
          source,
        ).toContain(
          '"use client"',
        );

        expect(
          source,
        ).toContain(
          "reset",
        );

        expect(
          source,
        ).not.toContain(
          "error.message",
        );

        expect(
          source,
        ).not.toContain(
          "error.stack",
        );
      },
    );

    it(
      "does not introduce observability vendors",
      () => {
        const files = [
          "lib/observability/server-failure.ts",
          "app/auth/callback/route.ts",
          "app/auth/signout/route.ts",
        ];

        const source =
          files
            .map(read)
            .join("\n")
            .toLowerCase();

        for (
          const vendor of [
            "sentry",
            "datadog",
            "newrelic",
            "axiom",
            "betterstack",
          ]
        ) {
          expect(
            source,
          ).not.toContain(
            vendor,
          );
        }
      },
    );
  },
);
