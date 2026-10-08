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
  relativePath: string,
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
  "StoreAgent cross-tenant evaluation architecture",
  () => {
    it(
      "uses canonical tenant resolution rather than reproducing membership authorization",
      () => {
        const source =
          read(
            "tests/evaluation/tenancy-adversarial-runner.ts",
          );

        expect(
          source,
        ).toContain(
          "@/lib/tenancy/resolve-context",
        );

        expect(
          source,
        ).toContain(
          "resolveTenantContext",
        );
      },
    );

    it(
      "uses canonical provider binding ownership semantics",
      () => {
        const source =
          read(
            "tests/evaluation/tenancy-adversarial-runner.ts",
          );

        expect(
          source,
        ).toContain(
          "@/lib/providers/bindings",
        );

        expect(
          source,
        ).toContain(
          "buildProviderBindingKey",
        );

        expect(
          source,
        ).toContain(
          "assessProviderBindingReplay",
        );
      },
    );

    it(
      "uses canonical permission and service-role boundaries",
      () => {
        const source =
          read(
            "tests/evaluation/tenancy-adversarial-runner.ts",
          );

        expect(
          source,
        ).toContain(
          "roleHasPermission",
        );

        expect(
          source,
        ).toContain(
          "serviceOperationHasTrustedScope",
        );
      },
    );

    it(
      "keeps adversarial evaluation independent from AI UI billing and network access",
      () => {
        const source =
          read(
            "tests/evaluation/tenancy-adversarial-runner.ts",
          );

        for (
          const dependency of [
            "openai",
            "@anthropic",
            "@google/generative-ai",
            "react",
            "next/",
            "stripe",
            "fetch(",
            "axios",
          ]
        ) {
          expect(
            source.includes(
              dependency,
            ),
          ).toBe(false);
        }
      },
    );

    it(
      "keeps adversarial fixtures deterministic and credential-free",
      () => {
        const matrix =
          read(
            "tests/fixtures/tenancy/cross-tenant-v1-matrix.ts",
          );

        for (
          const forbidden of [
            "Date.now",
            "new Date(",
            "Math.random",
            "randomUUID",
            "serviceRoleKey",
            "accessToken",
            "refreshToken",
            "password",
          ]
        ) {
          expect(
            matrix.includes(
              forbidden,
            ),
          ).toBe(false);
        }
      },
    );
  },
);
