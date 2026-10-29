import {
  describe,
  expect,
  it,
} from "vitest";

import {
  buildForecastSkuDemandInput,
} from "@/lib/forecasting/commerce-facts";

import {
  resolveDayDataComplete,
  resolvePromotionState,
  type CommerceDayCoverageEvidence,
  type CommerceDayPromotionEvidence,
} from "@/lib/forecasting/evidence";

import {
  forecastSkuDemand,
} from "@/lib/forecasting/orchestrate";

import {
  shiftForecastDate,
  type ForecastGrain,
} from "@/lib/forecasting/series";

const GRAIN: ForecastGrain = {
  organizationId: "org-a",
  storeId: "store-a",
  locationId: "loc-a",
  variantId: "var-a",
};

const AS_OF = "2026-06-15";
const DAY = "2026-06-15";

function promo(
  overrides: Partial<CommerceDayPromotionEvidence> &
    Pick<CommerceDayPromotionEvidence, "evidenceId" | "state">,
): CommerceDayPromotionEvidence {
  return {
    organizationId: GRAIN.organizationId,
    storeId: GRAIN.storeId,
    locationId: null,
    variantId: null,
    localDate: DAY,
    trust: "trusted_provider",
    source: "provider:promo_calendar",
    observedAt: "2026-06-16T00:00:00.000Z",
    version: 1,
    invalidatedAt: null,
    supersedesEvidenceId: null,
    ...overrides,
  };
}

function coverage(
  overrides: Partial<CommerceDayCoverageEvidence> &
    Pick<
      CommerceDayCoverageEvidence,
      "evidenceId" | "stream"
    >,
): CommerceDayCoverageEvidence {
  return {
    organizationId: GRAIN.organizationId,
    storeId: GRAIN.storeId,
    locationId: null,
    variantId: null,
    localDate: DAY,
    coverage: "complete",
    trust: "trusted_provider",
    source: "provider:sync_attestation",
    asOf: "2026-06-16T00:00:00.000Z",
    observedAt: "2026-06-16T00:00:00.000Z",
    version: 1,
    invalidatedAt: null,
    supersedesEvidenceId: null,
    ...overrides,
  };
}

function bothStreamsComplete(
  prefix: string,
): CommerceDayCoverageEvidence[] {
  return [
    coverage({ evidenceId: `${prefix}-orders`, stream: "orders" }),
    coverage({ evidenceId: `${prefix}-returns`, stream: "returns" }),
  ];
}

