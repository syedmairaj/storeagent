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

function migration():
string {
  const matches =
    fs.readdirSync(
      MIGRATION_DIRECTORY,
    ).filter(
      (file) =>
        file.endsWith(
          "_m2_6_integration_identity.sql",
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
  "StoreAgent M2.6 integration identity schema",
  () => {
    it(
      "creates exactly the three M2.6 tables",
      () => {
        const tables = [
          ...migration().matchAll(
            /create table public\.([a-z_]+)/gi,
          ),
        ].map(
          (match) => match[1],
        );

        expect(tables).toEqual([
          "integrations",
          "provider_bindings",
          "sync_runs",
        ]);
      },
    );

    it(
      "persists canonical integration fields",
      () => {
        const source = normalized();

        for (const field of [
          "organization_id uuid not null",
          "store_id uuid null",
          "provider text not null",
          "status text not null",
          "display_name text null",
          "configuration jsonb null",
          "created_at timestamptz not null",
          "updated_at timestamptz not null",
        ]) {
          expect(source).toContain(field);
        }
      },
    );

    it(
      "enforces integration store ownership",
      () => {
        expect(normalized()).toContain(
          "foreign key ( organization_id, store_id ) references public.stores ( organization_id, id )",
        );
      },
    );

    it(
      "uses frozen integration status vocabulary",
      () => {
        const source = normalized();

        for (const status of [
          "'pending'",
          "'active'",
          "'degraded'",
          "'disconnected'",
          "'revoked'",
          "'error'",
        ]) {
          expect(source).toContain(status);
        }
      },
    );

    it(
      "persists the frozen durable provider binding identity",
      () => {
        const source = normalized();

        expect(source).toContain(
          "constraint provider_bindings_durable_identity_unique unique ( organization_id, integration_id, provider, resource_type, external_id )",
        );
      },
    );

    it(
      "requires binding provider to match integration provider",
      () => {
        expect(normalized()).toContain(
          "foreign key ( organization_id, integration_id, provider ) references public.integrations ( organization_id, id, provider )",
        );
      },
    );

    it(
      "keeps canonical and external identity separate",
      () => {
        const source = normalized();

        expect(source).toContain(
          "canonical_entity_id uuid not null",
        );

        expect(source).toContain(
          "external_id text not null",
        );
      },
    );

    it(
      "preserves external-id case while rejecting whitespace aliases",
      () => {
        const source = normalized();

        expect(source).toContain(
          "external_id = pg_catalog.btrim(external_id)",
        );

        expect(source).not.toContain(
          "lower(external_id)",
        );

        expect(source).not.toContain(
          "citext",
        );
      },
    );

    it(
      "does not use external parent identity as uniqueness",
      () => {
        const source = normalized();

        expect(source).toContain(
          "external_parent_id text null",
        );

        expect(
          source.match(
            /unique\s*\([^)]*external_parent_id[^)]*\)/g,
          ),
        ).toBeNull();
      },
    );

    it(
      "uses frozen provider resource vocabulary",
      () => {
        const source = normalized();

        for (const resourceType of [
          "'store'",
          "'location'",
          "'product'",
          "'product_variant'",
          "'order'",
          "'order_item'",
          "'return_refund'",
          "'supplier'",
          "'purchase_order'",
          "'purchase_order_item'",
        ]) {
          expect(source).toContain(resourceType);
        }
      },
    );

    it(
      "validates polymorphic canonical targets against canonical tables",
      () => {
        const source = normalized();

        expect(source).toContain(
          "validate_provider_binding_canonical_target",
        );

        for (const table of [
          "public.stores",
          "public.locations",
          "public.products",
          "public.product_variants",
          "public.orders",
          "public.order_items",
          "public.return_refunds",
          "public.suppliers",
          "public.purchase_orders",
          "public.purchase_order_items",
        ]) {
          expect(source).toContain(table);
        }
      },
    );

    it(
      "protects bindings from canonical rebinding",
      () => {
        expect(normalized()).toContain(
          "provider_bindings_prevent_identity_reassignment",
        );
      },
    );

    it(
      "prevents bound canonical entities from being deleted",
      () => {
        const source = normalized();

        expect(source).toContain(
          "prevent_bound_canonical_entity_delete",
        );

        expect(source).toContain(
          "product_variants_prevent_bound_delete",
        );

        expect(source).toContain(
          "orders_prevent_bound_delete",
        );
      },
    );

    it(
      "does not persist credentials or provider tokens",
      () => {
        const source = normalized();

        for (const forbiddenColumn of [
          "access_token ",
          "refresh_token ",
          "api_key ",
          "client_secret ",
          "password ",
        ]) {
          expect(source).not.toContain(
            forbiddenColumn,
          );
        }
      },
    );

    it(
      "persists explicit sync-run idempotency",
      () => {
        const source = normalized();

        expect(source).toContain(
          "idempotency_key text not null",
        );

        expect(source).toContain(
          "constraint sync_runs_idempotency_unique unique ( organization_id, integration_id, idempotency_key )",
        );
      },
    );

    it(
      "persists explicit non-negative sync counts",
      () => {
        const source = normalized();

        for (const count of [
          "discovered_count integer not null",
          "imported_count integer not null",
          "updated_count integer not null",
          "skipped_count integer not null",
          "quarantined_count integer not null",
          "failed_count integer not null",
        ]) {
          expect(source).toContain(count);
        }

        expect(source).toContain(
          "sync_runs_counts_non_negative",
        );
      },
    );

    it(
      "keeps sync cursors nullable",
      () => {
        const source = normalized();

        expect(source).toContain(
          "cursor_before text null",
        );

        expect(source).toContain(
          "cursor_after text null",
        );
      },
    );

    it(
      "uses frozen sync-run statuses",
      () => {
        const source = normalized();

        for (const status of [
          "'queued'",
          "'running'",
          "'completed'",
          "'completed_with_errors'",
          "'failed'",
          "'cancelled'",
        ]) {
          expect(source).toContain(status);
        }
      },
    );

    it(
      "preserves reconciliation metadata separately",
      () => {
        const source = normalized();

        expect(source).toContain(
          "error_summary jsonb null",
        );

        expect(source).toContain(
          "reconciliation_metadata jsonb null",
        );
      },
    );

    it(
      "protects sync-run tenant and integration identity",
      () => {
        const source = normalized();

        expect(source).toContain(
          "sync_runs_validate_integration_scope",
        );

        expect(source).toContain(
          "sync_runs_prevent_identity_reassignment",
        );
      },
    );

    it(
      "preserves sync runs as operational history",
      () => {
        expect(normalized()).toContain(
          "sync_runs_prevent_delete",
        );
      },
    );

    it(
      "enables RLS fail-closed without M2.7 policies",
      () => {
        const source = normalized();

        for (const table of [
          "integrations",
          "provider_bindings",
          "sync_runs",
        ]) {
          expect(source).toContain(
            `alter table public.${table} enable row level security`,
          );
        }

        expect(source).not.toContain(
          "create policy",
        );
      },
    );

    it(
      "does not introduce provider implementations",
      () => {
        const source = normalized();

        for (const implementation of [
          "@shopify",
          "shopify-api",
          "csv-parser",
          "openai",
          "stripe",
        ]) {
          expect(source).not.toContain(
            implementation,
          );
        }
      },
    );
  },
);
