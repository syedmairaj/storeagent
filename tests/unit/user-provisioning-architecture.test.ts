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

function provisioningMigration():
string {
  const directory =
    path.join(
      ROOT,
      "supabase",
      "migrations",
    );

  const matches =
    fs.readdirSync(
      directory,
    ).filter(
      (file) =>
        file.endsWith(
          "_m1_4_user_provisioning.sql",
        ),
    );

  expect(
    matches,
  ).toHaveLength(
    1,
  );

  return fs.readFileSync(
    path.join(
      directory,
      matches[0],
    ),
    "utf8",
  );
}

function normalizedMigration():
string {
  return provisioningMigration()
    .replace(
      /\s+/g,
      " ",
    )
    .toLowerCase();
}

describe(
  "StoreAgent M1.4 user provisioning architecture",
  () => {
    it(
      "derives provisioning identity from auth.uid",
      () => {
        const source =
          normalizedMigration();

        expect(
          source,
        ).toContain(
          "auth.uid()",
        );
      },
    );

    it(
      "accepts no caller-controlled user or organization arguments",
      () => {
        const source =
          normalizedMigration();

        expect(
          source,
        ).toContain(
          "ensure_current_user_provisioned()",
        );

        expect(
          source,
        ).not.toContain(
          "ensure_current_user_provisioned(user_id",
        );

        expect(
          source,
        ).not.toContain(
          "ensure_current_user_provisioned(organization_id",
        );
      },
    );

    it(
      "uses a security definer boundary with hardened search path",
      () => {
        const source =
          normalizedMigration();

        expect(
          source,
        ).toContain(
          "security definer",
        );

        expect(
          source,
        ).toContain(
          "set search_path = ''",
        );
      },
    );

    it(
      "fails when authentication identity is absent",
      () => {
        const source =
          normalizedMigration();

        expect(
          source,
        ).toContain(
          "if authenticated_user_id is null",
        );

        expect(
          source,
        ).toContain(
          "authentication required",
        );
      },
    );

    it(
      "serializes concurrent provisioning per authenticated user",
      () => {
        const source =
          normalizedMigration();

        expect(
          source,
        ).toContain(
          "pg_advisory_xact_lock",
        );

        expect(
          source,
        ).toContain(
          "hashtextextended",
        );
      },
    );

    it(
      "does not create another organization when membership exists",
      () => {
        const source =
          normalizedMigration();

        expect(
          source,
        ).toContain(
          "from public.organization_members",
        );

        expect(
          source,
        ).toContain(
          "where membership.user_id = authenticated_user_id",
        );

        expect(
          source,
        ).toContain(
          "select false, null::uuid",
        );
      },
    );

    it(
      "creates the initial owner membership atomically",
      () => {
        const source =
          normalizedMigration();

        expect(
          source,
        ).toContain(
          "insert into public.organizations",
        );

        expect(
          source,
        ).toContain(
          "insert into public.organization_members",
        );

        expect(
          source,
        ).toContain(
          "'owner'",
        );
      },
    );

    it(
      "does not invent merchant currency truth during bootstrap",
      () => {
        expect(
          normalizedMigration(),
        ).toContain(
          "'xxx'",
        );
      },
    );

    it(
      "does not allow anonymous provisioning",
      () => {
        const source =
          normalizedMigration();

        expect(
          source,
        ).toContain(
          "from anon",
        );

        expect(
          source,
        ).toContain(
          "to authenticated",
        );
      },
    );

    it(
      "does not use service-role provisioning",
      () => {
        const service =
          read(
            "lib/provisioning/current-user.ts",
          );

        expect(
          service,
        ).not.toContain(
          "createSupabaseAdminClient",
        );

        expect(
          service,
        ).not.toContain(
          "SUPABASE_SERVICE_ROLE",
        );
      },
    );

    it(
      "keeps the provisioning service server-only",
      () => {
        expect(
          read(
            "lib/provisioning/current-user.ts",
          ),
        ).toContain(
          'import "server-only"',
        );
      },
    );

    it(
      "integrates provisioning only after PKCE exchange",
      () => {
        const callback =
          read(
            "app/auth/callback/route.ts",
          );

        const exchange =
          callback.indexOf(
            "exchangeCodeForSession",
          );

        const provisioning =
          callback.indexOf(
            "await ensureCurrentUserProvisioned(",
          );

        expect(
          exchange,
        ).toBeGreaterThan(
          -1,
        );

        expect(
          provisioning,
        ).toBeGreaterThan(
          exchange,
        );
      },
    );

    it(
      "uses a generic callback error for provisioning failure",
      () => {
        const callback =
          read(
            "app/auth/callback/route.ts",
          );

        expect(
          callback,
        ).toContain(
          '"provisioning"',
        );

        expect(
          callback,
        ).not.toContain(
          "error.message",
        );
      },
    );

    it(
      "does not add tenant selection to the auth callback",
      () => {
        const callback =
          read(
            "app/auth/callback/route.ts",
          );

        for (
          const forbidden of [
            "resolveTenantContext",
            "organization_members",
            "order(",
            "limit(",
            "first organization",
          ]
        ) {
          expect(
            callback.includes(
              forbidden,
            ),
          ).toBe(false);
        }
      },
    );
  },
);
