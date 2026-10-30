import { createHash } from "node:crypto";

import {
  FORECAST_BACKTEST_HARNESS_VERSION_V1,
  FORECAST_BACKTEST_HORIZON_DAYS_V1,
  FORECAST_BACKTEST_MIN_ORIGINS_V1,
  type ForecastBacktestHarnessResult,
  type ForecastBacktestModelScores,
} from "./backtest-harness";

import { FORECAST_BACKTEST_VERSION_V1 } from "./backtesting";

import {
  FORECAST_HISTORICAL_EVIDENCE_INTEGRITY_VERSION_V1,
  type HistoricalEvidenceIntegrityResult,
} from "./historical-evidence-integrity";

import {
  FORECAST_CONFIGURATION_VERSION_V1,
  FORECAST_ORCHESTRATOR_VERSION_V1,
} from "./orchestrate";

import { FORECAST_ALGORITHM_VERSIONS_V1 } from "./reproducibility";

import type { ForecastGrain } from "./series";

/**
 * M6 P4d — pure TypeScript local diagnostic evaluation report.
 *
 * Builds from P4b integrity + P4a harness (optional P4c persistence linkage).
 * Does not recalculate forecast metrics, publish, approve algorithms, or
 * claim merchant/live performance.
 */

export const FORECAST_DIAGNOSTIC_EVALUATION_REPORT_VERSION_V1 =
  "forecast-diagnostic-evaluation-report-v1" as const;

export type ForecastDiagnosticEvidenceScope =
  | "controlled_pit_fixture_only"
  | "unsupported_or_invalid";

export type ForecastDiagnosticDisposition =
  | "preliminary"
  | "INSUFFICIENT_BACKTEST_POINTS"
  | "NO_ELIGIBLE_ORIGINS"
  | "INVALID_HISTORY"
  | "UNSUPPORTED_HISTORICAL_REPLAY";

export type ForecastDiagnosticBaselineModel =
  | "candidate"
  | "naive_lag1"
  | "zero";

/**
 * Optional P4c persistence linkage. Structurally compatible with
 * PersistForecastEvaluationResult without importing server-only modules.
 */
export interface ForecastDiagnosticPersistenceLinkage {
  evaluationRunId: string;
  disposition: "created" | "replayed";
  isScoredEvaluation: boolean;
  claimsProductionApproval: false;
  claimsM7NumericEligibility: false;
  algorithmApproved: false;
  grain: ForecastGrain;
  payload: {
    fixtureFingerprint: string;
    originStart: string;
    originEnd: string;
    lookbackDays: number;
    integritySourceClass: string;
    integrityDisposition: string;
    evaluationDisposition: string;
    originCount: number;
    scoredDates: readonly string[];
    models: readonly { model: string; observationCount: number }[];
  };
}

export interface ForecastDiagnosticBaselineRow {
  model: ForecastDiagnosticBaselineModel;
  observationCount: number;
  mae: number | null;
  wape: number | null;
  biasRatio: number | null;
  mase: number | null;
  metricReasonCodes: readonly string[];
  vsCandidate: {
    maeDelta: number | null;
    wapeDelta: number | null;
    biasDelta: number | null;
    maseAvailable: boolean;
  } | null;
}

export interface ForecastDiagnosticEvaluationReportV1 {
  reportVersion: typeof FORECAST_DIAGNOSTIC_EVALUATION_REPORT_VERSION_V1;
  audience: "local_developer";
  evidenceScope: ForecastDiagnosticEvidenceScope;

  identity: {
    grain: ForecastGrain;
    originStart: string;
    originEnd: string;
    lookbackDays: number;
    harnessHorizonDays: typeof FORECAST_BACKTEST_HORIZON_DAYS_V1;
    fixtureFingerprint: string | null;
    evaluationRunId: string | null;
    persistDisposition: "created" | "replayed" | null;
  };

