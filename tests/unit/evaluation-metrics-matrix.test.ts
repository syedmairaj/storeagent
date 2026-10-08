import {
  describe,
  expect,
  it,
} from "vitest";

import {
  METRICS_V1_MATRIX,
} from "@/tests/evaluation/metrics-matrix";

import {
  runMetricsEvaluationCase,
} from "@/tests/evaluation/metrics-runner";

describe("StoreAgent metrics-v1 evaluation matrix", () => {
  for (
    const scenario
    of METRICS_V1_MATRIX
  ) {
    it(
      scenario.id,
      () => {
        expect(
          runMetricsEvaluationCase(
            scenario.evaluation,
          ),
        ).toEqual(
          scenario.evaluation.expected,
        );
      },
    );
  }

  it("contains unique stable scenario IDs", () => {
    const ids =
      METRICS_V1_MATRIX.map(
        (scenario) =>
          scenario.id,
      );

    expect(
      new Set(ids).size,
    ).toBe(
      ids.length,
    );
  });

  it("requires every scenario to identify the invariant it protects", () => {
    for (
      const scenario
      of METRICS_V1_MATRIX
    ) {
      expect(
        scenario.protects.trim().length,
      ).toBeGreaterThan(0);
    }
  });

  it("contains critical known-zero versus unknown coverage", () => {
    const ids =
      new Set(
        METRICS_V1_MATRIX.map(
          (scenario) =>
            scenario.id,
        ),
      );

    expect(
      ids.has(
        "metrics/days-of-stock-known-zero-inventory-v1",
      ),
    ).toBe(true);

    expect(
      ids.has(
        "metrics/days-of-stock-unknown-inventory-v1",
      ),
    ).toBe(true);

    expect(
      ids.has(
        "metrics/order-quantity-known-zero-incoming-v1",
      ),
    ).toBe(true);

    expect(
      ids.has(
        "metrics/order-quantity-unknown-incoming-v1",
      ),
    ).toBe(true);
  });

  it("contains explicit risk-boundary scenarios", () => {
    const ids =
      new Set(
        METRICS_V1_MATRIX.map(
          (scenario) =>
            scenario.id,
        ),
      );

    for (
      const id of [
        "metrics/stockout-risk-lead-time-boundary-v1",
        "metrics/stockout-risk-horizon-boundary-v1",
        "metrics/overstock-risk-target-boundary-v1",
        "metrics/overstock-risk-high-boundary-v1",
      ]
    ) {
      expect(
        ids.has(id),
        `Missing ${id}`,
      ).toBe(true);
    }
  });

  it("contains fail-closed incoming inventory scenarios", () => {
    const ids =
      new Set(
        METRICS_V1_MATRIX.map(
          (scenario) =>
            scenario.id,
        ),
      );

    for (
      const id of [
        "metrics/po-partial-unknown-received-v1",
        "metrics/po-unknown-status-v1",
        "metrics/po-over-received-v1",
        "metrics/po-aggregate-ambiguous-v1",
      ]
    ) {
      expect(
        ids.has(id),
        `Missing ${id}`,
      ).toBe(true);
    }
  });
});
