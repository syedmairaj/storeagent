import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

const ROOT = process.cwd();

const migration =
  fs.readFileSync(
    path.join(
      ROOT,
      "supabase/migrations/20261011181500_m3_9_csv_atomic_reconciliation.sql",
    ),
    "utf8",
  );

describe(
  "M3.9 CSV atomic reconciliation persistence",
  () => {
    it(
      "defines one explicit RPC per bindable M3 current-state resource",
      () => {
        for (
          const fn of [
            "csv_reconcile_product",
            "csv_reconcile_product_variant",
            "csv_reconcile_order",
            "csv_reconcile_order_item",
            "csv_reconcile_supplier",
            "csv_reconcile_purchase_order",
            "csv_reconcile_purchase_order_item",
          ]
        ) {
          expect(
            migration,
          ).toContain(
            `function public.${fn}(`,
          );
        }
      },
    );

    it(
      "does not use dynamic SQL",
      () => {
        expect(
          migration.toLowerCase(),
        ).not.toContain(
          "execute format(",
        );

        expect(
          migration.toLowerCase(),
        ).not.toContain(
          "execute immediate",
        );
      },
    );

    it(
      "keeps RPCs CSV-only and active-integration scoped",
      () => {
        expect(
          migration,
        ).toContain(
          "i.provider = 'csv'",
        );

        expect(
          migration,
        ).toContain(
          "integration_status <> 'active'",
        );

        expect(
          migration,
        ).toContain(
          "CSV reconciliation requires active integration",
        );
      },
    );

    it(
      "requires store-scoped integration for store-scoped writes",
      () => {
        expect(
          migration,
        ).toContain(
          "CSV store-scoped reconciliation requires store-scoped integration",
        );

        expect(
          migration,
        ).toContain(
          "CSV reconciliation store does not match integration store",
        );
      },
    );

    it(
      "creates canonical row and first binding inside same RPC transaction",
      () => {
        expect(
          migration,
        ).toContain(
          "insert into public.products",
        );

        expect(
          migration,
        ).toContain(
          "insert into public.provider_bindings",
        );

        expect(
          migration,
        ).toContain(
          "'imported'::text",
        );
      },
    );

    it(
      "locks an existing durable binding before reconciliation",
      () => {
        const matches =
          migration.match(
            /from public\.provider_bindings pb[\s\S]*?for update;/g,
          ) ?? [];

        expect(
          matches.length,
        ).toBeGreaterThanOrEqual(
          7,
        );
      },
    );

    it(
      "never updates durable ProviderBinding identity",
      () => {
        const updates =
          migration.match(
            /update public\.provider_bindings[\s\S]*?;/g,
          ) ?? [];

        expect(
          updates.length,
        ).toBeGreaterThan(0);

        for (
          const statement
          of updates
        ) {
          expect(
            statement,
          ).toContain(
            "external_parent_id",
          );

          expect(
            statement,
          ).toContain(
            "source_metadata",
          );

          expect(
            statement,
          ).not.toContain(
            "canonical_entity_id =",
          );

          expect(
            statement,
          ).not.toContain(
            "external_id =",
          );

          expect(
            statement,
          ).not.toContain(
            "integration_id =",
          );

          expect(
            statement,
          ).not.toContain(
            "organization_id =",
          );

          expect(
            statement,
          ).not.toContain(
            "resource_type =",
          );
        }
      },
    );

    it(
      "treats product variant SKU as mutable commercial truth",
      () => {
        expect(
          migration,
        ).toContain(
          "existing_variant.sku is distinct from p_sku",
        );

        expect(
          migration,
        ).toContain(
          "sku = p_sku",
        );
      },
    );

    it(
      "prevents product variant canonical parent reassignment",
      () => {
        expect(
          migration,
        ).toContain(
          "existing_variant.product_id is distinct from p_product_id",
        );

        expect(
          migration,
        ).toContain(
          "CSV product variant canonical parent cannot be reassigned",
        );
      },
    );

    it(
      "prevents order-item canonical parent or variant reassignment",
      () => {
        expect(
          migration,
        ).toContain(
          "existing_item.order_id is distinct from p_order_id",
        );

        expect(
          migration,
        ).toContain(
          "existing_item.variant_id is distinct from p_variant_id",
        );
      },
    );

    it(
      "prevents PO-item canonical parent or variant reassignment",
      () => {
        expect(
          migration,
        ).toContain(
          "existing_item.purchase_order_id is distinct from p_purchase_order_id",
        );

        expect(
          migration,
        ).toContain(
          "CSV purchase order item canonical parent/variant cannot be reassigned",
        );
      },
    );

    it(
      "allows nullable purchase-order supplier",
      () => {
        expect(
          migration,
        ).toContain(
          "if p_supplier_id is not null then",
        );

        expect(
          migration,
        ).toContain(
          "supplier_id = p_supplier_id",
        );
      },
    );

    it(
      "does not implement inventory or supplier-product persistence in M3.9B",
      () => {
        expect(
          migration,
        ).not.toContain(
          "insert into public.inventory_snapshots",
        );

        expect(
          migration,
        ).not.toContain(
          "insert into public.supplier_products",
        );
      },
    );

    it(
      "keeps RPC execution away from browser roles",
      () => {
        expect(
          migration,
        ).toContain(
          "from public, anon, authenticated",
        );

        expect(
          migration,
        ).toContain(
          "to service_role",
        );
      },
    );

    it(
      "uses no AI metrics forecast decisions or billing dependencies",
      () => {
        const forbidden = [
          "openai",
          "anthropic",
          "forecast",
          "recommended_quantity",
          "reorder_point",
          "stripe",
        ];

        for (
          const term
          of forbidden
        ) {
          expect(
            migration.toLowerCase(),
          ).not.toContain(
            term,
          );
        }
      },
    );
  },
);
