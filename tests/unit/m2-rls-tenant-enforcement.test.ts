import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

const ROOT = process.cwd();

const MIGRATION_DIRECTORY =
  path.join(
    ROOT,
    "supabase",
    "migrations",
  );

const M2_TABLES = [
  "products",
  "product_variants",
  "inventory_snapshots",
  "orders",
  "order_items",
  "return_refunds",
  "suppliers",
  "supplier_products",
  "purchase_orders",
  "purchase_order_items",
  "integrations",
  "provider_bindings",
  "sync_runs",
] as const;

const CURRENT_STATE_TABLES = [
  "products",
  "product_variants",
  "suppliers",
  "supplier_products",
  "purchase_orders",
  "purchase_order_items",
  "integrations",
  "provider_bindings",
] as const;

const HISTORY_TABLES = [
  "inventory_snapshots",
  "orders",
  "order_items",
  "return_refunds",
  "sync_runs",
] as const;

function migration():
string {
  const matches =
    fs.readdirSync(
      MIGRATION_DIRECTORY,
    ).filter(
      (file) =>
        file.endsWith(
          "_m2_7_rls_tenant_enforcement.sql",
        ),
    );

  expect(matches).toHaveLength(1);

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
  return migration()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

describe(
  "StoreAgent M2.7 RLS tenant enforcement",
  () => {
    it(
      "covers exactly the frozen M2 tenant table set",
      () => {
        expect(M2_TABLES).toHaveLength(13);
        expect(CURRENT_STATE_TABLES).toHaveLength(8);
        expect(HISTORY_TABLES).toHaveLength(5);
      },
    );

    it(
      "revokes all M2 table privileges from anon",
      () => {
        const source = normalized();

        expect(source).toContain(
          "revoke all on table",
        );

        expect(source).toContain(
          "from anon",
        );

        for (const table of M2_TABLES) {
          expect(source).toContain(
            `public.${table}`,
          );
        }
      },
    );

    it(
      "grants authenticated users SELECT only",
      () => {
        const source = normalized();

        expect(source).toContain(
          "grant select on table",
        );

        expect(source).toContain(
          "to authenticated",
        );

        expect(source).toContain(
          "revoke insert, update, delete, truncate, references, trigger",
        );

        expect(source).toContain(
          "from authenticated",
        );
      },
    );

    it(
      "creates one predictable SELECT policy for every M2 table",
      () => {
        const source = normalized();

        for (const table of M2_TABLES) {
          expect(source).toContain(
            `create policy ${table}_select_member`,
          );

          expect(source).toContain(
            `on public.${table} for select to authenticated`,
          );
        }
      },
    );

    it(
      "creates exactly thirteen policies",
      () => {
        const policies = [
          ...migration().matchAll(
            /create policy\s+([a-z0-9_]+)/gi,
          ),
        ].map(
          (match) => match[1],
        );

        expect(policies).toHaveLength(13);
        expect(new Set(policies).size).toBe(13);
      },
    );

    it(
      "creates no browser mutation policies",
      () => {
        const source = normalized();

        expect(source).not.toMatch(
          /create policy [^;]+ for insert/,
        );

        expect(source).not.toMatch(
          /create policy [^;]+ for update/,
        );

        expect(source).not.toMatch(
          /create policy [^;]+ for delete/,
        );

        expect(source).not.toMatch(
          /create policy [^;]+ for all/,
        );
      },
    );

    it(
      "uses organization membership as authorization bridge",
      () => {
        const source = normalized();

        const membershipReferences =
          source.match(
            /from public\.organization_members as membership/g,
          ) ?? [];

        expect(membershipReferences).toHaveLength(13);
      },
    );

    it(
      "binds membership to auth.uid",
      () => {
        const source = normalized();

        const uidReferences =
          source.match(
            /membership\.user_id = \(select auth\.uid\(\)\)/g,
          ) ?? [];

        expect(uidReferences).toHaveLength(13);
      },
    );

    it(
      "authorizes against row organization_id",
      () => {
        const source = normalized();

        for (const table of M2_TABLES) {
          expect(source).toContain(
            `membership.organization_id = ${table}.organization_id`,
          );
        }
      },
    );

    it(
      "does not authorize through store IDs",
      () => {
        const source = normalized();

        expect(source).not.toContain(
          "membership.store_id",
        );
      },
    );

    it(
      "does not authorize through provider identity",
      () => {
        const source = normalized();

        expect(source).not.toContain(
          "membership.provider",
        );

        expect(source).not.toContain(
          "external_id =",
        );

        expect(source).not.toContain(
          "integration_id = membership",
        );
      },
    );

    it(
      "keeps current-state tables browser mutation denied",
      () => {
        const source = normalized();

        for (const table of CURRENT_STATE_TABLES) {
          expect(source).toContain(
            `public.${table}`,
          );
        }

        expect(source).toContain(
          "revoke insert, update, delete, truncate, references, trigger",
        );
      },
    );

    it(
      "keeps immutable/history tables browser mutation denied",
      () => {
        const source = normalized();

        for (const table of HISTORY_TABLES) {
          expect(source).toContain(
            `public.${table}`,
          );
        }

        expect(source).not.toMatch(
          /for insert|for update|for delete/,
        );
      },
    );

    it(
      "does not introduce a privileged bypass helper",
      () => {
        const source = normalized();

        expect(source).not.toContain(
          "security definer",
        );

        expect(source).not.toContain(
          "service_role",
        );

        expect(source).not.toContain(
          "bypassrls",
        );
      },
    );
  },
);
