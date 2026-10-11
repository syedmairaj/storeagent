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
          "_m2_5_suppliers_purchase_orders.sql",
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
  return migration()
    .replace(
      /\s+/g,
      " ",
    )
    .toLowerCase();
}

describe(
  "StoreAgent M2.5 suppliers and purchase orders schema",
  () => {
    it(
      "creates exactly the four M2.5 canonical tables",
      () => {
        const tables = [
          ...migration().matchAll(
            /create table public\.([a-z_]+)/gi,
          ),
        ].map(
          (match) =>
            match[1],
        );

        expect(
          tables,
        ).toEqual([
          "suppliers",
          "supplier_products",
          "purchase_orders",
          "purchase_order_items",
        ]);
      },
    );

    it(
      "strengthens variant identity for organization-scoped supplier links",
      () => {
        expect(
          normalized(),
        ).toContain(
          "constraint product_variants_organization_id_unique unique ( organization_id, id )",
        );
      },
    );

    it(
      "persists canonical supplier fields",
      () => {
        const source =
          normalized();

        for (
          const field of [
            "organization_id uuid not null",
            "name text not null",
            "default_lead_time_days integer null",
            "currency text null",
            "email text null",
            "phone text null",
            "created_at timestamptz not null",
            "updated_at timestamptz not null",
          ]
        ) {
          expect(source).toContain(field);
        }
      },
    );

    it(
      "keeps suppliers organization-scoped rather than inventing store ownership",
      () => {
        const source =
          normalized();

        const supplierStart =
          source.indexOf(
            "create table public.suppliers",
          );

        const supplierProductStart =
          source.indexOf(
            "create table public.supplier_products",
          );

        const block =
          source.slice(
            supplierStart,
            supplierProductStart,
          );

        expect(block).not.toContain(
          "store_id",
        );
      },
    );

    it(
      "enforces supplier lead time semantics",
      () => {
        expect(
          normalized(),
        ).toContain(
          "default_lead_time_days is null or default_lead_time_days >= 0",
        );
      },
    );

    it(
      "persists canonical supplier-product fields",
      () => {
        const source =
          normalized();

        for (
          const field of [
            "supplier_id uuid not null",
            "variant_id uuid not null",
            "supplier_sku text null",
            "unit_cost_amount numeric null",
            "currency text null",
            "lead_time_days integer null",
            "minimum_order_quantity integer null",
            "pack_size integer null",
            "preferred boolean not null",
          ]
        ) {
          expect(source).toContain(field);
        }
      },
    );

    it(
      "enforces supplier-product organization ownership",
      () => {
        const source =
          normalized();

        expect(source).toContain(
          "foreign key ( organization_id, supplier_id ) references public.suppliers ( organization_id, id )",
        );

        expect(source).toContain(
          "foreign key ( organization_id, variant_id ) references public.product_variants ( organization_id, id )",
        );
      },
    );

    it(
      "enforces frozen supplier constraints",
      () => {
        const source =
          normalized();

        expect(source).toContain(
          "lead_time_days is null or lead_time_days >= 0",
        );

        expect(source).toContain(
          "minimum_order_quantity is null or minimum_order_quantity > 0",
        );

        expect(source).toContain(
          "pack_size is null or pack_size > 0",
        );
      },
    );

    it(
      "persists canonical purchase-order fields",
      () => {
        const source =
          normalized();

        for (
          const field of [
            "store_id uuid not null",
            "supplier_id uuid null",
            "external_reference text null",
            "status text not null",
            "ordered_at timestamptz null",
            "expected_at timestamptz null",
            "received_at timestamptz null",
            "currency text null",
            "source text not null",
          ]
        ) {
          expect(source).toContain(field);
        }
      },
    );

    it(
      "uses the frozen purchase-order status vocabulary",
      () => {
        const source =
          normalized();

        for (
          const status of [
            "'draft'",
            "'submitted'",
            "'confirmed'",
            "'partially_received'",
            "'received'",
            "'cancelled'",
            "'unknown'",
          ]
        ) {
          expect(source).toContain(status);
        }
      },
    );

    it(
      "allows unknown purchase-order supplier and dates",
      () => {
        const source =
          normalized();

        expect(source).toContain(
          "supplier_id uuid null",
        );

        expect(source).toContain(
          "ordered_at timestamptz null",
        );

        expect(source).toContain(
          "expected_at timestamptz null",
        );

        expect(source).toContain(
          "received_at timestamptz null",
        );
      },
    );

    it(
      "enforces purchase-order store and supplier ownership",
      () => {
        const source =
          normalized();

        expect(source).toContain(
          "foreign key ( organization_id, store_id ) references public.stores ( organization_id, id )",
        );

        expect(source).toContain(
          "foreign key ( organization_id, supplier_id ) references public.suppliers ( organization_id, id )",
        );
      },
    );

    it(
      "persists canonical purchase-order-item fields",
      () => {
        const source =
          normalized();

        for (
          const field of [
            "purchase_order_id uuid not null",
            "variant_id uuid not null",
            "destination_location_id uuid null",
            "ordered_quantity integer not null",
            "received_quantity integer null",
            "unit_cost_amount numeric null",
            "currency text null",
          ]
        ) {
          expect(source).toContain(field);
        }
      },
    );

    it(
      "enforces purchase-order-item ownership",
      () => {
        const source =
          normalized();

        expect(source).toContain(
          "foreign key ( organization_id, store_id, purchase_order_id ) references public.purchase_orders ( organization_id, store_id, id )",
        );

        expect(source).toContain(
          "foreign key ( organization_id, store_id, variant_id ) references public.product_variants ( organization_id, store_id, id )",
        );

        expect(source).toContain(
          "foreign key ( organization_id, store_id, destination_location_id ) references public.locations ( organization_id, store_id, id )",
        );
      },
    );

    it(
      "preserves whole-unit purchase-order quantities",
      () => {
        const source =
          normalized();

        expect(source).toContain(
          "ordered_quantity >= 0",
        );

        expect(source).toContain(
          "received_quantity is null or received_quantity >= 0",
        );
      },
    );

    it(
      "uses the frozen provider vocabulary",
      () => {
        const source =
          normalized();

        for (
          const provider of [
            "'csv'",
            "'shopify'",
            "'woocommerce'",
            "'square'",
            "'lightspeed'",
            "'other'",
          ]
        ) {
          expect(source).toContain(provider);
        }
      },
    );

    it(
      "protects canonical ownership during reconciliation",
      () => {
        const source =
          normalized();

        for (
          const trigger of [
            "suppliers_prevent_ownership_reassignment",
            "supplier_products_prevent_identity_reassignment",
            "purchase_orders_prevent_ownership_reassignment",
            "purchase_order_items_prevent_identity_reassignment",
          ]
        ) {
          expect(source).toContain(trigger);
        }
      },
    );

    it(
      "enables RLS fail-closed without M2.7 policies",
      () => {
        const source =
          normalized();

        for (
          const table of [
            "suppliers",
            "supplier_products",
            "purchase_orders",
            "purchase_order_items",
          ]
        ) {
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
      "does not introduce M2.6 integration tables",
      () => {
        const source =
          normalized();

        for (
          const table of [
            "integrations",
            "provider_bindings",
            "sync_runs",
          ]
        ) {
          expect(source).not.toContain(
            `create table public.${table}`,
          );
        }
      },
    );
  },
);
