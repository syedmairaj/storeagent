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
  "StoreAgent Supabase client architecture",
  () => {
    it(
      "keeps service-role credentials out of browser client",
      () => {
        const source =
          read(
            "lib/supabase/browser.ts",
          );

        expect(
          source,
        ).not.toContain(
          "SUPABASE_SERVICE_ROLE_KEY",
        );

        expect(
          source,
        ).not.toContain(
          "readServerEnvironment",
        );
      },
    );

    it(
      "marks privileged client as server-only",
      () => {
        expect(
          read(
            "lib/supabase/admin.ts",
          ),
        ).toContain(
          'import "server-only"',
        );
      },
    );

    it(
      "marks request server client as server-only",
      () => {
        expect(
          read(
            "lib/supabase/server.ts",
          ),
        ).toContain(
          'import "server-only"',
        );
      },
    );

    it(
      "keeps browser client explicitly client-side",
      () => {
        expect(
          read(
            "lib/supabase/browser.ts",
          ),
        ).toContain(
          '"use client"',
        );
      },
    );

    it(
      "keeps service-role variable non-public",
      () => {
        expect(
          read(
            ".env.example",
          ),
        ).toContain(
          "SUPABASE_SERVICE_ROLE_KEY=",
        );

        expect(
          read(
            ".env.example",
          ),
        ).not.toContain(
          "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE",
        );
      },
    );

    it(
      "does not introduce Supabase dependencies into deterministic intelligence",
      () => {
        const files = [
          "lib/metrics",
          "lib/forecasting",
          "lib/decision-engine",
        ];

        for (
          const directory
          of files
        ) {
          const paths =
            fs
              .readdirSync(
                path.join(
                  ROOT,
                  directory,
                ),
                {
                  recursive:
                    true,
                  withFileTypes:
                    true,
                },
              )
              .filter(
                (entry) =>
                  entry.isFile() &&
                  entry.name.endsWith(
                    ".ts",
                  ),
              );

          for (
            const entry
            of paths
          ) {
            const source =
              fs.readFileSync(
                path.join(
                  entry.parentPath,
                  entry.name,
                ),
                "utf8",
              );

            expect(
              source.includes(
                "supabase",
              ),
              `${directory}/${entry.name} must not depend on Supabase`,
            ).toBe(false);
          }
        }
      },
    );
  },
);
