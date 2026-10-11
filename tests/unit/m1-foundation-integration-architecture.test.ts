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
  "M1 foundation integration architecture",
  () => {
    it(
      "uses verified claims rather than getSession as server identity boundary",
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
      "protects app routes before tenant workspace resolution",
      () => {
        const source =
          read(
            "app/(app)/app/[organizationId]/layout.tsx",
          );

        const auth =
          source.indexOf(
            "requireAppIdentity",
          );

        const tenant =
          source.indexOf(
            "resolveServerOrganizationContext",
          );

        const domainRead =
          source.indexOf(
            '.from(\n        "organizations"',
          );

        expect(auth).toBeGreaterThan(
          -1,
        );

        expect(tenant).toBeGreaterThan(
          auth,
        );

        expect(domainRead).toBeGreaterThan(
          tenant,
        );
      },
    );

    it(
      "server tenant resolution matches authenticated user and requested organization",
      () => {
        const source =
          read(
            "lib/tenancy/server-organization-context.ts",
          );

        expect(
          source,
        ).toContain(
          '"organization_id"',
        );

        expect(
          source,
        ).toContain(
          "organizationId",
        );

        expect(
          source,
        ).toContain(
          '"user_id"',
        );

        expect(
          source,
        ).toContain(
          "identity.userId",
        );
      },
    );

    it(
      "has no first-membership fallback in server tenant resolution",
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
      "organization selector never silently chooses one organization",
      () => {
        const source =
          read(
            "app/(app)/app/page.tsx",
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

        expect(
          source,
        ).toContain(
          "organizations.map",
        );
      },
    );

    it(
      "foreign organization resolution fails before organization data load",
      () => {
        const source =
          read(
            "app/(app)/app/[organizationId]/layout.tsx",
          );

        const resolution =
          source.indexOf(
            "resolveServerOrganizationContext",
          );

        const denied =
          source.indexOf(
            "organization_access_denied",
          );

        const organizationRead =
          source.indexOf(
            '.from(\n        "organizations"',
          );

        expect(resolution).toBeGreaterThan(
          -1,
        );

        expect(denied).toBeGreaterThan(
          resolution,
        );

        expect(organizationRead).toBeGreaterThan(
          denied,
        );
      },
    );

    it(
      "keeps application persistence failures typed and operational",
      () => {
        for (
          const file of [
            "app/(app)/app/page.tsx",
            "app/(app)/app/[organizationId]/layout.tsx",
            "lib/tenancy/server-organization-context.ts",
          ]
        ) {
          const source =
            read(file);

          expect(
            source,
          ).toContain(
            "AppError",
          );
        }
      },
    );

    it(
      "keeps public error UI free of internal messages and stacks",
      () => {
        const source =
          read(
            "app/(app)/app/error.tsx",
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

        expect(
          source,
        ).toContain(
          "error.digest",
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
      },
    );

    it(
      "keeps authentication callback codes out of observability metadata",
      () => {
        const source =
          read(
            "app/auth/callback/route.ts",
          );

        expect(
          source,
        ).not.toContain(
          "console.log(code",
        );

        expect(
          source,
        ).not.toContain(
          "metadata: {\n        code",
        );
      },
    );

    it(
      "keeps browser code away from privileged Supabase access",
      () => {
        const source = [
          "components/auth/sign-in-form.tsx",
          "components/app-shell/app-shell.tsx",
          "components/app-shell/mobile-app-menu.tsx",
        ]
          .map(read)
          .join("\n");

        expect(
          source,
        ).not.toContain(
          "createSupabaseAdminClient",
        );

        expect(
          source,
        ).not.toContain(
          "SUPABASE_SERVICE_ROLE",
        );
      },
    );

    it(
      "keeps M1 integration free of future business ownership",
      () => {
        const source = [
          "lib/auth/session.ts",
          "lib/auth/app-route.ts",
          "lib/tenancy/server-organization-context.ts",
          "lib/observability/app-error.ts",
          "app/(app)/app/[organizationId]/layout.tsx",
        ]
          .map(read)
          .join("\n")
          .toLowerCase();

        for (
          const forbidden of [
            "@/lib/metrics",
            "@/lib/forecasting",
            "@/lib/decision-engine",
            "shopify",
            "stripe",
            "openai",
            "anthropic",
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
  },
);
