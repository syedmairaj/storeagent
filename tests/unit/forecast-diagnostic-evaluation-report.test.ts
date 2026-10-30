import {
  describe,
  expect,
  it,
} from "vitest";

import {
  evaluateForecastBacktestHarness,
  FORECAST_BACKTEST_MIN_ORIGINS_V1,
} from "@/lib/forecasting/backtest-harness";

import {
  buildForecastDiagnosticEvaluationReport,
  ForecastDiagnosticEvaluationReportError,
  formatForecastDiagnosticEvaluationReportMarkdown,
  type ForecastDiagnosticPersistenceLinkage,
} from "@/lib/forecasting/diagnostic-evaluation-report";

import {
  validateHistoricalEvidenceIntegrity,
  type HistoricalEvidenceCandidateRevision,
  type HistoricalEvidenceIntegrityResult,
} from "@/lib/forecasting/historical-evidence-integrity";

import { shiftForecastDate } from "@/lib/forecasting/series";

const GRAIN = {
  organizationId: "6100e000-0000-4000-8000-000000000001",
  storeId: "6100e000-0000-4000-8000-000000000002",
  locationId: "6100e000-0000-4000-8000-000000000003",
  variantId: "6100e000-0000-4000-8000-000000000005",
};

const START = "2026-01-01";
const TZ = "UTC";

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
  unitsForDay: (index: number) => number = () => 2,
): HistoricalEvidenceCandidateRevision[] {
  const rows: HistoricalEvidenceCandidateRevision[] = [];
  for (let i = 0; i < dayCount; i += 1) {
    rows.push(
      revision(shiftForecastDate(START, i), {
        unitsSold: unitsForDay(i),
      }),
    );
  }
  return rows;
}

function acceptedIntegrity(
  unitsForDay: (index: number) => number = () => 2,
): Extract<HistoricalEvidenceIntegrityResult, { disposition: "accepted" }> {
  const result = validateHistoricalEvidenceIntegrity({
    sourceClass: "controlled_pit_fixture",
    grain: GRAIN,
    pinnedTimeZone: TZ,
    revisions: denseRevisions(40, unitsForDay),
  });
  expect(result.disposition).toBe("accepted");
  return result as Extract<
    HistoricalEvidenceIntegrityResult,
    { disposition: "accepted" }
  >;
}