  versions: {
    harness: typeof FORECAST_BACKTEST_HARNESS_VERSION_V1;
    integrity: typeof FORECAST_HISTORICAL_EVIDENCE_INTEGRITY_VERSION_V1;
    backtestMetric: typeof FORECAST_BACKTEST_VERSION_V1;
    orchestrator: typeof FORECAST_ORCHESTRATOR_VERSION_V1;
    configuration: typeof FORECAST_CONFIGURATION_VERSION_V1;
    algorithmVersions: typeof FORECAST_ALGORITHM_VERSIONS_V1;
  };

  provenance: {
    integritySourceClass: string;
    integrityDisposition: string;
    integrityReasonCodes: readonly string[];
    pinnedTimeZone: string | null;
    isScoredEvaluation: boolean;
    claimsProductionApproval: false;
    claimsM7NumericEligibility: false;
    algorithmApproved: false;
    notMerchantPerformance: true;
    notProductionActivation: true;
    controlledFixtureOnly: boolean;
  };

  diagnosticDisposition: ForecastDiagnosticDisposition;

  sample: {
    originCount: number;
    minOriginsRequired: typeof FORECAST_BACKTEST_MIN_ORIGINS_V1;
    scoredDates: readonly string[];
    demandClass: string;
    segments: readonly {
      demandClass: string;
      originCount: number;
      scoredDates: readonly string[];
    }[];
    exclusionReasons: readonly string[];
  };

  baselines: readonly ForecastDiagnosticBaselineRow[];
  baselineComparisonAvailable: boolean;

  interpretation: {
    summary: string;
    comparisonNotes: readonly string[];
    forbiddenInferences: readonly [
      "algorithm_approved",
      "m7_numeric_eligible",
      "production_activation",
      "merchant_live_performance",
      "commercial_roi",
    ];
    warnings: readonly [
      "controlled_fixture_only",
      "NOT_merchant_performance",
      "NOT_production_activation",
    ];
  };
}

export interface BuildForecastDiagnosticEvaluationReportInput {
  integrity: HistoricalEvidenceIntegrityResult;
  /**
   * Required when integrity is accepted. Must be null for rejected integrity.
   */
  harness: ForecastBacktestHarnessResult | null;
  originStart: string;
  originEnd: string;
  lookbackDays: number;
  /**
   * Store timezone used for fixture identity. Accepted integrity should match
   * integrity.pinnedTimeZone; required for rejected integrity reports.
   */
  pinnedTimeZone: string;
  persistence?: ForecastDiagnosticPersistenceLinkage | null;
}

export class ForecastDiagnosticEvaluationReportError extends Error {
  readonly code = "FORECAST_DIAGNOSTIC_EVALUATION_REPORT";

  constructor(message: string) {
    super(message);
    this.name = "ForecastDiagnosticEvaluationReportError";
  }
}

const FORBIDDEN_INFERENCES = [
  "algorithm_approved",
  "m7_numeric_eligible",
  "production_activation",
  "merchant_live_performance",
  "commercial_roi",
] as const;

const WARNINGS = [
  "controlled_fixture_only",
  "NOT_merchant_performance",
  "NOT_production_activation",
] as const;

const MODEL_ORDER: readonly ForecastDiagnosticBaselineModel[] = [
  "candidate",
  "naive_lag1",
  "zero",
];

/**
 * Build ForecastDiagnosticEvaluationReportV1 from P4b + P4a (+ optional P4c).
 * Reuses harness metrics; does not recalculate forecasting math.
 */
