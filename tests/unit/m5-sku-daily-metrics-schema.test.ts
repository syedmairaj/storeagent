import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

const ROOT = process.cwd();

function migration(): string {
  return fs.readFileSync(
    path.join(
      ROOT,
      "supabase/migrations/20261014100000_m5_2_sku_daily_metrics.sql",
    ),
    "utf8",
  );
}

function normalized(): string {
  return migration().replace(/\s+/g, " ").toLowerCase();
}

const REASON_CODES = [
  "no_eligible_days",
  "demand_unknown",
  "zero_demand",
  "inventory_unknown",
  "safety_stock_days_unknown",
  "safety_stock_unknown",
  "lead_time_unknown",
  "review_period_unknown",
  "target_stock_unknown",
  "incoming_state_unknown",
  "sell_through_denominator_zero",
  "inventory_age_unknown",
  "trend_input_unknown",
  "purchase_order_status_unknown",
  "received_quantity_unknown",
  "received_exceeds_ordered",
] as const;

function tableBody(sql: string): string {
  const token = "create table public.sku_daily_metrics";
  const tableStart = sql.indexOf(token);

  if (tableStart < 0) {
    throw new Error("sku_daily_metrics table body was not found");
  }

  const open = sql.indexOf("(", tableStart);

  if (open < 0) {
    throw new Error("sku_daily_metrics table body was not found");
  }

  let depth = 0;

  for (let index = open; index < sql.length; index += 1) {
    const character = sql[index];

    if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      depth -= 1;

      if (depth === 0) {
        return sql.slice(open + 1, index);
      }
    }
  }

  throw new Error("sku_daily_metrics table body was not found");
}

