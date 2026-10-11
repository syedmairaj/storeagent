import { describe, expect, it, vi } from "vitest";

import {
  assertCsvImportDependencyPlanValid,
  CSV_IMPORT_DEPENDENCIES,
  CSV_IMPORT_LANE_ORDER,
  csvImportLaneRank,
  executeCsvDependencyPlan,
  orderCsvDependencyTasks,
} from "@/lib/providers/csv/dependency-plan";

describe("CSV dependency plan", () => {
  it("keeps every dependency before its dependent lane", () => {
    expect(() => assertCsvImportDependencyPlanValid()).not.toThrow();

    for (const lane of CSV_IMPORT_LANE_ORDER) {
      for (const dependency of CSV_IMPORT_DEPENDENCIES[lane]) {
        expect(csvImportLaneRank(dependency)).toBeLessThan(
          csvImportLaneRank(lane),
        );
      }
    }
  });

  it("requires product before product variant", () => {
    expect(CSV_IMPORT_DEPENDENCIES.product_variant).toEqual(["product"]);
  });

  it("requires both supplier and variant before supplier product", () => {
    expect(CSV_IMPORT_DEPENDENCIES.supplier_product).toEqual([
      "supplier",
      "product_variant",
    ]);
  });

  it("requires order and variant before order item", () => {
    expect(CSV_IMPORT_DEPENDENCIES.order_item).toEqual([
      "order",
      "product_variant",
    ]);
  });

  it("requires purchase order and variant before purchase-order item", () => {
    expect(CSV_IMPORT_DEPENDENCIES.purchase_order_item).toEqual([
      "purchase_order",
      "product_variant",
    ]);
  });

  it("sorts mixed tasks into deterministic dependency order", () => {
    const noop = async () => "ok";

    const ordered = orderCsvDependencyTasks([
      {
        lane: "order_item",
        execute: noop,
      },
      {
        lane: "inventory_snapshot",
        execute: noop,
      },
      {
        lane: "product_variant",
        execute: noop,
      },
      {
        lane: "order",
        execute: noop,
      },
      {
        lane: "product",
        execute: noop,
      },
      {
        lane: "supplier_product",
        execute: noop,
      },
      {
        lane: "supplier",
        execute: noop,
      },
    ]);

    expect(ordered.map((task) => task.lane)).toEqual([
      "product",
      "supplier",
      "order",
      "product_variant",
      "inventory_snapshot",
      "supplier_product",
      "order_item",
    ]);
  });

  it("preserves original order inside the same lane", () => {
    const first = vi.fn(async () => "first");

    const second = vi.fn(async () => "second");

    const ordered = orderCsvDependencyTasks([
      {
        lane: "product",
        execute: first,
      },
      {
        lane: "product",
        execute: second,
      },
    ]);

    expect(ordered[0]?.execute).toBe(first);

    expect(ordered[1]?.execute).toBe(second);
  });

  it("executes tasks sequentially in dependency order", async () => {
    const trace: string[] = [];

    const task = (label: string) => async () => {
      trace.push(`start:${label}`);

      await Promise.resolve();

      trace.push(`end:${label}`);

      return label;
    };

    const results = await executeCsvDependencyPlan([
      {
        lane: "purchase_order_item",
        execute: task("po-item"),
      },
      {
        lane: "purchase_order",
        execute: task("po"),
      },
      {
        lane: "supplier",
        execute: task("supplier"),
      },
      {
        lane: "product_variant",
        execute: task("variant"),
      },
      {
        lane: "product",
        execute: task("product"),
      },
    ]);

    expect(results.map((entry) => entry.lane)).toEqual([
      "product",
      "supplier",
      "product_variant",
      "purchase_order",
      "purchase_order_item",
    ]);

    expect(trace).toEqual([
      "start:product",
      "end:product",

      "start:supplier",
      "end:supplier",

      "start:variant",
      "end:variant",

      "start:po",
      "end:po",

      "start:po-item",
      "end:po-item",
    ]);
  });
});