describe("M6 P4d diagnostic evaluation report", () => {
  it("builds preliminary candidate/naive/zero comparison on identical scored dates", () => {
    const integrity = acceptedIntegrity();
    const harness = evaluateForecastBacktestHarness({
      grain: GRAIN,
      originStart: shiftForecastDate(START, 10),
      originEnd: shiftForecastDate(
        START,
        10 + FORECAST_BACKTEST_MIN_ORIGINS_V1 - 1,
      ),
      lookbackDays: 7,
      facts: integrity.facts,
    });

    const report = buildForecastDiagnosticEvaluationReport({
      integrity,
      harness,
      originStart: shiftForecastDate(START, 10),
      originEnd: shiftForecastDate(
        START,
        10 + FORECAST_BACKTEST_MIN_ORIGINS_V1 - 1,
      ),
      lookbackDays: 7,
      pinnedTimeZone: TZ,
    });

    expect(report.diagnosticDisposition).toBe("preliminary");
    expect(report.baselineComparisonAvailable).toBe(true);
    expect(report.baselines.map((row) => row.model)).toEqual([
      "candidate",
      "naive_lag1",
      "zero",
    ]);
    expect(
      new Set(report.baselines.map((row) => row.observationCount)),
    ).toEqual(new Set([FORECAST_BACKTEST_MIN_ORIGINS_V1]));
    expect(report.provenance.claimsProductionApproval).toBe(false);
    expect(report.provenance.algorithmApproved).toBe(false);
    expect(report.provenance.claimsM7NumericEligibility).toBe(false);
    expect(report.provenance.notMerchantPerformance).toBe(true);
    expect(report.interpretation.warnings).toEqual([
      "controlled_fixture_only",
      "NOT_merchant_performance",
      "NOT_production_activation",
    ]);
    expect(report.baselines[1]?.vsCandidate).not.toBeNull();
  });

  it("labels insufficient-sample diagnostics without implying approval", () => {
    const integrity = acceptedIntegrity();
    const harness = evaluateForecastBacktestHarness({
      grain: GRAIN,
      originStart: shiftForecastDate(START, 10),
      originEnd: shiftForecastDate(START, 12),
      lookbackDays: 7,
      facts: integrity.facts,
    });

    const report = buildForecastDiagnosticEvaluationReport({
      integrity,
      harness,
      originStart: shiftForecastDate(START, 10),
      originEnd: shiftForecastDate(START, 12),
      lookbackDays: 7,
      pinnedTimeZone: TZ,
    });

    expect(report.diagnosticDisposition).toBe("INSUFFICIENT_BACKTEST_POINTS");
    expect(report.baselineComparisonAvailable).toBe(true);
    expect(report.sample.originCount).toBe(3);
    expect(report.interpretation.summary).toMatch(/Insufficient-sample/i);
    expect(report.interpretation.forbiddenInferences).toContain(
      "algorithm_approved",
    );
  });

  it("produces unscored rejection reports for INVALID_HISTORY and unsupported replay", () => {
    const invalid = validateHistoricalEvidenceIntegrity({
      sourceClass: "controlled_pit_fixture",
      grain: GRAIN,
      pinnedTimeZone: TZ,
      revisions: [
        revision(shiftForecastDate(START, 5), {
          knownAsOf: shiftForecastDate(START, 4),
        }),
      ],
    });
    expect(invalid.disposition).toBe("INVALID_HISTORY");

    const invalidReport = buildForecastDiagnosticEvaluationReport({
      integrity: invalid,
      harness: null,
      originStart: shiftForecastDate(START, 10),
      originEnd: shiftForecastDate(START, 12),
      lookbackDays: 7,
      pinnedTimeZone: TZ,
    });

    expect(invalidReport.evidenceScope).toBe("unsupported_or_invalid");
    expect(invalidReport.baselineComparisonAvailable).toBe(false);
    expect(invalidReport.baselines).toEqual([]);
    expect(invalidReport.provenance.isScoredEvaluation).toBe(false);

    const unsupported = validateHistoricalEvidenceIntegrity({
      sourceClass: "unsupported_live_canonical",
      grain: GRAIN,
      pinnedTimeZone: TZ,
      revisions: denseRevisions(3),
    });

    const unsupportedReport = buildForecastDiagnosticEvaluationReport({
      integrity: unsupported,
      harness: null,
      originStart: shiftForecastDate(START, 10),
      originEnd: shiftForecastDate(START, 12),
      lookbackDays: 7,
      pinnedTimeZone: TZ,
    });

    expect(unsupportedReport.diagnosticDisposition).toBe(
      "UNSUPPORTED_HISTORICAL_REPLAY",
    );
    expect(unsupportedReport.baselines).toHaveLength(0);
  });

  it("preserves undefined WAPE/bias/MASE for zero-demand fixtures", () => {
    const integrity = acceptedIntegrity(() => 0);
    const harness = evaluateForecastBacktestHarness({
      grain: GRAIN,
      originStart: shiftForecastDate(START, 10),
      originEnd: shiftForecastDate(
        START,
        10 + FORECAST_BACKTEST_MIN_ORIGINS_V1 - 1,
      ),
      lookbackDays: 7,
      facts: integrity.facts,
    });

    const report = buildForecastDiagnosticEvaluationReport({
      integrity,
      harness,
      originStart: shiftForecastDate(START, 10),
      originEnd: shiftForecastDate(
        START,
        10 + FORECAST_BACKTEST_MIN_ORIGINS_V1 - 1,
      ),
      lookbackDays: 7,
      pinnedTimeZone: TZ,
    });

    const candidate = report.baselines.find((row) => row.model === "candidate");
    expect(candidate?.wape).toBeNull();
    expect(candidate?.biasRatio).toBeNull();
    expect(candidate?.mase).toBeNull();
    expect(candidate?.metricReasonCodes).toEqual(
      expect.arrayContaining([
        "ZERO_TOTAL_ACTUAL_DEMAND",
        "MASE_DENOMINATOR_ZERO",
      ]),
    );
    expect(report.interpretation.comparisonNotes.join(" ")).toMatch(/WAPE\/bias unavailable|MASE unavailable/);
  });

  it("keeps known-zero actuals scored when complete and available", () => {
    const integrity = acceptedIntegrity((index) => (index === 11 ? 0 : 2));
    const origin = shiftForecastDate(START, 10);
    const harness = evaluateForecastBacktestHarness({
      grain: GRAIN,
      originStart: origin,
      originEnd: origin,
      lookbackDays: 7,
      facts: integrity.facts,
    });

    const report = buildForecastDiagnosticEvaluationReport({
      integrity,
      harness,
      originStart: origin,
      originEnd: origin,
      lookbackDays: 7,
      pinnedTimeZone: TZ,
    });

    expect(report.diagnosticDisposition).toBe("INSUFFICIENT_BACKTEST_POINTS");
    expect(report.sample.originCount).toBe(1);
    expect(report.baselines[0]?.observationCount).toBe(1);
  });

  it("rejects conflicting integrity/harness pairing and inconsistent model sets", () => {
    const integrity = acceptedIntegrity();
    const harness = evaluateForecastBacktestHarness({
      grain: GRAIN,
      originStart: shiftForecastDate(START, 10),
      originEnd: shiftForecastDate(START, 12),
      lookbackDays: 7,
      facts: integrity.facts,
    });

    expect(() =>
      buildForecastDiagnosticEvaluationReport({
        integrity,
        harness: null,
        originStart: shiftForecastDate(START, 10),
        originEnd: shiftForecastDate(START, 12),
        lookbackDays: 7,
        pinnedTimeZone: TZ,
      }),
    ).toThrow(ForecastDiagnosticEvaluationReportError);

    const rejected = validateHistoricalEvidenceIntegrity({
      sourceClass: "unsupported_live_canonical",
      grain: GRAIN,
      pinnedTimeZone: TZ,
      revisions: denseRevisions(2),
    });

    expect(() =>
      buildForecastDiagnosticEvaluationReport({
        integrity: rejected,
        harness,
        originStart: shiftForecastDate(START, 10),
        originEnd: shiftForecastDate(START, 12),
        lookbackDays: 7,
        pinnedTimeZone: TZ,
      }),
    ).toThrow(/must not include a harness result/);

    const broken = {
      ...harness,
      models: harness.models.slice(0, 2),
    };
    expect(() =>
      buildForecastDiagnosticEvaluationReport({
        integrity,
        harness: broken,
        originStart: shiftForecastDate(START, 10),
        originEnd: shiftForecastDate(START, 12),
        lookbackDays: 7,
        pinnedTimeZone: TZ,
      }),
    ).toThrow(/exactly three model rows/);

    const mismatchedCounts = {
      ...harness,
      models: harness.models.map((model, index) =>
        index === 0
          ? {
              ...model,
              backtest: {
                ...model.backtest,
                observationCount: model.backtest.observationCount + 1,
              },
            }
          : model,
      ),
    };
    expect(() =>
      buildForecastDiagnosticEvaluationReport({
        integrity,
        harness: mismatchedCounts,
        originStart: shiftForecastDate(START, 10),
        originEnd: shiftForecastDate(START, 12),
        lookbackDays: 7,
        pinnedTimeZone: TZ,
      }),
    ).toThrow(/observation counts must match/);
  });

  it("validates optional persistence linkage and rejects mismatched identity", () => {
    const integrity = acceptedIntegrity();
    const originStart = shiftForecastDate(START, 10);
    const originEnd = shiftForecastDate(START, 12);
    const harness = evaluateForecastBacktestHarness({
      grain: GRAIN,
      originStart,
      originEnd,
      lookbackDays: 7,
      facts: integrity.facts,
    });

    const reportWithout = buildForecastDiagnosticEvaluationReport({
      integrity,
      harness,
      originStart,
      originEnd,
      lookbackDays: 7,
      pinnedTimeZone: TZ,
    });

    const linkage: ForecastDiagnosticPersistenceLinkage = {
      evaluationRunId: "6100e000-0000-4000-8000-0000000000a1",
      disposition: "created",
      isScoredEvaluation: true,
      claimsProductionApproval: false,
      claimsM7NumericEligibility: false,
      algorithmApproved: false,
      grain: GRAIN,
      payload: {
        fixtureFingerprint: reportWithout.identity.fixtureFingerprint!,
        originStart,
        originEnd,
        lookbackDays: 7,
        integritySourceClass: integrity.sourceClass,
        integrityDisposition: integrity.disposition,
        evaluationDisposition: harness.disposition,
        originCount: harness.originCount,
        scoredDates: [...harness.scoredDates],
        models: harness.models.map((model) => ({
          model: model.model,
          observationCount: model.backtest.observationCount,
        })),
      },
    };

    const linked = buildForecastDiagnosticEvaluationReport({
      integrity,
      harness,
      originStart,
      originEnd,
      lookbackDays: 7,
      pinnedTimeZone: TZ,
      persistence: linkage,
    });
    expect(linked.identity.evaluationRunId).toBe(linkage.evaluationRunId);

    expect(() =>
      buildForecastDiagnosticEvaluationReport({
        integrity,
        harness,
        originStart,
        originEnd,
        lookbackDays: 7,
        pinnedTimeZone: TZ,
        persistence: {
          ...linkage,
          payload: {
            ...linkage.payload,
            fixtureFingerprint: "deadbeefdeadbeefdeadbeefdeadbeef",
          },
        },
      }),
    ).toThrow(/fixtureFingerprint/);
  });

  it("emits deterministic JSON and Markdown snapshots", () => {
    const integrity = acceptedIntegrity();
    const originStart = shiftForecastDate(START, 10);
    const originEnd = shiftForecastDate(START, 12);
    const harness = evaluateForecastBacktestHarness({
      grain: GRAIN,
      originStart,
      originEnd,
      lookbackDays: 7,
      facts: integrity.facts,
    });

    const input = {
      integrity,
      harness,
      originStart,
      originEnd,
      lookbackDays: 7,
      pinnedTimeZone: TZ,
    } as const;

    const a = buildForecastDiagnosticEvaluationReport(input);
    const b = buildForecastDiagnosticEvaluationReport(input);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));

    const mdA = formatForecastDiagnosticEvaluationReportMarkdown(a);
    const mdB = formatForecastDiagnosticEvaluationReportMarkdown(b);
    expect(mdA).toBe(mdB);
    expect(mdA).toContain("NOT_merchant_performance");
    expect(mdA).toContain("NOT_production_activation");
    expect(mdA).toContain("| candidate |");
    expect(mdA).toContain("| naive_lag1 |");
    expect(mdA).toContain("| zero |");
    expect(a.provenance.claimsProductionApproval).toBe(false);
    expect(a.provenance.algorithmApproved).toBe(false);
    expect(a.provenance.claimsM7NumericEligibility).toBe(false);
  });
});