export function buildForecastDiagnosticEvaluationReport(
  input: BuildForecastDiagnosticEvaluationReportInput,
): ForecastDiagnosticEvaluationReportV1 {
  assertReportInput(input);

  const { integrity, harness, originStart, originEnd, lookbackDays } = input;
  const persistence = input.persistence ?? null;
  const pinnedTimeZone = assertPinnedTimeZone(input.pinnedTimeZone);

  if (
    integrity.disposition === "INVALID_HISTORY" ||
    integrity.disposition === "UNSUPPORTED_HISTORICAL_REPLAY"
  ) {
    if (harness !== null) {
      throw new ForecastDiagnosticEvaluationReportError(
        "rejected integrity must not include a harness result.",
      );
    }

    const report = buildRejectionReport({
      integrity,
      originStart,
      originEnd,
      lookbackDays,
      pinnedTimeZone,
      persistence,
    });
    validatePersistenceLinkage(report, persistence, null);
    return report;
  }

  if (harness === null) {
    throw new ForecastDiagnosticEvaluationReportError(
      "accepted integrity requires a harness result.",
    );
  }

  if (integrity.disposition !== "accepted") {
    throw new ForecastDiagnosticEvaluationReportError(
      "accepted integrity path requires disposition accepted.",
    );
  }

  if (integrity.pinnedTimeZone !== pinnedTimeZone) {
    throw new ForecastDiagnosticEvaluationReportError(
      "pinnedTimeZone must match accepted integrity.pinnedTimeZone.",
    );
  }

  assertAcceptedHarnessConsistency(integrity, harness, originStart, originEnd);
  assertTrustFlags(integrity, harness);

  const scored =
    harness.disposition === "preliminary" ||
    harness.disposition === "INSUFFICIENT_BACKTEST_POINTS";

  if (scored) {
    assertComparableBaselines(harness);
  } else if (harness.models.length !== 0) {
    throw new ForecastDiagnosticEvaluationReportError(
      "non-scored harness results must not include model baselines.",
    );
  }

  const baselines = scored
    ? buildBaselineRows(harness.models)
    : [];

  const exclusionReasons = uniqueSorted([
    ...integrity.reasonCodes,
    ...harness.reasonCodes,
  ]);

  const fixtureFingerprint = deriveFixtureFingerprint(
    integrity,
    pinnedTimeZone,
  );

  const report: ForecastDiagnosticEvaluationReportV1 = {
    reportVersion: FORECAST_DIAGNOSTIC_EVALUATION_REPORT_VERSION_V1,
    audience: "local_developer",
    evidenceScope: "controlled_pit_fixture_only",
    identity: {
      grain: cloneGrain(harness.grain),
      originStart,
      originEnd,
      lookbackDays,
      harnessHorizonDays: FORECAST_BACKTEST_HORIZON_DAYS_V1,
      fixtureFingerprint,
      evaluationRunId: persistence?.evaluationRunId ?? null,
      persistDisposition: persistence?.disposition ?? null,
    },
    versions: {
      harness: FORECAST_BACKTEST_HARNESS_VERSION_V1,
      integrity: FORECAST_HISTORICAL_EVIDENCE_INTEGRITY_VERSION_V1,
      backtestMetric: FORECAST_BACKTEST_VERSION_V1,
      orchestrator: FORECAST_ORCHESTRATOR_VERSION_V1,
      configuration: FORECAST_CONFIGURATION_VERSION_V1,
      algorithmVersions: FORECAST_ALGORITHM_VERSIONS_V1,
    },
    provenance: {
      integritySourceClass: integrity.sourceClass,
      integrityDisposition: integrity.disposition,
      integrityReasonCodes: [...integrity.reasonCodes].sort(),
      pinnedTimeZone,
      isScoredEvaluation: scored,
      claimsProductionApproval: false,
      claimsM7NumericEligibility: false,
      algorithmApproved: false,
      notMerchantPerformance: true,
      notProductionActivation: true,
      controlledFixtureOnly: true,
    },
    diagnosticDisposition: harness.disposition,
    sample: {
      originCount: harness.originCount,
      minOriginsRequired: FORECAST_BACKTEST_MIN_ORIGINS_V1,
      scoredDates: [...harness.scoredDates],
      demandClass: harness.demandClass,
      segments: harness.segments.map((segment) => ({
        demandClass: segment.demandClass,
        originCount: segment.originCount,
        scoredDates: [...segment.scoredDates],
      })),
      exclusionReasons,
    },
    baselines,
    baselineComparisonAvailable: scored,
    interpretation: {
      summary: buildSummary({
        disposition: harness.disposition,
        scored,
        originCount: harness.originCount,
        demandClass: harness.demandClass,
      }),
      comparisonNotes: buildComparisonNotes({
        scored,
        scoredDates: harness.scoredDates,
        baselines,
        disposition: harness.disposition,
      }),
      forbiddenInferences: FORBIDDEN_INFERENCES,
      warnings: WARNINGS,
    },
  };

  validatePersistenceLinkage(report, persistence, harness);
  return report;
}

