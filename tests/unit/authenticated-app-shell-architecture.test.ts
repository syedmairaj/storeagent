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
  "StoreAgent M1.6 authenticated application shell",
  () => {
    it(
      "protects the application route group",
      () => {
        const source =
          read(
            "app/(app)/app/layout.tsx",
          );

        expect(
          source,
        ).toContain(
          "requireAppIdentity",
        );
      },
    );

    it(
      "redirects signed-out application access to the login surface",
      () => {
        const source =
          read(
            "lib/auth/app-route.ts",
          );

        expect(
          source,
        ).toContain(
          '"/login?next=/app"',
        );
      },
    );

    it(
      "uses normal browser Supabase authentication for sign in",
      () => {
        const source =
          read(
            "components/auth/sign-in-form.tsx",
          );

        expect(
          source,
        ).toContain(
          "createSupabaseBrowserClient",
        );

        expect(
          source,
        ).toContain(
          "signInWithPassword",
        );

        expect(
          source,
        ).not.toContain(
          "createSupabaseAdminClient",
        );
      },
    );

    it(
      "uses verified authentication resolution for the app boundary",
      () => {
        const source =
          read(
            "lib/auth/app-route.ts",
          );

        expect(
          source,
        ).toContain(
          "resolveAuthentication",
        );

        expect(
          source,
        ).not.toContain(
          "getSession",
        );
      },
    );

    it(
      "requires explicit organization selection",
      () => {
        const source =
          read(
            "app/(app)/app/page.tsx",
          );

        expect(
          source,
        ).toContain(
          "organizations.map",
        );

        expect(
          source,
        ).not.toContain(
          "organizations[0]",
        );

        expect(
          source,
        ).not.toContain(
          ".limit(",
        );
      },
    );

    it(
      "places explicit organization id in the workspace route",
      () => {
        const source =
          read(
            "app/(app)/app/[organizationId]/layout.tsx",
          );

        expect(
          source,
        ).toContain(
          "organizationId",
        );

        expect(
          source,
        ).toContain(
          "resolveServerOrganizationContext",
        );
      },
    );

    it(
      "resolves membership using both user and organization",
      () => {
        const source =
          read(
            "lib/tenancy/server-organization-context.ts",
          );

        expect(
          source,
        ).toContain(
          '.eq(\n        "organization_id",',
        );

        expect(
          source,
        ).toContain(
          '.eq(\n        "user_id",',
        );
      },
    );

    it(
      "does not use first-membership fallback",
      () => {
        const source =
          read(
            "lib/tenancy/server-organization-context.ts",
          );

        expect(
          source,
        ).not.toContain(
          ".limit(",
        );

        expect(
          source,
        ).not.toContain(
          ".order(",
        );
      },
    );

    it(
      "does not create browser tenant authority",
      () => {
        const files = [
          "app/(app)/app/page.tsx",
          "app/(app)/app/[organizationId]/layout.tsx",
          "lib/tenancy/server-organization-context.ts",
        ];

        for (
          const file of files
        ) {
          const source =
            read(file);

          expect(
            source,
          ).not.toContain(
            "localStorage",
          );

          expect(
            source,
          ).not.toContain(
            "cookies().set",
          );
        }
      },
    );

    it(
      "does not use privileged Supabase access",
      () => {
        const files = [
          "app/(app)/app/page.tsx",
          "app/(app)/app/[organizationId]/layout.tsx",
          "lib/tenancy/server-organization-context.ts",
        ];

        for (
          const file of files
        ) {
          const source =
            read(file);

          expect(
            source,
          ).not.toContain(
            "createSupabaseAdminClient",
          );

          expect(
            source,
          ).not.toContain(
            "SERVICE_ROLE",
          );
        }
      },
    );

    it(
      "keeps sign out POST based",
      () => {
        const source =
          read(
            "components/app-shell/app-shell.tsx",
          );

        expect(
          source,
        ).toContain(
          'action="/auth/signout"',
        );

        expect(
          source,
        ).toContain(
          'method="post"',
        );
      },
    );

    it(
      "does not implement future inventory intelligence",
      () => {
        const source =
          read(
            "app/(app)/app/[organizationId]/page.tsx",
          );

        for (
          const forbidden of [
            "@/lib/metrics/inventory-math",
            "@/lib/forecast",
            "@/lib/decision-engine",
            "decide(",
            "openai",
            "anthropic",
            "shopify",
            "stripe",
          ]
        ) {
          expect(
            source.toLowerCase(),
          ).not.toContain(
            forbidden,
          );
        }
      },
    );

    it(
      "provides an honest no-data state instead of fake metrics",
      () => {
        const source =
          read(
            "app/(app)/app/[organizationId]/page.tsx",
          );

        expect(
          source,
        ).toContain(
          "No inventory data has been connected yet.",
        );

        expect(
          source,
        ).toContain(
          "will not invent inventory",
        );
      },
    );

    it(
      "keeps the organization switch path explicit",
      () => {
        const source =
          read(
            "components/app-shell/app-shell.tsx",
          );

        expect(
          source,
        ).toContain(
          'href="/app"',
        );
      },
    );
  },
);
