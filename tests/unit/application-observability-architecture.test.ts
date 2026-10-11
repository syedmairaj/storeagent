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
  "application observability architecture",
  () => {
    it(
      "does not depend on monitoring vendors",
      () => {
        const source = [
          "lib/observability/app-error.ts",
          "lib/observability/request-id.ts",
          "lib/observability/redact.ts",
          "lib/observability/types.ts",
          "lib/observability/logger.ts",
          "lib/observability/public-error.ts",
        ]
          .map(read)
          .join("\n")
          .toLowerCase();

        for (
          const dependency of [
            "sentry",
            "datadog",
            "newrelic",
            "logtail",
            "betterstack",
            "axiom",
            "pino",
            "winston",
          ]
        ) {
          expect(
            source,
          ).not.toContain(
            dependency,
          );
        }
      },
    );

    it(
      "does not own commercial truth",
      () => {
        const source = [
          "lib/observability/app-error.ts",
          "lib/observability/request-id.ts",
          "lib/observability/redact.ts",
          "lib/observability/types.ts",
          "lib/observability/logger.ts",
          "lib/observability/public-error.ts",
        ]
          .map(read)
          .join("\n");

        for (
          const forbidden of [
            "@/lib/metrics",
            "@/lib/forecasting",
            "@/lib/decision-engine",
            "recommendedQuantity",
            "reorderPoint",
          ]
        ) {
          expect(
            source,
          ).not.toContain(
            forbidden,
          );
        }
      },
    );

    it(
      "keeps browser public errors separate from internal error messages",
      () => {
        const source =
          read(
            "lib/observability/public-error.ts",
          );

        expect(
          source,
        ).toContain(
          "publicMessage",
        );

        expect(
          source,
        ).not.toContain(
          ".stack",
        );
      },
    );

    it(
      "owns explicit correlation and tenant context fields",
      () => {
        const source =
          read(
            "lib/observability/types.ts",
          );

        for (
          const field of [
            "requestId",
            "userId",
            "organizationId",
            "storeId",
            "route",
            "action",
          ]
        ) {
          expect(
            source,
          ).toContain(
            field,
          );
        }
      },
    );

    it(
      "documents secret-redaction requirements",
      () => {
        const source =
          read(
            "docs/ERROR_OBSERVABILITY.md",
          );

        for (
          const term of [
            "access tokens",
            "refresh tokens",
            "Authorization headers",
            "cookies",
            "passwords",
            "service-role credentials",
          ]
        ) {
          expect(
            source,
          ).toContain(
            term,
          );
        }
      },
    );
  },
);
