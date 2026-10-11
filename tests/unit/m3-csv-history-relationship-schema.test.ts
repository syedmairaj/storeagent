import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

const migration =
  fs.readFileSync(
    path.join(
      process.cwd(),
      "supabase/migrations/20261011184500_m3_9_csv_history_relationship_reconciliation.sql",
    ),
    "utf8",
  );

describe(
  "M3.9 CSV history and relationship persistence",
  () => {
    it(
      "defines inventory append and supplier-product reconciliation RPCs",
      () => {
        expect(
          migration,
        ).toContain(
          "function public.csv_append_inventory_snapshot(",
        );

        expect(
          migration,
        ).toContain(
          "function public.csv_reconcile_supplier_product(",
        );
      },
    );

    it(
      "keeps inventory append-only",
      () => {
        expect(
          migration,
        ).toContain(
          "insert into public.inventory_snapshots",
        );

        expect(
          migration,
        ).not.toContain(
          "update public.inventory_snapshots",
        );

        expect(
          migration,
        ).not.toContain(
          "delete from public.inventory_snapshots",
        );
      },
    );

    it(
      "does not invent inventory ProviderBindings",
      () => {
        const inventoryBlock =
          migration.slice(
            migration.indexOf(
              "create or replace function public.csv_append_inventory_snapshot",
            ),
            migration.indexOf(
              "create or replace function public.csv_reconcile_supplier_product",
            ),
          );

        expect(
          inventoryBlock,
        ).not.toContain(
          "provider_bindings",
        );
      },
    );

    it(
      "does not invent DB uniqueness for CSV inventory observation replay",
      () => {
        expect(
          migration,
        ).not.toContain(
          "inventory_snapshots_csv_observation_unique",
        );
      },
    );

    it(
      "validates inventory variant and location against trusted store scope",
      () => {
        expect(
          migration,
        ).toContain(
          "CSV inventory variant is outside trusted scope",
        );

        expect(
          migration,
        ).toContain(
          "CSV inventory location is outside trusted scope",
        );
      },
    );

    it(
      "uses canonical supplier-product relation rather than ProviderBinding",
      () => {
        const supplierProductBlock =
          migration.slice(
            migration.indexOf(
              "create or replace function public.csv_reconcile_supplier_product",
            ),
          );

        expect(
          supplierProductBlock,
        ).toContain(
          "public.supplier_products",
        );

        expect(
          supplierProductBlock,
        ).not.toContain(
          "insert into public.provider_bindings",
        );
      },
    );

    it(
      "reconciles supplier-product mutable commercial terms",
      () => {
        for (
          const field of [
            "supplier_sku",
            "unit_cost_amount",
            "currency",
            "lead_time_days",
            "minimum_order_quantity",
            "pack_size",
            "preferred",
          ]
        ) {
          expect(
            migration,
          ).toContain(
            `${field} =`,
          );
        }
      },
    );

    it(
      "keeps both RPCs service-role only",
      () => {
        expect(
          migration.match(
            /from public, anon, authenticated/g,
          )?.length,
        ).toBe(2);

        expect(
          migration.match(
            /to service_role/g,
          )?.length,
        ).toBe(2);
      },
    );

    it(
      "uses no dynamic SQL",
      () => {
        expect(
          migration.toLowerCase(),
        ).not.toContain(
          "execute format(",
        );
      },
    );
  },
);