function topLevelDeclarations(body: string): string[] {
  const declarations: string[] = [];
  let depth = 0;
  let current = "";

  for (const character of body) {
    if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      depth -= 1;
    }

    if (character === "," && depth === 0) {
      declarations.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  if (current.trim().length > 0) {
    declarations.push(current.trim());
  }

  return declarations;
}

function persistedColumnNames(sql: string): string[] {
  return topLevelDeclarations(tableBody(sql))
    .filter((declaration) => !declaration.startsWith("constraint "))
    .map((declaration) => declaration.split(/\s+/)[0] ?? "");
}

describe("M5.2 sku daily metrics schema", () => {
  const source = migration();
  const sql = normalized();

  it("creates one location-scoped derived metrics table", () => {
    expect(sql).toContain(
      "create table public.sku_daily_metrics",
    );
    expect(sql).toContain("location_id uuid not null");
    expect(sql).toContain("metric_date date not null");
    expect(sql).toContain("algorithm_version text not null");
    expect(sql).toContain(
      "constraint sku_daily_metrics_natural_key unique ( organization_id, store_id, location_id, variant_id, metric_date, algorithm_version )",
    );
  });

  it("uses composite tenant ownership foreign keys", () => {
    expect(sql).toContain(
      "foreign key ( organization_id, store_id ) references public.stores ( organization_id, id )",
    );
    expect(sql).toContain(
      "foreign key ( organization_id, store_id, location_id ) references public.locations ( organization_id, store_id, id )",
    );
    expect(sql).toContain(
      "foreign key ( organization_id, store_id, variant_id ) references public.product_variants ( organization_id, store_id, id )",
    );
  });

  it("stores frozen metric results without zero defaults or later-milestone fields", () => {
    for (const column of [
      "units_sold integer not null",
      "returned_units integer not null",
      "net_units_sold integer not null",
      "eligible_days_7d integer not null",
      "eligible_days_14d integer not null",
      "eligible_days_30d integer not null",
      "eligible_days_90d integer not null",
      "coverage_ratio_7d numeric not null",
      "coverage_ratio_14d numeric not null",
      "coverage_ratio_30d numeric not null",
      "coverage_ratio_90d numeric not null",
      "sales_velocity_7d numeric null",
      "sales_velocity_14d numeric null",
      "sales_velocity_30d numeric null",
      "sales_velocity_90d numeric null",
      "available_quantity integer null",
      "eligible_incoming_quantity integer null",
      "inventory_position integer null",
      "days_of_stock numeric null",
      "sell_through_rate numeric null",
      "safety_stock integer null",
      "reorder_point integer null",
      "target_stock integer null",
    ]) {
      expect(sql).toContain(column);
    }

    expect(sql).not.toContain("default 0");
    expect(sql).toContain("coverage_ratio_7d numeric not null");
    expect(sql).not.toContain("coverage_ratio_7d double");
    expect(sql).not.toContain("coverage_ratio_7d real");
    expect(sql).not.toContain("coverage_ratio_7d float");
    expect(sql).toContain(
      "net_units_sold = greatest( 0, units_sold - returned_units )",
    );
    expect(sql).not.toContain("pg_catalog.greatest");

    const columns = persistedColumnNames(sql);
    const domainNames = [
      ...sql.matchAll(/create domain public\.([a-z0-9_]+)/g),
    ].map((match) => match[1] ?? "");

    for (const forbidden of [
      "revenue",
      "forecast",
      "confidence",
      "recommended_order",
      "decision",
      "action",
      "stockout_probability",
      "supplier_selection",
    ]) {
      expect(columns.join(" ")).not.toContain(forbidden);
      expect(domainNames.join(" ")).not.toContain(forbidden);
    }
  });

  it("keeps unknown results null and bounds frozen ratios", () => {
    expect(sql).toContain(
      "(sales_velocity_30d is null) = (sales_velocity_30d_reason_code is not null)",
    );
    expect(sql).toContain(
      "sales_velocity_30d is not null or ( safety_stock is null and reorder_point is null and target_stock is null and days_of_stock is null )",
    );
    expect(sql).toContain(
      "sales_velocity_30d is distinct from 0 or ( days_of_stock is null and days_of_stock_reason_code = 'zero_demand' )",
    );
    expect(sql).toContain(
      "(eligible_incoming_quantity is null) = (eligible_incoming_reason_code is not null)",
    );
    expect(sql).toContain(
      "inventory_position = available_quantity + eligible_incoming_quantity",
    );
    expect(sql).toContain(
      "sell_through_rate >= 0 and sell_through_rate <= 1",
    );
    expect(sql).toContain(
      "sell_through_rate is not null and sell_through_reason_code is null",
    );
    expect(sql).toContain(
      "sell_through_reason_code = 'sell_through_denominator_zero'",
    );
    expect(sql).toContain("coverage_ratio_7d * 7 = eligible_days_7d");
    expect(sql).toContain("coverage_ratio_14d * 14 = eligible_days_14d");
    expect(sql).toContain("coverage_ratio_30d * 30 = eligible_days_30d");
    expect(sql).toContain("coverage_ratio_90d * 90 = eligible_days_90d");
    expect(sql).toContain(
      "demand_trend in ( 'rising', 'stable', 'falling', 'unknown' )",
    );

    const vocabulary = sql.match(
      /constraint sku_daily_metric_reason_code_vocabulary check \( value in \(([^)]*)\) \)/,
    );

    expect(vocabulary).not.toBeNull();
    expect(
      vocabulary?.[1]
        ?.match(/'([^']+)'/g)
        ?.map((code) => code.slice(1, -1)),
    ).toEqual([...REASON_CODES]);
    expect(source).not.toContain("STOCK_COVERAGE_UNKNOWN");
    expect(sql).not.toContain("stock_coverage_unknown");
  });

  it("allows recompute of one version and isolates browser reads", () => {
    expect(sql).not.toContain("prevent_sku_daily_metric");
    expect(sql).toContain(
      "execute function public.set_updated_at()",
    );
    expect(sql).toContain(
      "alter table public.sku_daily_metrics enable row level security",
    );
    expect(sql).toContain(
      "revoke all on table public.sku_daily_metrics from anon",
    );
    expect(sql).toContain(
      "grant select on table public.sku_daily_metrics to authenticated",
    );
    expect(sql).toContain(
      "revoke insert, update, delete, truncate, references, trigger on table public.sku_daily_metrics from authenticated",
    );
    expect(sql.match(/create policy/g)).toHaveLength(1);
    expect(sql).toContain(
      "create policy sku_daily_metrics_select_member on public.sku_daily_metrics for select to authenticated",
    );
    expect(sql).toContain("membership.user_id = (select auth.uid())");
    expect(sql).not.toContain("for insert");
    expect(sql).not.toContain("for update");
    expect(sql).not.toContain("for delete");
    expect(sql).not.toContain("create function");
  });
});