/**
 * Deterministic Markdown rendering of a diagnostic report.
 */
export function formatForecastDiagnosticEvaluationReportMarkdown(
  report: ForecastDiagnosticEvaluationReportV1,
): string {
  const lines: string[] = [];
  lines.push(`# Forecast diagnostic evaluation report`);
  lines.push(``);
  lines.push(`- reportVersion: \`${report.reportVersion}\``);
  lines.push(`- audience: \`${report.audience}\``);
  lines.push(`- evidenceScope: \`${report.evidenceScope}\``);
  lines.push(`- diagnosticDisposition: \`${report.diagnosticDisposition}\``);
  lines.push(``);
  lines.push(`## Warnings`);
  for (const warning of report.interpretation.warnings) {
    lines.push(`- **${warning}**`);
  }
  lines.push(``);
  lines.push(`## Identity`);
  lines.push(
    `- grain: \`${report.identity.grain.organizationId}/${report.identity.grain.storeId}/${report.identity.grain.locationId}/${report.identity.grain.variantId}\``,
  );
  lines.push(
    `- window: \`${report.identity.originStart}\` → \`${report.identity.originEnd}\` (lookback ${report.identity.lookbackDays}, H=${report.identity.harnessHorizonDays})`,
  );
  lines.push(
    `- fixtureFingerprint: \`${report.identity.fixtureFingerprint ?? "null"}\``,
  );
  lines.push(
    `- evaluationRunId: \`${report.identity.evaluationRunId ?? "null"}\``,
  );
  lines.push(
    `- persistDisposition: \`${report.identity.persistDisposition ?? "null"}\``,
  );
  lines.push(``);
  lines.push(`## Provenance`);
  lines.push(
    `- integrity: \`${report.provenance.integritySourceClass}\` / \`${report.provenance.integrityDisposition}\``,
  );
  lines.push(
    `- isScoredEvaluation: \`${String(report.provenance.isScoredEvaluation)}\``,
  );
  lines.push(
    `- claimsProductionApproval: \`${String(report.provenance.claimsProductionApproval)}\``,
  );
  lines.push(
    `- algorithmApproved: \`${String(report.provenance.algorithmApproved)}\``,
  );
  lines.push(
    `- claimsM7NumericEligibility: \`${String(report.provenance.claimsM7NumericEligibility)}\``,
  );
  lines.push(``);
  lines.push(`## Sample`);
  lines.push(
    `- originCount: \`${report.sample.originCount}\` (min ${report.sample.minOriginsRequired})`,
  );
  lines.push(`- demandClass: \`${report.sample.demandClass}\``);
  lines.push(
    `- scoredDates: ${
      report.sample.scoredDates.length === 0
        ? "`[]`"
        : report.sample.scoredDates.map((d) => `\`${d}\``).join(", ")
    }`,
  );
  if (report.sample.exclusionReasons.length > 0) {
    lines.push(
      `- exclusionReasons: ${report.sample.exclusionReasons
        .map((r) => `\`${r}\``)
        .join(", ")}`,
    );
  }
  lines.push(``);
  lines.push(`## Baselines`);
  if (!report.baselineComparisonAvailable || report.baselines.length === 0) {
    lines.push(`- baseline comparison unavailable (unscored diagnostic).`);
  } else {
    lines.push(
      `| model | n | MAE | WAPE | bias | MASE | reasons |`,
    );
    lines.push(`|---|---:|---:|---:|---:|---:|---|`);
    for (const row of report.baselines) {
      lines.push(
        `| ${row.model} | ${row.observationCount} | ${fmtMetric(row.mae)} | ${fmtMetric(row.wape)} | ${fmtMetric(row.biasRatio)} | ${fmtMetric(row.mase)} | ${
          row.metricReasonCodes.length === 0
            ? ""
            : row.metricReasonCodes.join(", ")
        } |`,
      );
    }
  }
  lines.push(``);
  lines.push(`## Interpretation`);
  lines.push(report.interpretation.summary);
  for (const note of report.interpretation.comparisonNotes) {
    lines.push(`- ${note}`);
  }
  lines.push(``);
  lines.push(`## Forbidden inferences`);
  for (const item of report.interpretation.forbiddenInferences) {
    lines.push(`- \`${item}\``);
  }
  lines.push(``);
  return `${lines.join("\n")}`;
}

