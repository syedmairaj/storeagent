import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

const ROOT =
  process.cwd();

function migrationSource():
string {
  const migrationsDirectory =
    path.join(
      ROOT,
      "supabase",
      "migrations",
    );

  const matches =
    fs.readdirSync(
      migrationsDirectory,
    ).filter(
      (file) =>
        file.endsWith(
          "_m1_5_rls_tenant_enforcement.sql",
        ),
    );

  expect(matches).toHaveLength(1);

  return fs.readFileSync(
    path.join(
      migrationsDirectory,
      matches[0],
    ),
    "utf8",
  );
}

function normalized():
string {
  return migrationSource()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

describe(
  "StoreAgent M1.5 foundation RLS architecture",
  () => {
    it(
      "defines exactly the intended foundation select policies",
      () => {
        const source =
          normalized();

        for (
          const policy of [
            "organization_members_select_self",
            "organizations_select_member",
            "stores_select_member",
            "locations_select_member",
          ]
        ) {
          expect(source).toContain(
            `create policy ${policy}`,
          );
        }
      },
    );

    it(
      "restricts membership discovery to auth.uid",
      () => {
        const source =
          normalized();

        expect(source).toContain(
          "user_id = (select auth.uid())",
        );
      },
    );

    it(
      "authorizes organizations through membership",
      () => {
        const source =
          normalized();

        expect(source).toContain(
          "membership.organization_id = organizations.id",
        );

        expect(source).toContain(
          "membership.user_id = (select auth.uid())",
        );
      },
    );

    it(
      "authorizes stores through organization membership",
      () => {
        expect(
          normalized(),
        ).toContain(
          "membership.organization_id = stores.organization_id",
        );
      },
    );

    it(
      "authorizes locations through organization membership",
      () => {
        expect(
          normalized(),
        ).toContain(
          "membership.organization_id = locations.organization_id",
        );
      },
    );

    it(
      "targets authenticated users for every select policy",
      () => {
        const source =
          normalized();

        const matches =
          source.match(
            /for select to authenticated/g,
          ) ?? [];

        expect(matches).toHaveLength(4);
      },
    );

    it(
      "creates no client mutation policy",
      () => {
        const source =
          normalized();

        expect(source).not.toMatch(
          /create policy [^;]+ for insert/,
        );

        expect(source).not.toMatch(
          /create policy [^;]+ for update/,
        );

        expect(source).not.toMatch(
          /create policy [^;]+ for delete/,
        );
      },
    );

    it(
      "removes anonymous table privileges",
      () => {
        const source =
          normalized();

        for (
          const table of [
            "organizations",
            "organization_members",
            "stores",
            "locations",
          ]
        ) {
          expect(source).toContain(
            `revoke all on table public.${table} from anon`,
          );
        }
      },
    );

    it(
      "grants authenticated clients read access only",
      () => {
        const source =
          normalized();

        for (
          const table of [
            "organizations",
            "organization_members",
            "stores",
            "locations",
          ]
        ) {
          expect(source).toContain(
            `grant select on table public.${table} to authenticated`,
          );

          expect(source).toContain(
            `revoke insert, update, delete, truncate, references, trigger on table public.${table} from authenticated`,
          );
        }
      },
    );

    it(
      "does not create a default or first-tenant mechanism",
      () => {
        const source =
          normalized();

        expect(source).not.toContain(
          "limit 1",
        );

        expect(source).not.toContain(
          "order by",
        );

        expect(source).not.toContain(
          "default organization",
        );
      },
    );

    it(
      "does not introduce privileged bypass helpers",
      () => {
        const source =
          normalized();

        expect(source).not.toContain(
          "security definer",
        );

        expect(source).not.toContain(
          "service_role",
        );
      },
    );
  },
);
