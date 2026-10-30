import {
  describe,
  expect,
  it,
} from "vitest";

import {
  evaluateForecastBacktestHarness,
  FORECAST_BACKTEST_MIN_ORIGINS_V1,
  resolveFactAtKnowledgeCutoff,
} from "@/lib/forecasting/backtest-harness";

import {
  classifyHistoricalEvidenceSource,
  toForecastBacktestHarnessInput,
  validateHistoricalEvidenceIntegrity,
  type HistoricalEvidenceCandidateRevision,
  type HistoricalEvidenceIntegrityInput,
} from "@/lib/forecasting/historical-evidence-integrity";

import {
  shiftForecastDate,
  type ForecastGrain,
} from "@/lib/forecasting/series";

const GRAIN: ForecastGrain = {
  organizationId: "6100e000-0000-4000-8000-000000000001",
  storeId: "6100e000-0000-4000-8000-000000000002",
  locationId: "6100e000-0000-4000-8000-000000000003",
  variantId: "6100e000-0000-4000-8000-000000000005",
};

const START = "2026-01-01";
const TZ = "America/New_York";

function revision(
  date: string,
  overrides: Partial<HistoricalEvidenceCandidateRevision> = {},
): HistoricalEvidenceCandidateRevision {
  return {
    sourceIdentity: `day:${date}`,
    claimKind: "day_outcome",
    organizationId: GRAIN.organizationId,
    storeId: GRAIN.storeId,
    locationId: GRAIN.locationId,
    variantId: GRAIN.variantId,
    businessDate: date,
    knownAsOf: date,
    unitsSold: 2,
    availability: "available",
    promotionState: "none",
    dataComplete: true,
    ...overrides,
  };
}

function denseRevisions(
  dayCount: number,
): HistoricalEvidenceCandidateRevision[] {
  const rows: HistoricalEvidenceCandidateRevision[] = [];
  for (let i = 0; i < dayCount; i += 1) {
    const date = shiftForecastDate(START, i);
    rows.push(revision(date));
  }
  return rows;
}

function fixtureInput(
  revisions: readonly HistoricalEvidenceCandidateRevision[],
  overrides: Partial<HistoricalEvidenceIntegrityInput> = {},
): HistoricalEvidenceIntegrityInput {
  return {
    sourceClass: "controlled_pit_fixture",
    grain: GRAIN,
    pinnedTimeZone: TZ,
    revisions,
    ...overrides,
  };
}

