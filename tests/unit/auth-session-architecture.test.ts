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
  "StoreAgent authentication and session architecture",
  () => {
    it(
      "uses the Next.js 16 root proxy",
      () => {
        const source =
          read(
            "proxy.ts",
          );

        expect(
          source,
        ).toContain(
          "refreshAuthSession",
        );

        expect(
          source,
        ).toContain(
          "export async function proxy",
        );
      },
    );

    it(
      "refreshes authenticated identity through verified claims",
      () => {
        const source =
          read(
            "lib/supabase/proxy.ts",
          );

        expect(
          source,
        ).toContain(
          ".getClaims()",
        );

        expect(
          source,
        ).not.toContain(
          ".getSession()",
        );
      },
    );

    it(
      "keeps tenant authorization out of session proxy",
      () => {
        const source =
          read(
            "lib/supabase/proxy.ts",
          );

        for (
          const forbidden of [
            "organizationId",
            "storeId",
            "organization_members",
            "membershipAuthorizesOrganization",
            "resolveTenantContext",
          ]
        ) {
          expect(
            source.includes(
              forbidden,
            ),
          ).toBe(false);
        }
      },
    );

    it(
      "does not use privileged Supabase credentials in user authentication",
      () => {
        const source = [
          read(
            "lib/auth/session.ts",
          ),
          read(
            "lib/supabase/proxy.ts",
          ),
          read(
            "app/auth/callback/route.ts",
          ),
          read(
            "app/auth/signout/route.ts",
          ),
        ].join(
          "\n",
        );

        expect(
          source,
        ).not.toContain(
          "createSupabaseAdminClient",
        );

        expect(
          source,
        ).not.toContain(
          "SUPABASE_SERVICE_ROLE_KEY",
        );
      },
    );

    it(
      "uses PKCE code exchange in auth callback",
      () => {
        expect(
          read(
            "app/auth/callback/route.ts",
          ),
        ).toContain(
          "exchangeCodeForSession",
        );
      },
    );

    it(
      "sanitizes callback continuation paths",
      () => {
        expect(
          read(
            "app/auth/callback/route.ts",
          ),
        ).toContain(
          "safeAuthNextPath",
        );
      },
    );

    it(
      "keeps sign out POST-only",
      () => {
        const source =
          read(
            "app/auth/signout/route.ts",
          );

        expect(
          source,
        ).toContain(
          "export async function POST",
        );

        expect(
          source,
        ).not.toContain(
          "export async function GET",
        );

        expect(
          source,
        ).toContain(
          ".signOut()",
        );
      },
    );

    it(
      "keeps server authentication based on verified claims",
      () => {
        const source =
          read(
            "lib/auth/session.ts",
          );

        expect(
          source,
        ).toContain(
          ".getClaims()",
        );

        expect(
          source,
        ).not.toContain(
          ".getSession()",
        );
      },
    );

    it(
      "keeps authentication resolver server-only",
      () => {
        expect(
          read(
            "lib/auth/session.ts",
          ),
        ).toContain(
          'import "server-only"',
        );
      },
    );

    it(
      "excludes static asset traffic from auth session refresh",
      () => {
        const source =
          read(
            "proxy.ts",
          );

        expect(
          source,
        ).toContain(
          "_next/static",
        );

        expect(
          source,
        ).toContain(
          "_next/image",
        );

        expect(
          source,
        ).toContain(
          "favicon.ico",
        );
      },
    );
  },
);
