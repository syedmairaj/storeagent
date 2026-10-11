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
  const files =
    fs.readdirSync(
      MIGRATION_DIRECTORY,
    );

  const matches =
    files.filter(
      (file) =>
        file.endsWith(
          "_m2_2_products_variants.sql",
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
  "StoreAgent M2.2 products and variants schema",
  () => {
    it(
      "creates exactly the M2.2 product tables",
      () => {
        const source =
          migration();

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
          "products",
          "product_variants",
        ]);
      },
    );

    it(
      "persists canonical product fields",
      () => {
        const source =
          normalized();

        for (
          const field of [
            "organization_id uuid not null",
            "store_id uuid not null",
            "title text not null",
            "brand text null",
            "category text null",
            "status text not null",
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
      "persists canonical product variant fields",
      () => {
        const source =
          normalized();

        for (
          const field of [
            "product_id uuid not null",
            "sku text not null",
            "barcode text null",
            "title text null",
            "cost_amount numeric null",
            "selling_price_amount numeric null",
            "currency text null",
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
      "uses the frozen product status vocabulary",
      () => {
        const source =
          normalized();

        expect(
          source,
        ).toContain(
          "constraint products_status_check",
        );

        for (
          const status of [
            "'active'",
            "'draft'",
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
      "uses the frozen variant status vocabulary",
      () => {
        const source =
          normalized();

        expect(
          source,
        ).toContain(
          "constraint product_variants_status_check",
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
      "enforces product store ownership structurally",
      () => {
        expect(
          normalized(),
        ).toContain(
          "foreign key ( organization_id, store_id ) references public.stores ( organization_id, id )",
        );
      },
    );

    it(
      "enforces variant product ownership by organization and store",
      () => {
        expect(
          normalized(),
        ).toContain(
          "foreign key ( organization_id, store_id, product_id ) references public.products ( organization_id, store_id, id )",
        );
      },
    );

    it(
      "provides composite ownership keys for downstream M2 entities",
      () => {
        const source =
          normalized();

        expect(
          source,
        ).toContain(
          "constraint products_organization_store_id_unique unique ( organization_id, store_id, id )",
        );

        expect(
          source,
        ).toContain(
          "constraint product_variants_organization_store_id_unique unique ( organization_id, store_id, id )",
        );
      },
    );

    it(
      "requires non-blank canonical product and SKU identity",
      () => {
        const source =
          normalized();

        expect(
          source,
        ).toContain(
          "constraint products_title_not_blank",
        );

        expect(
          source,
        ).toContain(
          "constraint product_variants_sku_not_blank",
        );
      },
    );

    it(
      "does not make SKU unique",
      () => {
        const source =
          normalized();

        expect(
          source.match(
            /unique\s*\([^)]*\bsku\b[^)]*\)/g,
          ),
        ).toBeNull();

        expect(
          source,
        ).toContain(
          "product_variants_organization_store_sku_idx",
        );
      },
    );

    it(
      "stores money with exact nullable numeric semantics",
      () => {
        const source =
          normalized();

        expect(
          source,
        ).toContain(
          "cost_amount numeric null",
        );

        expect(
          source,
        ).toContain(
          "selling_price_amount numeric null",
        );

        expect(
          source,
        ).toContain(
          "cost_amount is null or cost_amount >= 0",
        );

        expect(
          source,
        ).toContain(
          "selling_price_amount is null or selling_price_amount >= 0",
        );
      },
    );

    it(
      "does not cascade canonical business deletion",
      () => {
        expect(
          normalized(),
        ).not.toContain(
          "on delete cascade",
        );
      },
    );

    it(
      "maintains updated_at for current-state entities",
      () => {
        const source =
          normalized();

        expect(
          source,
        ).toContain(
          "create trigger products_set_updated_at",
        );

        expect(
          source,
        ).toContain(
          "create trigger product_variants_set_updated_at",
        );

        expect(
          source.match(
            /execute function public\.set_updated_at\(\)/g,
          ),
        ).toHaveLength(
          2,
        );
      },
    );

    it(
      "enables RLS fail-closed without prematurely adding M2.7 policies",
      () => {
        const source =
          normalized();

        expect(
          source,
        ).toContain(
          "alter table public.products enable row level security",
        );

        expect(
          source,
        ).toContain(
          "alter table public.product_variants enable row level security",
        );

        expect(
          source,
        ).not.toContain(
          "create policy",
        );
      },
    );

    it(
      "does not introduce later M2 persistence",
      () => {
        const source =
          normalized();

        for (
          const table of [
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