function buildRejectionReport(args: {
  integrity: Extract<
    HistoricalEvidenceIntegrityResult,
    { disposition: "INVALID_HISTORY" | "UNSUPPORTED_HISTORICAL_REPLAY" }
  >;
  originStart: string;
  originEnd: string;
  lookbackDays: number;
  pinnedTimeZone: string;
  persistence: ForecastDiagnosticPersistenceLinkage | null;
}): ForecastDiagnosticEvaluationReportV1 {
  const {
    integrity,
    originStart,
    originEnd,
    lookbackDays,
    pinnedTimeZone,
    persistence,
  } = args;

  return {
    reportVersion: FORECAST_DIAGNOSTIC_EVALUATION_REPORT_VERSION_V1,
    audience: "local_developer",
    evidenceScope: "unsupported_or_invalid",
    identity: {
      grain: cloneGrain(integrity.grain),
      originStart,
      originEnd,
      lookbackDays,
      harnessHorizonDays: FORECAST_BACKTEST_HORIZON_DAYS_V1,
      fixtureFingerprint: deriveFixtureFingerprint(integrity, pinnedTimeZone),
      evaluationRunId: persistence?.evaluationRunId ?? null,
      persistDisposition: persistence?.disposition ?? null,
    },
    versions: {
      harness: FORECAST_BACKTEST_HARNESS_VERSION_V1,
      integrity: FORECAST_HISTORICAL_EVIDENCE_INTEGRITY_VERSION_V1,
      backtestMetric: FORECAST_BACKTEST_VERSION_V1,
      orchestrator: FORECAST_ORCHESTRATOR_VERSION_V1,
      configuration: FORECAST_CONFIGURATION_VERSION_V1,
      algorithmVersions: FORECAST_ALGORITHM_VERSIONS_V1,
    },
    provenance: {
      integritySourceClass: integrity.sourceClass,
      integrityDisposition: integrity.disposition,
      integrityReasonCodes: [...integrity.reasonCodes].sort(),
      pinnedTimeZone,
      isScoredEvaluation: false,
      claimsProductionApproval: false,
      claimsM7NumericEligibility: false,
      algorithmApproved: false,
      notMerchantPerformance: true,
      notProductionActivation: true,
      controlledFixtureOnly: false,
    },
    diagnosticDisposition: integrity.disposition,
    sample: {
      originCount: 0,
      minOriginsRequired: FORECAST_BACKTEST_MIN_ORIGINS_V1,
      scoredDates: [],
      demandClass: "unknown",
      segments: [],
      exclusionReasons: uniqueSorted([...integrity.reasonCodes]),
    },
    baselines: [],
    baselineComparisonAvailable: false,
    interpretation: {
      summary:
        `Historical evidence disposition ${integrity.disposition}; unscored diagnostic rejection — not a successful baseline evaluation.`,
      comparisonNotes: [
        "No candidate/naive/zero comparison: historical evidence was rejected.",
        "This report is not merchant performance and does not approve production use.",
      ],
      forbiddenInferences: FORBIDDEN_INFERENCES,
      warnings: WARNINGS,
    },
  };
}

