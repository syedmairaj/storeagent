import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

const ROOT =
  process.cwd();

const MIGRATION_DIRECTORY =
  path.join(
    ROOT,
    "supabase",
    "migrations",
  );

function foundationMigration():
string {
  const files =
    fs.readdirSync(
      MIGRATION_DIRECTORY,
    );

  const matches =
    files.filter(
      (file) =>
        file.endsWith(
          "_m1_3_canonical_foundation.sql",
        ),
    );

  expect(
    matches,
  ).toHaveLength(
    1,
  );

  return fs.readFileSync(
    path.join(
      MIGRATION_DIRECTORY,
      matches[0],
    ),
    "utf8",
  );
}

function normalized():
string {
  return foundationMigration()
    .replace(
      /\s+/g,
      " ",
    )
    .toLowerCase();
}

describe(
  "StoreAgent M1.3 canonical foundation schema",
  () => {
    it(
      "creates exactly the M1.3 canonical foundation tables",
      () => {
        const source =
          foundationMigration();

        const tables = [
          ...source.matchAll(
            /create table public\.([a-z_]+)/gi,
          ),
        ].map(
          (match) =>
            match[1],
        );

        expect(
          tables,
        ).toEqual([
          "organizations",
          "organization_members",
          "stores",
          "locations",
        ]);
      },
    );

    it(
      "does not invent a profiles table",
      () => {
        expect(
          normalized(),
        ).not.toContain(
          "create table public.profiles",
        );
      },
    );

    it(
      "persists the canonical organization fields",
      () => {
        const source =
          normalized();

        for (
          const field of [
            "name text not null",
            "country_code text null",
            "default_currency text not null",
            "timezone text not null",
            "created_at timestamptz not null",
            "updated_at timestamptz not null",
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
      "persists membership against organization and Supabase user identity",
      () => {
        const source =
          normalized();

        expect(
          source,
        ).toContain(
          "references public.organizations(id)",
        );

        expect(
          source,
        ).toContain(
          "references auth.users(id)",
        );

        expect(
          source,
        ).toContain(
          "unique ( organization_id, user_id )",
        );
      },
    );

    it(
      "uses the frozen organization role vocabulary",
      () => {
        const source =
          normalized();

        for (
          const role of [
            "'owner'",
            "'admin'",
            "'analyst'",
            "'operator'",
          ]
        ) {
          expect(
            source,
          ).toContain(
            role,
          );
        }
      },
    );

    it(
      "uses the frozen store status vocabulary",
      () => {
        const source =
          normalized();

        expect(
          source,
        ).toContain(
          "constraint stores_status_check",
        );

        for (
          const status of [
            "'active'",
            "'inactive'",
            "'archived'",
          ]
        ) {
          expect(
            source,
          ).toContain(
            status,
          );
        }
      },
    );

    it(
      "uses the frozen location status vocabulary",
      () => {
        const source =
          normalized();

        expect(
          source,
        ).toContain(
          "constraint locations_status_check",
        );

        for (
          const status of [
            "'active'",
            "'inactive'",
            "'archived'",
          ]
        ) {
          expect(
            source,
          ).toContain(
            status,
          );
        }
      },
    );

    it(
      "enforces same-organization store ownership for locations",
      () => {
        const source =
          normalized();

        expect(
          source,
        ).toContain(
          "foreign key ( organization_id, store_id ) references public.stores ( organization_id, id )",
        );
      },
    );

    it(
      "does not cascade organization-owned business deletion",
      () => {
        const source =
          normalized();

        expect(
          source,
        ).toContain(
          "constraint organization_members_organization_fk",
        );

        expect(
          source,
        ).toContain(
          "constraint stores_organization_fk",
        );

        expect(
          source,
        ).toContain(
          "constraint locations_organization_fk",
        );

        const cascadeMatches =
          source.match(
            /on delete cascade/g,
          ) ?? [];

        expect(
          cascadeMatches,
        ).toHaveLength(
          1,
        );

        expect(
          source,
        ).toContain(
          "references auth.users(id) on delete cascade",
        );
      },
    );

    it(
      "creates indexes needed by future tenant resolution and RLS",
      () => {
        const source =
          normalized();

        expect(
          source,
        ).toContain(
          "organization_members_user_organization_idx",
        );

        expect(
          source,
        ).toContain(
          "stores_organization_idx",
        );

        expect(
          source,
        ).toContain(
          "locations_organization_idx",
        );
      },
    );

    it(
      "automatically maintains updated_at",
      () => {
        const source =
          normalized();

        expect(
          source,
        ).toContain(
          "create or replace function public.set_updated_at()",
        );

        for (
          const trigger of [
            "organizations_set_updated_at",
            "organization_members_set_updated_at",
            "stores_set_updated_at",
            "locations_set_updated_at",
          ]
        ) {
          expect(
            source,
          ).toContain(
            trigger,
          );
        }
      },
    );

    it(
      "enables RLS on every M1.3 tenant table",
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
          expect(
            source,
          ).toContain(
            `alter table public.${table} enable row level security`,
          );
        }
      },
    );

    it(
      "creates no RLS policies before M1.5",
      () => {
        expect(
          normalized(),
        ).not.toContain(
          "create policy",
        );
      },
    );

    it(
      "does not prematurely create later commerce tables",
      () => {
        const source =
          normalized();

        for (
          const table of [
            "products",
            "product_variants",
            "inventory_snapshots",
            "orders",
            "suppliers",
            "purchase_orders",
            "forecast_runs",
            "inventory_actions",
            "integrations",
            "billing_entitlements",
          ]
        ) {
          expect(
            source,
          ).not.toContain(
            `create table public.${table}`,
          );
        }
      },
    );
  },
);
