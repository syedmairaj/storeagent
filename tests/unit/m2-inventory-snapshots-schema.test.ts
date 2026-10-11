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
          "_m2_3_inventory_snapshots.sql",
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
  "StoreAgent M2.3 inventory snapshot schema",
  () => {
    it(
      "creates exactly the M2.3 canonical inventory table",
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
          "inventory_snapshots",
        ]);
      },
    );

    it(
      "persists the canonical inventory snapshot fields",
      () => {
        const source =
          normalized();

        for (
          const field of [
            "organization_id uuid not null",
            "store_id uuid not null",
            "location_id uuid not null",
            "variant_id uuid not null",
            "observed_at timestamptz not null",
            "on_hand_quantity integer null",
            "available_quantity integer null",
            "committed_quantity integer null",
            "incoming_quantity integer null",
            "source text not null",
            "created_at timestamptz not null",
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
      "does not add mutable updated_at state to inventory history",
      () => {
        expect(
          normalized(),
        ).not.toContain(
          "updated_at",
        );
      },
    );

    it(
      "strengthens location ownership for organization and store",
      () => {
        expect(
          normalized(),
        ).toContain(
          "constraint locations_organization_store_id_unique unique ( organization_id, store_id, id )",
        );
      },
    );

    it(
      "enforces snapshot store ownership",
      () => {
        expect(
          normalized(),
        ).toContain(
          "foreign key ( organization_id, store_id ) references public.stores ( organization_id, id )",
        );
      },
    );

    it(
      "enforces location ownership by organization and store",
      () => {
        expect(
          normalized(),
        ).toContain(
          "foreign key ( organization_id, store_id, location_id ) references public.locations ( organization_id, store_id, id )",
        );
      },
    );

    it(
      "enforces variant ownership by organization and store",
      () => {
        expect(
          normalized(),
        ).toContain(
          "foreign key ( organization_id, store_id, variant_id ) references public.product_variants ( organization_id, store_id, id )",
        );
      },
    );

    it(
      "keeps all observed quantities nullable",
      () => {
        const source =
          normalized();

        for (
          const field of [
            "on_hand_quantity integer null",
            "available_quantity integer null",
            "committed_quantity integer null",
            "incoming_quantity integer null",
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
      "requires known quantities to be non-negative",
      () => {
        const source =
          normalized();

        for (
          const constraint of [
            "on_hand_quantity is null or on_hand_quantity >= 0",
            "available_quantity is null or available_quantity >= 0",
            "committed_quantity is null or committed_quantity >= 0",
            "incoming_quantity is null or incoming_quantity >= 0",
          ]
        ) {
          expect(
            source,
          ).toContain(
            constraint,
          );
        }
      },
    );

    it(
      "uses integer persistence for whole-unit inventory",
      () => {
        const source =
          normalized();

        expect(
          source,
        ).not.toContain(
          "on_hand_quantity numeric",
        );

        expect(
          source,
        ).not.toContain(
          "available_quantity numeric",
        );
      },
    );

    it(
      "uses the frozen provider vocabulary for provenance",
      () => {
        const source =
          normalized();

        expect(
          source,
        ).toContain(
          "constraint inventory_snapshots_source_check",
        );

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
          expect(
            source,
          ).toContain(
            provider,
          );
        }
      },
    );

    it(
      "makes inventory history immutable at the database layer",
      () => {
        const source =
          normalized();

        expect(
          source,
        ).toContain(
          "create or replace function public.prevent_inventory_snapshot_mutation()",
        );

        expect(
          source,
        ).toContain(
          "create trigger inventory_snapshots_prevent_update",
        );

        expect(
          source,
        ).toContain(
          "create trigger inventory_snapshots_prevent_delete",
        );
      },
    );

    it(
      "indexes chronological inventory evidence",
      () => {
        const source =
          normalized();

        expect(
          source,
        ).toContain(
          "inventory_snapshots_variant_observed_idx",
        );

        expect(
          source,
        ).toContain(
          "inventory_snapshots_location_observed_idx",
        );

        expect(
          source,
        ).toContain(
          "observed_at desc",
        );
      },
    );

    it(
      "enables RLS fail-closed without adding M2.7 policies",
      () => {
        const source =
          normalized();

        expect(
          source,
        ).toContain(
          "alter table public.inventory_snapshots enable row level security",
        );

        expect(
          source,
        ).not.toContain(
          "create policy",
        );
      },
    );

    it(
      "does not introduce later M2 commerce tables",
      () => {
        const source =
          normalized();

        for (
          const table of [
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
