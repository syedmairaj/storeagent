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
          "_m2_4_orders_demand.sql",
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
  "StoreAgent M2.4 orders and demand schema",
  () => {
    it(
      "creates exactly the M2.4 commerce-history tables",
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
          "orders",
          "order_items",
          "return_refunds",
        ]);
      },
    );

    it(
      "persists canonical order fields",
      () => {
        const source =
          normalized();

        for (
          const field of [
            "organization_id uuid not null",
            "store_id uuid not null",
            "external_reference text null",
            "status text not null",
            "ordered_at timestamptz not null",
            "currency text not null",
            "gross_amount numeric null",
            "discount_amount numeric null",
            "net_amount numeric null",
            "source text not null",
            "created_at timestamptz not null",
          ]
        ) {
          expect(source).toContain(field);
        }
      },
    );

    it(
      "uses the frozen order-status vocabulary",
      () => {
        const source =
          normalized();

        for (
          const status of [
            "'pending'",
            "'open'",
            "'completed'",
            "'cancelled'",
            "'refunded'",
            "'partially_refunded'",
            "'unknown'",
          ]
        ) {
          expect(source).toContain(status);
        }
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
      "enforces order store ownership",
      () => {
        expect(
          normalized(),
        ).toContain(
          "foreign key ( organization_id, store_id ) references public.stores ( organization_id, id )",
        );
      },
    );

    it(
      "persists canonical order-item fields",
      () => {
        const source =
          normalized();

        for (
          const field of [
            "order_id uuid not null",
            "variant_id uuid not null",
            "location_id uuid null",
            "quantity integer not null",
            "unit_price_amount numeric null",
            "discount_amount numeric null",
            "unit_cost_amount numeric null",
            "currency text null",
          ]
        ) {
          expect(source).toContain(field);
        }
      },
    );

    it(
      "enforces order-item order ownership",
      () => {
        expect(
          normalized(),
        ).toContain(
          "foreign key ( organization_id, store_id, order_id ) references public.orders ( organization_id, store_id, id )",
        );
      },
    );

    it(
      "enforces order-item variant ownership",
      () => {
        expect(
          normalized(),
        ).toContain(
          "foreign key ( organization_id, store_id, variant_id ) references public.product_variants ( organization_id, store_id, id )",
        );
      },
    );

    it(
      "enforces optional location ownership",
      () => {
        expect(
          normalized(),
        ).toContain(
          "foreign key ( organization_id, store_id, location_id ) references public.locations ( organization_id, store_id, id )",
        );
      },
    );

    it(
      "provides a composite refund ownership target",
      () => {
        expect(
          normalized(),
        ).toContain(
          "constraint order_items_refund_ownership_unique unique ( organization_id, store_id, order_id, variant_id, id )",
        );
      },
    );

    it(
      "persists canonical return/refund fields",
      () => {
        const source =
          normalized();

        for (
          const field of [
            "order_item_id uuid null",
            "returned_quantity integer null",
            "refunded_amount numeric null",
            "reason text null",
            "occurred_at timestamptz not null",
          ]
        ) {
          expect(source).toContain(field);
        }
      },
    );

    it(
      "ties return/refund order items to the same order and variant",
      () => {
        expect(
          normalized(),
        ).toContain(
          "foreign key ( organization_id, store_id, order_id, variant_id, order_item_id ) references public.order_items ( organization_id, store_id, order_id, variant_id, id )",
        );
      },
    );

    it(
      "keeps quantity persistence whole-unit and non-negative",
      () => {
        const source =
          normalized();

        expect(source).toContain(
          "quantity integer not null",
        );

        expect(source).toContain(
          "quantity >= 0",
        );

        expect(source).toContain(
          "returned_quantity is null or returned_quantity >= 0",
        );
      },
    );

    it(
      "keeps external reference non-unique",
      () => {
        const source =
          normalized();

        expect(source).toContain(
          "orders_external_reference_idx",
        );

        expect(
          source.match(
            /unique\s*\([^)]*external_reference[^)]*\)/g,
          ),
        ).toBeNull();
      },
    );

    it(
      "prevents canonical ownership reassignment",
      () => {
        const source =
          normalized();

        expect(source).toContain(
          "orders_prevent_ownership_reassignment",
        );

        expect(source).toContain(
          "order_items_prevent_identity_reassignment",
        );

        expect(source).toContain(
          "return_refunds_prevent_identity_reassignment",
        );
      },
    );

    it(
      "enables RLS fail-closed on all M2.4 tables",
      () => {
        const source =
          normalized();

        for (
          const table of [
            "orders",
            "order_items",
            "return_refunds",
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
      "does not introduce later M2 tables",
      () => {
        const source =
          normalized();

        for (
          const table of [
            "suppliers",
            "supplier_products",
            "purchase_orders",
            "purchase_order_items",
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