describe("M6 P4b historical evidence integrity gate", () => {
  it("classifies live canonical and partial append-only as unsupported", () => {
    expect(
      classifyHistoricalEvidenceSource({
        sourceClass: "unsupported_live_canonical",
      }).allowedForHarness,
    ).toBe(false);
    expect(
      classifyHistoricalEvidenceSource({
        sourceClass: "partial_append_only",
      }).reasonCodes,
    ).toContain("UNSUPPORTED_PARTIAL_APPEND_ONLY");
    expect(
      classifyHistoricalEvidenceSource({
        sourceClass: "controlled_pit_fixture",
        claimKinds: ["live_snapshot_payload"],
      }).disposition,
    ).toBe("UNSUPPORTED_HISTORICAL_REPLAY");
  });

  it("rejects unsupported live canonical source class", () => {
    const result = validateHistoricalEvidenceIntegrity(
      fixtureInput(denseRevisions(3), {
        sourceClass: "unsupported_live_canonical",
      }),
    );
    expect(result.disposition).toBe("UNSUPPORTED_HISTORICAL_REPLAY");
    expect(result.reasonCodes).toContain("UNSUPPORTED_LIVE_CANONICAL");
    expect(result.facts).toHaveLength(0);
  });

  it("rejects partial_append_only as historical replay", () => {
    const result = validateHistoricalEvidenceIntegrity(
      fixtureInput(denseRevisions(3), {
        sourceClass: "partial_append_only",
      }),
    );
    expect(result.disposition).toBe("UNSUPPORTED_HISTORICAL_REPLAY");
    expect(result.reasonCodes).toContain("UNSUPPORTED_PARTIAL_APPEND_ONLY");
  });

  it("rejects live snapshot payloads masquerading as PIT fixtures", () => {
    const result = validateHistoricalEvidenceIntegrity(
      fixtureInput([
        revision(START, { claimKind: "live_snapshot_payload" }),
      ]),
    );
    expect(result.disposition).toBe("UNSUPPORTED_HISTORICAL_REPLAY");
    expect(result.reasonCodes).toContain("UNSUPPORTED_LIVE_SNAPSHOT");
  });

  it("rejects correction-outbox-only notifications without previous values", () => {
    const result = validateHistoricalEvidenceIntegrity(
      fixtureInput([
        revision(START, {
          claimKind: "correction_outbox_notification",
          unitsSold: undefined,
          availability: undefined,
          promotionState: undefined,
          dataComplete: undefined,
        }),
      ]),
    );
    expect(result.disposition).toBe("UNSUPPORTED_HISTORICAL_REPLAY");
    expect(result.reasonCodes).toContain(
      "UNSUPPORTED_CORRECTION_OUTBOX_ONLY",
    );
  });

  it("rejects coverage-only packages that cannot rebuild demand", () => {
    const result = validateHistoricalEvidenceIntegrity(
      fixtureInput([
        revision(START, {
          claimKind: "coverage_claim",
          unitsSold: undefined,
          availability: undefined,
          promotionState: undefined,
          dataComplete: undefined,
        }),
      ]),
    );
    expect(result.disposition).toBe("UNSUPPORTED_HISTORICAL_REPLAY");
    expect(result.reasonCodes).toContain(
      "UNSUPPORTED_CORRECTION_OUTBOX_ONLY",
    );
  });

  it("rejects trustedCompleteDates synthetic completeness", () => {
    const result = validateHistoricalEvidenceIntegrity(
      fixtureInput(denseRevisions(2), {
        trustedCompleteDates: [START],
      }),
    );
    expect(result.disposition).toBe("INVALID_HISTORY");
    expect(result.reasonCodes).toContain("TRUSTED_COMPLETE_DATES_FORBIDDEN");
  });

  it("rejects missing dual timestamps", () => {
    const result = validateHistoricalEvidenceIntegrity(
      fixtureInput([
        revision(START, { knownAsOf: undefined }),
      ]),
    );
    expect(result.disposition).toBe("INVALID_HISTORY");
    expect(result.reasonCodes).toEqual(
      expect.arrayContaining([
        "MISSING_KNOWN_AS_OF",
        "MISSING_DUAL_TIMESTAMPS",
      ]),
    );
  });

  it("rejects backdated realized sale known before observation", () => {
    const businessDate = shiftForecastDate(START, 5);
    const result = validateHistoricalEvidenceIntegrity(
      fixtureInput([
        revision(businessDate, {
          claimKind: "realized_sale",
          knownAsOf: shiftForecastDate(START, 3),
          unitsSold: 4,
        }),
      ]),
    );
    expect(result.disposition).toBe("INVALID_HISTORY");
    expect(result.reasonCodes).toContain("KNOWN_AS_OF_BEFORE_OBSERVATION");
  });

  it("rejects late-return style realized return known before its day", () => {
    const businessDate = shiftForecastDate(START, 8);
    const result = validateHistoricalEvidenceIntegrity(
      fixtureInput([
        revision(businessDate, {
          claimKind: "realized_return",
          knownAsOf: shiftForecastDate(START, 6),
          unitsSold: 1,
        }),
      ]),
    );
    expect(result.disposition).toBe("INVALID_HISTORY");
    expect(result.reasonCodes).toContain("KNOWN_AS_OF_BEFORE_OBSERVATION");
  });

  it("rejects backfilled inventory claimed known before the observation day", () => {
    const businessDate = shiftForecastDate(START, 4);
    const result = validateHistoricalEvidenceIntegrity(
      fixtureInput([
        revision(businessDate, {
          claimKind: "realized_inventory",
          knownAsOf: shiftForecastDate(START, 1),
          unitsSold: 0,
          availability: "unavailable",
        }),
      ]),
    );
    expect(result.disposition).toBe("INVALID_HISTORY");
    expect(result.reasonCodes).toContain("KNOWN_AS_OF_BEFORE_OBSERVATION");
  });

  it("rejects scheduled promotion silently turned into a realized future sale", () => {
    const promoDay = shiftForecastDate(START, 10);
    const result = validateHistoricalEvidenceIntegrity(
      fixtureInput([
        revision(promoDay, {
          claimKind: "scheduled_promotion",
          knownAsOf: shiftForecastDate(START, 2),
          unitsSold: 12,
          promotionState: "promotion",
          dataComplete: true,
          availability: "available",
        }),
      ]),
    );
    expect(result.disposition).toBe("INVALID_HISTORY");
    expect(result.reasonCodes).toContain(
      "SCHEDULED_PROMOTION_AS_REALIZED_SALE",
    );
  });

  it("accepts legitimately scheduled future promotion without inventing sales", () => {
    const promoDay = shiftForecastDate(START, 10);
    const result = validateHistoricalEvidenceIntegrity(
      fixtureInput([
        revision(promoDay, {
          claimKind: "scheduled_promotion",
          knownAsOf: shiftForecastDate(START, 2),
          unitsSold: undefined,
          availability: undefined,
          dataComplete: undefined,
          promotionState: "promotion",
        }),
      ]),
    );
    expect(result.disposition).toBe("accepted");
    if (result.disposition !== "accepted") {
      return;
    }
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]?.date).toBe(promoDay);
    expect(result.facts[0]?.knownAsOf).toBe(promoDay);
    expect(result.facts[0]?.promotionState).toBe("promotion");
    expect(result.facts[0]?.dataComplete).toBe(false);
    expect(result.facts[0]?.availability).toBe("unknown");
  });

  it("keeps late in-place revisions from leaking into earlier origin views", () => {
    const day = shiftForecastDate(START, 5);
    const early = revision(day, {
      sourceIdentity: "order:1:v1",
      unitsSold: 1,
      knownAsOf: day,
    });
    const late = revision(day, {
      sourceIdentity: "order:1:v2",
      unitsSold: 99,
      knownAsOf: shiftForecastDate(day, 3),
      supersedesSourceIdentity: "order:1:v1",
    });

    const result = validateHistoricalEvidenceIntegrity(
      fixtureInput([early, late]),
    );
    expect(result.disposition).toBe("accepted");
    if (result.disposition !== "accepted") {
      return;
    }

    const atOrigin = resolveFactAtKnowledgeCutoff(
      result.facts,
      GRAIN,
      day,
      day,
    );
    expect(atOrigin?.unitsSold).toBe(1);

    const afterCorrection = resolveFactAtKnowledgeCutoff(
      result.facts,
      GRAIN,
      day,
      shiftForecastDate(day, 3),
    );
    expect(afterCorrection?.unitsSold).toBe(99);
  });

  it("rejects conflicting revisions at the same knownAsOf", () => {
    const day = shiftForecastDate(START, 3);
    const result = validateHistoricalEvidenceIntegrity(
      fixtureInput([
        revision(day, {
          sourceIdentity: "a",
          unitsSold: 1,
          knownAsOf: day,
        }),
        revision(day, {
          sourceIdentity: "b",
          unitsSold: 2,
          knownAsOf: day,
        }),
      ]),
    );
    expect(result.disposition).toBe("INVALID_HISTORY");
    expect(result.reasonCodes).toContain("CONFLICTING_REVISIONS");
  });

  it("rejects missing historical supersession targets", () => {
    const day = shiftForecastDate(START, 2);
    const result = validateHistoricalEvidenceIntegrity(
      fixtureInput([
        revision(day, {
          sourceIdentity: "v2",
          supersedesSourceIdentity: "v1-missing",
        }),
      ]),
    );
    expect(result.disposition).toBe("INVALID_HISTORY");
    expect(result.reasonCodes).toContain("MISSING_HISTORICAL_VERSION");
  });

  it("rejects missing historical timezone", () => {
    const result = validateHistoricalEvidenceIntegrity({
      sourceClass: "controlled_pit_fixture",
      grain: GRAIN,
      revisions: denseRevisions(2),
    });
    expect(result.disposition).toBe("INVALID_HISTORY");
    expect(result.reasonCodes).toContain("MISSING_HISTORICAL_TIMEZONE");
  });

  it("rejects timezone history changes without a safe pin", () => {
    const result = validateHistoricalEvidenceIntegrity({
      sourceClass: "controlled_pit_fixture",
      grain: GRAIN,
      revisions: denseRevisions(2),
      timezoneHistory: [
        { effectiveFrom: START, timeZone: "America/New_York" },
        {
          effectiveFrom: shiftForecastDate(START, 1),
          timeZone: "America/Los_Angeles",
        },
      ],
    });
    expect(result.disposition).toBe("UNSUPPORTED_HISTORICAL_REPLAY");
    expect(result.reasonCodes).toContain("INVALID_TIMEZONE_HISTORY");
  });

  it("preserves known zero vs incomplete and censored day outcomes", () => {
    const zeroDay = shiftForecastDate(START, 1);
    const incompleteDay = shiftForecastDate(START, 2);
    const censoredDay = shiftForecastDate(START, 3);

    const result = validateHistoricalEvidenceIntegrity(
      fixtureInput([
        revision(zeroDay, {
          unitsSold: 0,
          dataComplete: true,
          availability: "available",
        }),
        revision(incompleteDay, {
          unitsSold: 0,
          dataComplete: false,
          availability: "available",
        }),
        revision(censoredDay, {
          unitsSold: 0,
          dataComplete: true,
          availability: "unavailable",
        }),
      ]),
    );

    expect(result.disposition).toBe("accepted");
    if (result.disposition !== "accepted") {
      return;
    }

    expect(result.facts.find((f) => f.date === zeroDay)?.dataComplete).toBe(
      true,
    );
    expect(
      result.facts.find((f) => f.date === incompleteDay)?.dataComplete,
    ).toBe(false);
    expect(
      result.facts.find((f) => f.date === censoredDay)?.availability,
    ).toBe("unavailable");
  });

  it("accepts a valid controlled fixture and feeds P4a unchanged", () => {
    const revisions = denseRevisions(40);
    const integrity = validateHistoricalEvidenceIntegrity(
      fixtureInput(revisions),
    );

    expect(integrity.disposition).toBe("accepted");
    expect(integrity.claimsProductionApproval).toBe(false);
    expect(integrity.claimsM7NumericEligibility).toBe(false);
    if (integrity.disposition !== "accepted") {
      return;
    }

    expect(integrity.facts).toHaveLength(40);
    expect(integrity.pinnedTimeZone).toBe(TZ);

    const harnessInput = toForecastBacktestHarnessInput(
      integrity,
      shiftForecastDate(START, 10),
      shiftForecastDate(START, 10 + FORECAST_BACKTEST_MIN_ORIGINS_V1 - 1),
      7,
    );

    expect(harnessInput.facts).toBe(integrity.facts);

    const scored = evaluateForecastBacktestHarness(harnessInput);
    expect(scored.disposition).toBe("preliminary");
    expect(scored.originCount).toBe(FORECAST_BACKTEST_MIN_ORIGINS_V1);
    expect(scored.claimsProductionApproval).toBe(false);
  });

  it("rejects late promotion/coverage invalidation packages that omit prior versions", () => {
    const day = shiftForecastDate(START, 4);
    const result = validateHistoricalEvidenceIntegrity(
      fixtureInput([
        revision(day, {
          sourceIdentity: "promo:v2",
          claimKind: "day_outcome",
          promotionState: "none",
          knownAsOf: shiftForecastDate(day, 2),
          supersedesSourceIdentity: "promo:v1",
        }),
      ]),
    );
    expect(result.disposition).toBe("INVALID_HISTORY");
    expect(result.reasonCodes).toContain("MISSING_HISTORICAL_VERSION");
  });
});