describe("M6 forecast evidence resolvers", () => {
  it("resolves trusted none and promotion independently of input order", () => {
    const noneFirst = resolvePromotionState({
      grain: GRAIN,
      localDate: DAY,
      evidence: [
        promo({ evidenceId: "b", state: "none" }),
        promo({ evidenceId: "a", state: "none", version: 2 }),
      ],
    });
    const noneSecond = resolvePromotionState({
      grain: GRAIN,
      localDate: DAY,
      evidence: [
        promo({ evidenceId: "a", state: "none", version: 2 }),
        promo({ evidenceId: "b", state: "none" }),
      ],
    });

    expect(noneFirst).toBe("none");
    expect(noneSecond).toBe("none");

    expect(
      resolvePromotionState({
        grain: GRAIN,
        localDate: DAY,
        evidence: [promo({ evidenceId: "p", state: "promotion" })],
      }),
    ).toBe("promotion");
  });

  it("returns unknown when evidence is missing", () => {
    expect(
      resolvePromotionState({
        grain: GRAIN,
        localDate: DAY,
        evidence: [],
      }),
    ).toBe("unknown");
  });

  it("returns unknown on conflicting same-specificity states", () => {
    expect(
      resolvePromotionState({
        grain: GRAIN,
        localDate: DAY,
        evidence: [
          promo({ evidenceId: "a", state: "none" }),
          promo({
            evidenceId: "b",
            state: "promotion",
            source: "merchant:attestation",
            trust: "verified_merchant_attestation",
          }),
        ],
      }),
    ).toBe("unknown");
  });

  it("returns unknown when broader and narrower scopes conflict", () => {
    expect(
      resolvePromotionState({
        grain: GRAIN,
        localDate: DAY,
        evidence: [
          promo({ evidenceId: "store", state: "none" }),
          promo({
            evidenceId: "loc",
            state: "promotion",
            locationId: GRAIN.locationId,
          }),
        ],
      }),
    ).toBe("unknown");
  });

  it("uses location/variant narrowing without applying foreign scopes", () => {
    expect(
      resolvePromotionState({
        grain: GRAIN,
        localDate: DAY,
        evidence: [
          promo({
            evidenceId: "other-loc",
            state: "promotion",
            locationId: "loc-b",
          }),
          promo({
            evidenceId: "own",
            state: "none",
            locationId: GRAIN.locationId,
            variantId: GRAIN.variantId,
          }),
        ],
      }),
    ).toBe("none");

    expect(
      resolvePromotionState({
        grain: GRAIN,
        localDate: DAY,
        evidence: [
          promo({
            evidenceId: "other-var",
            state: "promotion",
            variantId: "var-b",
          }),
        ],
      }),
    ).toBe("unknown");
  });

  it("ignores superseded and invalidated promotion evidence", () => {
    expect(
      resolvePromotionState({
        grain: GRAIN,
        localDate: DAY,
        evidence: [
          promo({ evidenceId: "old", state: "promotion" }),
          promo({
            evidenceId: "new",
            state: "none",
            version: 2,
            supersedesEvidenceId: "old",
          }),
        ],
      }),
    ).toBe("none");

    expect(
      resolvePromotionState({
        grain: GRAIN,
        localDate: DAY,
        evidence: [
          promo({
            evidenceId: "dead",
            state: "none",
            invalidatedAt: "2026-06-16T01:00:00.000Z",
          }),
        ],
      }),
    ).toBe("unknown");
  });

  it("rejects untrusted promotion trust and conflicting duplicate ids", () => {
    expect(() =>
      resolvePromotionState({
        grain: GRAIN,
        localDate: DAY,
        evidence: [
          promo({
            evidenceId: "raw",
            state: "none",
            trust: "raw_csv_claim" as "trusted_provider",
          }),
        ],
      }),
    ).toThrow(/trust/);

    expect(() =>
      resolvePromotionState({
        grain: GRAIN,
        localDate: DAY,
        evidence: [
          promo({ evidenceId: "dup", state: "none" }),
          promo({ evidenceId: "dup", state: "promotion" }),
        ],
      }),
    ).toThrow(/conflicting/);
  });

  it("requires complete orders and returns coverage", () => {
    expect(
      resolveDayDataComplete({
        grain: GRAIN,
        localDate: DAY,
        evidence: [
          coverage({ evidenceId: "o", stream: "orders" }),
        ],
      }),
    ).toBe(false);

    expect(
      resolveDayDataComplete({
        grain: GRAIN,
        localDate: DAY,
        evidence: bothStreamsComplete("ok"),
      }),
    ).toBe(true);

    expect(
      resolveDayDataComplete({
        grain: GRAIN,
        localDate: DAY,
        evidence: [
          coverage({
            evidenceId: "o",
            stream: "orders",
            coverage: "partial",
          }),
          coverage({ evidenceId: "r", stream: "returns" }),
        ],
      }),
    ).toBe(false);
  });

  it("invalidates coverage when late commerce exceeds asOf", () => {
    expect(
      resolveDayDataComplete({
        grain: GRAIN,
        localDate: DAY,
        evidence: [
          coverage({
            evidenceId: "o",
            stream: "orders",
            asOf: "2026-06-15T12:00:00.000Z",
          }),
          coverage({ evidenceId: "r", stream: "returns" }),
        ],
        dayEvents: [
          {
            organizationId: GRAIN.organizationId,
            storeId: GRAIN.storeId,
            locationId: GRAIN.locationId,
            variantId: GRAIN.variantId,
            localDate: DAY,
            observedAt: "2026-06-15T18:00:00.000Z",
            stream: "orders",
          },
        ],
      }),
    ).toBe(false);

    // Equivalent ISO forms still compare by instant, not string shape.
    expect(
      resolveDayDataComplete({
        grain: GRAIN,
        localDate: DAY,
        evidence: [
          coverage({
            evidenceId: "o2",
            stream: "orders",
            asOf: "2026-06-15T12:00:00Z",
          }),
          coverage({ evidenceId: "r2", stream: "returns" }),
        ],
        dayEvents: [
          {
            organizationId: GRAIN.organizationId,
            storeId: GRAIN.storeId,
            locationId: GRAIN.locationId,
            variantId: GRAIN.variantId,
            localDate: DAY,
            observedAt: "2026-06-15T12:00:00.000Z",
            stream: "orders",
          },
        ],
      }),
    ).toBe(true);
  });

  it("rejects conflicting duplicate coverage identities", () => {
    expect(() =>
      resolveDayDataComplete({
        grain: GRAIN,
        localDate: DAY,
        evidence: [
          coverage({ evidenceId: "dup", stream: "orders" }),
          coverage({
            evidenceId: "dup",
            stream: "orders",
            coverage: "partial",
          }),
          coverage({ evidenceId: "r", stream: "returns" }),
        ],
      }),
    ).toThrow(/conflicting/);
  });

  it("accepts verified merchant attestation provenance", () => {
    expect(
      resolvePromotionState({
        grain: GRAIN,
        localDate: DAY,
        evidence: [
          promo({
            evidenceId: "m",
            state: "none",
            trust: "verified_merchant_attestation",
            source: "merchant:attested_calendar",
          }),
        ],
      }),
    ).toBe("none");

    expect(
      resolveDayDataComplete({
        grain: GRAIN,
        localDate: DAY,
        evidence: [
          coverage({
            evidenceId: "mo",
            stream: "orders",
            trust: "verified_merchant_attestation",
            source: "merchant:attested_coverage",
          }),
          coverage({
            evidenceId: "mr",
            stream: "returns",
            trust: "verified_merchant_attestation",
            source: "merchant:attested_coverage",
          }),
        ],
      }),
    ).toBe(true);
  });

  it("ignores cross-tenant evidence without contaminating resolution", () => {
    expect(
      resolvePromotionState({
        grain: GRAIN,
        localDate: DAY,
        evidence: [
          promo({
            evidenceId: "foreign",
            state: "promotion",
            organizationId: "org-b",
          }),
          promo({ evidenceId: "own", state: "none" }),
        ],
      }),
    ).toBe("none");

    expect(
      resolveDayDataComplete({
        grain: GRAIN,
        localDate: DAY,
        evidence: [
          coverage({
            evidenceId: "foreign-o",
            stream: "orders",
            organizationId: "org-b",
          }),
          ...bothStreamsComplete("own"),
        ],
      }),
    ).toBe(true);
  });
});