function buildBaselineRows(
  models: readonly ForecastBacktestModelScores[],
): ForecastDiagnosticBaselineRow[] {
  const byModel = new Map<ForecastDiagnosticBaselineModel, ForecastBacktestModelScores>();
  for (const model of models) {
    byModel.set(model.model, model);
  }

  const candidate = byModel.get("candidate");
  if (candidate === undefined) {
    throw new ForecastDiagnosticEvaluationReportError(
      "scored report requires a candidate model row.",
    );
  }

  const rows: ForecastDiagnosticBaselineRow[] = [];
  for (const name of MODEL_ORDER) {
    const model = byModel.get(name);
    if (model === undefined) {
      throw new ForecastDiagnosticEvaluationReportError(
        `scored report missing model ${name}.`,
      );
    }

    const metricReasonCodes = uniqueSorted([
      ...model.backtest.reasonCodes,
      ...(model.maseReasonCode !== null ? [model.maseReasonCode] : []),
    ]);

    assertFiniteOrNull(model.backtest.mae, `${name}.mae`);
    assertFiniteOrNull(model.backtest.wape, `${name}.wape`);
    assertFiniteOrNull(model.backtest.biasRatio, `${name}.biasRatio`);
    assertFiniteOrNull(model.mase, `${name}.mase`);

    rows.push({
      model: name,
      observationCount: model.backtest.observationCount,
      mae: model.backtest.mae,
      wape: model.backtest.wape,
      biasRatio: model.backtest.biasRatio,
      mase: model.mase,
      metricReasonCodes,
      vsCandidate:
        name === "candidate"
          ? null
          : {
              maeDelta: deltaOrNull(model.backtest.mae, candidate.backtest.mae),
              wapeDelta: deltaOrNull(
                model.backtest.wape,
                candidate.backtest.wape,
              ),
              biasDelta: deltaOrNull(
                model.backtest.biasRatio,
                candidate.backtest.biasRatio,
              ),
              maseAvailable:
                model.mase !== null && candidate.mase !== null,
            },
    });
  }

  return rows;
}

function assertComparableBaselines(
  harness: ForecastBacktestHarnessResult,
): void {
  if (harness.models.length !== 3) {
    throw new ForecastDiagnosticEvaluationReportError(
      "scored diagnostic report requires exactly three model rows.",
    );
  }

  const names = harness.models.map((model) => model.model).sort();
  if (names.join(",") !== "candidate,naive_lag1,zero") {
    throw new ForecastDiagnosticEvaluationReportError(
      "scored diagnostic report models must be candidate, naive_lag1, and zero.",
    );
  }

  const counts = new Set(
    harness.models.map((model) => model.backtest.observationCount),
  );
  if (counts.size !== 1 || !counts.has(harness.originCount)) {
    throw new ForecastDiagnosticEvaluationReportError(
      "model observation counts must match each other and originCount.",
    );
  }

  for (const segment of harness.segments) {
    if (!sameStringList(segment.scoredDates, harness.scoredDates)) {
      throw new ForecastDiagnosticEvaluationReportError(
        "segment scoredDates must match harness scoredDates.",
      );
    }
  }
}

function assertAcceptedHarnessConsistency(
  integrity: HistoricalEvidenceIntegrityResult,
  harness: ForecastBacktestHarnessResult,
  originStart: string,
  originEnd: string,
): void {
  if (integrity.disposition !== "accepted") {
    throw new ForecastDiagnosticEvaluationReportError(
      "accepted harness path requires accepted integrity.",
    );
  }

  if (integrity.sourceClass !== "controlled_pit_fixture") {
    throw new ForecastDiagnosticEvaluationReportError(
      "accepted integrity for reporting must be controlled_pit_fixture.",
    );
  }

  if (!sameGrain(integrity.grain, harness.grain)) {
    throw new ForecastDiagnosticEvaluationReportError(
      "integrity and harness grains do not match.",
    );
  }

  if (harness.harnessHorizonDays !== 1) {
    throw new ForecastDiagnosticEvaluationReportError(
      "diagnostic report requires harnessHorizonDays = 1.",
    );
  }

  if (originStart > originEnd) {
    throw new ForecastDiagnosticEvaluationReportError(
      "originStart must be <= originEnd.",
    );
  }

  void originStart;
  void originEnd;
}

function assertTrustFlags(
  integrity: HistoricalEvidenceIntegrityResult,
  harness: ForecastBacktestHarnessResult,
): void {
  if (
    integrity.claimsProductionApproval !== false ||
    integrity.claimsM7NumericEligibility !== false ||
    harness.claimsProductionApproval !== false ||
    harness.claimsM7NumericEligibility !== false
  ) {
    throw new ForecastDiagnosticEvaluationReportError(
      "diagnostic report rejects production/M7 approval claims on inputs.",
    );
  }
}

