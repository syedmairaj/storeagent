export type CsvImportLane =
  | "product"
  | "supplier"
  | "order"
  | "product_variant"
  | "purchase_order"
  | "inventory_snapshot"
  | "supplier_product"
  | "order_item"
  | "purchase_order_item";

export const CSV_IMPORT_DEPENDENCIES: Readonly<
  Record<CsvImportLane, readonly CsvImportLane[]>
> = {
  product: [],

  supplier: [],

  order: [],

  product_variant: ["product"],

  purchase_order: ["supplier"],

  inventory_snapshot: ["product_variant"],

  supplier_product: ["supplier", "product_variant"],

  order_item: ["order", "product_variant"],

  purchase_order_item: ["purchase_order", "product_variant"],
};

export const CSV_IMPORT_LANE_ORDER: readonly CsvImportLane[] = [
  "product",
  "supplier",
  "order",
  "product_variant",
  "purchase_order",
  "inventory_snapshot",
  "supplier_product",
  "order_item",
  "purchase_order_item",
];

const laneRank = new Map<CsvImportLane, number>(
  CSV_IMPORT_LANE_ORDER.map((lane, index) => [lane, index]),
);

export function csvImportLaneRank(lane: CsvImportLane): number {
  const rank = laneRank.get(lane);

  if (rank === undefined) {
    throw new Error(`Unknown CSV import lane "${lane}".`);
  }

  return rank;
}

export function assertCsvImportDependencyPlanValid(): void {
  const seen = new Set<CsvImportLane>();

  if (
    CSV_IMPORT_LANE_ORDER.length !== Object.keys(CSV_IMPORT_DEPENDENCIES).length
  ) {
    throw new Error(
      "CSV import lane order must contain every dependency lane exactly once.",
    );
  }

  for (const lane of CSV_IMPORT_LANE_ORDER) {
    if (seen.has(lane)) {
      throw new Error(`CSV import lane "${lane}" appears more than once.`);
    }

    seen.add(lane);

    for (const dependency of CSV_IMPORT_DEPENDENCIES[lane]) {
      if (!seen.has(dependency)) {
        throw new Error(
          `CSV import lane "${lane}" appears before dependency "${dependency}".`,
        );
      }
    }
  }
}

export interface CsvDependencyTask<TResult> {
  lane: CsvImportLane;

  execute: () => Promise<TResult>;
}

export interface CsvExecutedDependencyTask<TResult> {
  lane: CsvImportLane;

  result: TResult;
}

export function orderCsvDependencyTasks<TResult>(
  tasks: readonly CsvDependencyTask<TResult>[],
): CsvDependencyTask<TResult>[] {
  assertCsvImportDependencyPlanValid();

  return tasks
    .map((task, inputIndex) => ({
      task,
      inputIndex,
    }))
    .sort((left, right) => {
      const rankDifference =
        csvImportLaneRank(left.task.lane) - csvImportLaneRank(right.task.lane);

      if (rankDifference !== 0) {
        return rankDifference;
      }

      // Preserve original row/file order inside one lane.
      return left.inputIndex - right.inputIndex;
    })
    .map(({ task }) => task);
}

export async function executeCsvDependencyPlan<TResult>(
  tasks: readonly CsvDependencyTask<TResult>[],
): Promise<CsvExecutedDependencyTask<TResult>[]> {
  const ordered = orderCsvDependencyTasks(tasks);

  const executed: CsvExecutedDependencyTask<TResult>[] = [];

  // Deliberately sequential for M3.
  //
  // Parent/binding-producing lanes must complete before dependent
  // reconciliation starts. Parallelism can be considered only after
  // correctness and replay semantics are proven.
  for (const task of ordered) {
    executed.push({
      lane: task.lane,

      result: await task.execute(),
    });
  }

  return executed;
}