describe("M6 P2a evidence integration", () => {
  function baseArgs(
    overrides: Partial<Parameters<typeof buildForecastSkuDemandInput>[0]> = {},
  ) {
    return {
      grain: GRAIN,
      forecastAsOf: AS_OF,
      timeZone: "UTC",
      lookbackDays: 3,
      orders: [],
      orderItems: [],
      returnRefunds: [],
      inventorySnapshots: [],
      ...overrides,
    };
  }

  it("keeps fail-closed promotion and completeness when evidence absent", () => {
    const input = buildForecastSkuDemandInput(baseArgs());

    expect(
      input.facts.every((fact) => fact.promotionState === "unknown"),
    ).toBe(true);
    expect(input.facts.every((fact) => fact.dataComplete === false)).toBe(
      true,
    );
  });

  it("wires trusted promotion and coverage into facts", () => {
    const input = buildForecastSkuDemandInput(
      baseArgs({
        promotionEvidence: [
          promo({ evidenceId: "p", state: "none", localDate: "2026-06-13" }),
          promo({
            evidenceId: "q",
            state: "promotion",
            localDate: "2026-06-14",
          }),
        ],
        coverageEvidence: [
          ...bothStreamsComplete("d13").map((row) => ({
            ...row,
            localDate: "2026-06-13",
          })),
          ...bothStreamsComplete("d14").map((row) => ({
            ...row,
            localDate: "2026-06-14",
          })),
        ],
      }),
    );

    const byDate = new Map(input.facts.map((fact) => [fact.date, fact]));

    expect(byDate.get("2026-06-13")).toMatchObject({
      promotionState: "none",
      dataComplete: true,
    });
    expect(byDate.get("2026-06-14")).toMatchObject({
      promotionState: "promotion",
      dataComplete: true,
    });
    expect(byDate.get("2026-06-15")).toMatchObject({
      promotionState: "unknown",
      dataComplete: false,
    });
  });

  it("does not let trustedCompleteDates override partial, missing-stream, or stale coverage", () => {
    const partial = buildForecastSkuDemandInput(
      baseArgs({
        trustedCompleteDates: [DAY],
        coverageEvidence: [
          coverage({
            evidenceId: "partial-o",
            stream: "orders",
            coverage: "partial",
          }),
          coverage({ evidenceId: "r", stream: "returns" }),
        ],
      }),
    );

    expect(
      partial.facts.find((fact) => fact.date === DAY)?.dataComplete,
    ).toBe(false);

    const ordersOnly = buildForecastSkuDemandInput(
      baseArgs({
        trustedCompleteDates: [DAY],
        coverageEvidence: [
          coverage({ evidenceId: "o-only", stream: "orders" }),
        ],
      }),
    );

    expect(
      ordersOnly.facts.find((fact) => fact.date === DAY)?.dataComplete,
    ).toBe(false);

    const stale = buildForecastSkuDemandInput(
      baseArgs({
        trustedCompleteDates: [DAY],
        coverageEvidence: [
          coverage({
            evidenceId: "stale-o",
            stream: "orders",
            invalidatedAt: "2026-06-16T01:00:00.000Z",
          }),
          coverage({
            evidenceId: "stale-r",
            stream: "returns",
            invalidatedAt: "2026-06-16T01:00:00.000Z",
          }),
        ],
      }),
    );

    expect(
      stale.facts.find((fact) => fact.date === DAY)?.dataComplete,
    ).toBe(false);
  });

  it("does not let trustedCompleteDates override conflicting coverage scopes", () => {
    const input = buildForecastSkuDemandInput(
      baseArgs({
        trustedCompleteDates: [DAY],
        coverageEvidence: [
          coverage({
            evidenceId: "store-o",
            stream: "orders",
            coverage: "complete",
          }),
          coverage({
            evidenceId: "loc-o",
            stream: "orders",
            coverage: "partial",
            locationId: GRAIN.locationId,
          }),
          coverage({ evidenceId: "r", stream: "returns" }),
        ],
      }),
    );

    expect(
      input.facts.find((fact) => fact.date === DAY)?.dataComplete,
    ).toBe(false);
  });

  it("rejects untrusted coverage labels instead of falling back to trustedCompleteDates", () => {
    expect(() =>
      buildForecastSkuDemandInput(
        baseArgs({
          trustedCompleteDates: [DAY],
          coverageEvidence: [
            coverage({
              evidenceId: "raw-o",
              stream: "orders",
              trust: "raw_csv_claim" as "trusted_provider",
            }),
            coverage({
              evidenceId: "raw-r",
              stream: "returns",
              trust: "raw_csv_claim" as "trusted_provider",
            }),
          ],
        }),
      ),
    ).toThrow(/trust/);
  });

  it("marks incomplete when late return arrives after coverage watermark", () => {
    const input = buildForecastSkuDemandInput(
      baseArgs({
        lookbackDays: 1,
        orders: [
          {
            id: "ord",
            organizationId: GRAIN.organizationId,
            storeId: GRAIN.storeId,
            status: "completed",
            orderedAt: "2026-06-15T10:00:00.000Z",
          },
        ],
        orderItems: [
          {
            id: "item",
            organizationId: GRAIN.organizationId,
            storeId: GRAIN.storeId,
            orderId: "ord",
            variantId: GRAIN.variantId,
            locationId: GRAIN.locationId,
            quantity: 2,
          },
        ],
        returnRefunds: [
          {
            id: "late",
            organizationId: GRAIN.organizationId,
            storeId: GRAIN.storeId,
            variantId: GRAIN.variantId,
            locationId: GRAIN.locationId,
            returnedQuantity: 1,
            occurredAt: "2026-06-15T20:00:00.000Z",
          },
        ],
        coverageEvidence: [
          coverage({
            evidenceId: "o",
            stream: "orders",
            asOf: "2026-06-15T12:00:00.000Z",
          }),
          coverage({
            evidenceId: "r",
            stream: "returns",
            asOf: "2026-06-15T12:00:00.000Z",
          }),
        ],
        promotionEvidence: [
          promo({ evidenceId: "p", state: "none" }),
        ],
      }),
    );

    const fact = input.facts.find((row) => row.date === DAY);

    expect(fact?.unitsSold).toBe(1);
    expect(fact?.dataComplete).toBe(false);
    expect(fact?.promotionState).toBe("none");
  });

  it("can unlock a non-null forecast when evidence makes days usable", () => {
    const lookbackDays = 28;
    const start = shiftForecastDate(AS_OF, -(lookbackDays - 1));
    const dates = Array.from({ length: lookbackDays }, (_, index) =>
      shiftForecastDate(start, index),
    );

    const promotionEvidence = dates.map((localDate, index) =>
      promo({
        evidenceId: `promo-${index}`,
        state: "none",
        localDate,
      }),
    );

    const coverageEvidence = dates.flatMap((localDate, index) =>
      bothStreamsComplete(`c-${index}`).map((row) => ({
        ...row,
        localDate,
      })),
    );

    const inventorySnapshots = dates.map((date, index) => ({
      id: `snap-${index}`,
      organizationId: GRAIN.organizationId,
      storeId: GRAIN.storeId,
      locationId: GRAIN.locationId,
      variantId: GRAIN.variantId,
      observedAt: `${date}T12:00:00.000Z`,
      availableQuantity: 5,
    }));

    const orders = dates.map((date, index) => ({
      id: `ord-${index}`,
      organizationId: GRAIN.organizationId,
      storeId: GRAIN.storeId,
      status: "completed" as const,
      orderedAt: `${date}T10:00:00.000Z`,
    }));

    const orderItems = dates.map((_, index) => ({
      id: `item-${index}`,
      organizationId: GRAIN.organizationId,
      storeId: GRAIN.storeId,
      orderId: `ord-${index}`,
      variantId: GRAIN.variantId,
      locationId: GRAIN.locationId,
      quantity: 2,
    }));

    const demandInput = buildForecastSkuDemandInput(
      baseArgs({
        lookbackDays,
        orders,
        orderItems,
        inventorySnapshots,
        promotionEvidence,
        coverageEvidence,
      }),
    );

    const result = forecastSkuDemand(demandInput);

    expect(result.dailyDemand).not.toBeNull();
    expect(result.dailyDemand).toBeGreaterThan(0);

    const withoutPromo = buildForecastSkuDemandInput(
      baseArgs({
        lookbackDays,
        orders,
        orderItems,
        inventorySnapshots,
        coverageEvidence,
      }),
    );

    expect(forecastSkuDemand(withoutPromo).dailyDemand).toBeNull();

    // Fingerprint sensitive to promotion evidence outcome.
    expect(forecastSkuDemand(demandInput).reproducibilityFingerprint).not.toBe(
      forecastSkuDemand(withoutPromo).reproducibilityFingerprint,
    );
  });

  it("ignores foreign-tenant evidence in the adapter path", () => {
    const own = buildForecastSkuDemandInput(
      baseArgs({
        promotionEvidence: [promo({ evidenceId: "own", state: "none" })],
        coverageEvidence: bothStreamsComplete("own"),
      }),
    );

    const withForeign = buildForecastSkuDemandInput(
      baseArgs({
        promotionEvidence: [
          promo({ evidenceId: "own", state: "none" }),
          promo({
            evidenceId: "foreign",
            state: "promotion",
            organizationId: "org-b",
          }),
        ],
        coverageEvidence: [
          ...bothStreamsComplete("own"),
          coverage({
            evidenceId: "foreign-o",
            stream: "orders",
            organizationId: "org-b",
            coverage: "partial",
          }),
        ],
      }),
    );

    expect(withForeign.facts).toEqual(own.facts);
  });
});