function assertReportInput(
  input: BuildForecastDiagnosticEvaluationReportInput,
): void {
  if (
    input === null ||
    typeof input !== "object" ||
    input.integrity === null ||
    typeof input.integrity !== "object"
  ) {
    throw new ForecastDiagnosticEvaluationReportError(
      "report input requires integrity.",
    );
  }

  if (
    typeof input.originStart !== "string" ||
    input.originStart.trim().length === 0 ||
    typeof input.originEnd !== "string" ||
    input.originEnd.trim().length === 0
  ) {
    throw new ForecastDiagnosticEvaluationReportError(
      "originStart and originEnd are required.",
    );
  }

  if (
    !Number.isInteger(input.lookbackDays) ||
    input.lookbackDays < 1 ||
    input.lookbackDays > 365
  ) {
    throw new ForecastDiagnosticEvaluationReportError(
      "lookbackDays must be an integer from 1 to 365.",
    );
  }
}

function validatePersistenceLinkage(
  report: ForecastDiagnosticEvaluationReportV1,
  persistence: ForecastDiagnosticPersistenceLinkage | null,
  harness: ForecastBacktestHarnessResult | null,
): void {
  if (persistence === null) {
    return;
  }

  if (
    persistence.claimsProductionApproval !== false ||
    persistence.claimsM7NumericEligibility !== false ||
    persistence.algorithmApproved !== false
  ) {
    throw new ForecastDiagnosticEvaluationReportError(
      "persistence linkage must not claim production/M7/algorithm approval.",
    );
  }

  if (!sameGrain(persistence.grain, report.identity.grain)) {
    throw new ForecastDiagnosticEvaluationReportError(
      "persistence grain does not match report grain.",
    );
  }

  if (
    persistence.payload.originStart !== report.identity.originStart ||
    persistence.payload.originEnd !== report.identity.originEnd ||
    persistence.payload.lookbackDays !== report.identity.lookbackDays
  ) {
    throw new ForecastDiagnosticEvaluationReportError(
      "persistence evaluation window does not match report identity.",
    );
  }

  if (
    persistence.payload.integrityDisposition !==
      report.provenance.integrityDisposition ||
    persistence.payload.integritySourceClass !==
      report.provenance.integritySourceClass
  ) {
    throw new ForecastDiagnosticEvaluationReportError(
      "persistence integrity provenance does not match report.",
    );
  }

  if (
    persistence.payload.evaluationDisposition !==
    report.diagnosticDisposition
  ) {
    throw new ForecastDiagnosticEvaluationReportError(
      "persistence evaluationDisposition does not match diagnostic disposition.",
    );
  }

  if (
    persistence.isScoredEvaluation !== report.provenance.isScoredEvaluation
  ) {
    throw new ForecastDiagnosticEvaluationReportError(
      "persistence isScoredEvaluation does not match report.",
    );
  }

  if (
    report.identity.fixtureFingerprint !== null &&
    persistence.payload.fixtureFingerprint !==
      report.identity.fixtureFingerprint
  ) {
    throw new ForecastDiagnosticEvaluationReportError(
      "persistence fixtureFingerprint does not match report.",
    );
  }

  if (harness !== null && report.baselineComparisonAvailable) {
    if (
      persistence.payload.originCount !== report.sample.originCount ||
      !sameStringList(persistence.payload.scoredDates, report.sample.scoredDates)
    ) {
      throw new ForecastDiagnosticEvaluationReportError(
        "persistence scored sample does not match report sample.",
      );
    }

    if (persistence.payload.models.length !== 3) {
      throw new ForecastDiagnosticEvaluationReportError(
        "scored persistence linkage must include three model rows.",
      );
    }
  } else if (persistence.payload.models.length !== 0) {
    throw new ForecastDiagnosticEvaluationReportError(
      "unscored persistence linkage must include zero model rows.",
    );
  }
}

function buildSummary(args: {
  disposition: ForecastDiagnosticDisposition;
  scored: boolean;
  originCount: number;
  demandClass: string;
}): string {
  if (!args.scored) {
    return `Diagnostic disposition ${args.disposition} with no scored baselines (origins=${args.originCount}).`;
  }

  if (args.disposition === "INSUFFICIENT_BACKTEST_POINTS") {
    return `Insufficient-sample diagnostic (${args.originCount} origins, demandClass=${args.demandClass}); below the ${FORECAST_BACKTEST_MIN_ORIGINS_V1}-origin floor — not algorithm approval.`;
  }

  return `Preliminary diagnostic comparison across candidate/naive_lag1/zero on ${args.originCount} identical scored dates (demandClass=${args.demandClass}).`;
}

function buildComparisonNotes(args: {
  scored: boolean;
  scoredDates: readonly string[];
  baselines: readonly ForecastDiagnosticBaselineRow[];
  disposition: ForecastDiagnosticDisposition;
}): string[] {
  const notes: string[] = [
    "NOT merchant performance; controlled fixture diagnostic only.",
    "NOT production activation; trust flags remain false.",
  ];

  if (!args.scored) {
    notes.push("Baseline numerical comparison omitted for unscored disposition.");
    return notes;
  }

  notes.push(
    `Identical scoredDates across models (n=${args.scoredDates.length}).`,
  );
  notes.push(`Diagnostic disposition: ${args.disposition}.`);

  for (const row of args.baselines) {
    if (row.wape === null || row.biasRatio === null) {
      notes.push(
        `${row.model}: WAPE/bias unavailable (${row.metricReasonCodes.join(", ") || "null metrics"}).`,
      );
      break;
    }
  }

  const candidate = args.baselines.find((row) => row.model === "candidate");
  if (candidate?.mase === null) {
    notes.push(
      `candidate MASE unavailable (${candidate.metricReasonCodes.join(", ") || "null"}).`,
    );
  }

  notes.push(
    "Numerical deltas vs candidate are descriptive only; they do not imply algorithm superiority or commercial ROI.",
  );

  return notes;
}

function deriveFixtureFingerprint(
  integrity: HistoricalEvidenceIntegrityResult,
  pinnedTimeZone: string,
): string {
  // Must match P4c.2 persist fixtureFingerprint materialization.
  return createHash("md5")
    .update(
      stableSerialize({
        integrityVersion: FORECAST_HISTORICAL_EVIDENCE_INTEGRITY_VERSION_V1,
        sourceClass: integrity.sourceClass,
        disposition: integrity.disposition,
        reasonCodes: integrity.reasonCodes,
        facts: integrity.facts,
        pinnedTimeZone,
      }),
      "utf8",
    )
    .digest("hex");
}

function assertPinnedTimeZone(value: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ForecastDiagnosticEvaluationReportError(
      "pinnedTimeZone is required.",
    );
  }
  return value.trim();
}

function deltaOrNull(
  left: number | null,
  right: number | null,
): number | null {
  if (left === null || right === null) {
    return null;
  }
  return left - right;
}

function assertFiniteOrNull(value: number | null, field: string): void {
  if (value === null) {
    return;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ForecastDiagnosticEvaluationReportError(
      `diagnostic report rejects non-finite ${field}.`,
    );
  }
}

function fmtMetric(value: number | null): string {
  return value === null ? "null" : String(value);
}

function cloneGrain(grain: ForecastGrain): ForecastGrain {
  return {
    organizationId: grain.organizationId,
    storeId: grain.storeId,
    locationId: grain.locationId,
    variantId: grain.variantId,
  };
}

function sameGrain(left: ForecastGrain, right: ForecastGrain): boolean {
  return (
    left.organizationId === right.organizationId &&
    left.storeId === right.storeId &&
    left.locationId === right.locationId &&
    left.variantId === right.variantId
  );
}

function sameStringList(
  left: readonly string[],
  right: readonly string[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) {
      return false;
    }
  }
  return true;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function stableSerialize(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([a], [b]) => a.localeCompare(b),
    );
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`)
      .join(",")}}`;
  }
  throw new ForecastDiagnosticEvaluationReportError(
    "Unsupported diagnostic fingerprint value.",
  );
}
