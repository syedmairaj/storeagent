import type {
  StoreAgentEvaluationRisk,
  StoreAgentEvaluationScenario,
} from "@/tests/evaluation/types";

import {
  decisionV1Fixture,
  type DecisionV1EvaluationInput,
} from "@/tests/fixtures/decision/decision-v1-matrix";

import {
  decisionV1Goldens,
} from "@/tests/golden/decision/decision-v1-matrix";

const metadata:
  Readonly<
    Record<
      string,
      {
        title: string;
        risk:
          StoreAgentEvaluationRisk;
        protects:
          readonly string[];
      }
    >
  > =
{
  "decision/reorder-critical-v1": {
    "title": "Reorder Critical",
    "risk": "critical",
    "protects": [
      "A trusted positive deterministic replenishment quantity produces REORDER and preserves that quantity."
    ]
  },
  "decision/reorder-known-zero-incoming-v1": {
    "title": "Reorder Known Zero Incoming",
    "risk": "critical",
    "protects": [
      "Known-zero incoming inventory must remain trusted zero rather than unknown."
    ]
  },
  "decision/reduce-incoming-excess-v1": {
    "title": "Reduce Incoming Excess",
    "risk": "critical",
    "protects": [
      "Trusted incoming inventory that creates an overstock position produces REDUCE."
    ]
  },
  "decision/promote-aged-excess-v1": {
    "title": "Promote Aged Excess",
    "risk": "high",
    "protects": [
      "Existing aged excess inventory with no incoming supply can produce PROMOTE without incorrectly producing REDUCE."
    ]
  },
  "decision/promote-known-zero-demand-v1": {
    "title": "Promote Known Zero Demand",
    "risk": "critical",
    "protects": [
      "Known zero demand remains commercial evidence rather than being mistaken for unknown demand."
    ]
  },
  "decision/reduce-primary-promote-secondary-v1": {
    "title": "Reduce Primary Promote Secondary",
    "risk": "critical",
    "protects": [
      "REDUCE and PROMOTE are compatible; REDUCE remains primary while PROMOTE is retained as secondary."
    ]
  },
  "decision/reorder-reduce-conflict-watch-v1": {
    "title": "Reorder Reduce Conflict Watch",
    "risk": "critical",
    "protects": [
      "Contradictory replenishment and reduction evidence must fail safely to WATCH rather than arbitrarily selecting an action."
    ]
  },
  "decision/reorder-promote-conflict-watch-v1": {
    "title": "Reorder Promote Conflict Watch",
    "risk": "critical",
    "protects": [
      "Contradictory replenishment and promotion evidence must fail safely to WATCH."
    ]
  },
  "decision/healthy-no-intervention-v1": {
    "title": "Healthy No Intervention",
    "risk": "high",
    "protects": [
      "Trusted evidence with no supported intervention remains HEALTHY and does not force an action."
    ]
  },
  "decision/watch-unknown-inventory-v1": {
    "title": "Watch Unknown Inventory",
    "risk": "critical",
    "protects": [
      "Unknown available inventory must produce WATCH rather than a fabricated commercial action."
    ]
  },
  "decision/watch-unknown-incoming-v1": {
    "title": "Watch Unknown Incoming",
    "risk": "critical",
    "protects": [
      "Unknown incoming state must produce WATCH rather than silently treating incoming inventory as zero."
    ]
  },
  "decision/watch-forecast-unavailable-v1": {
    "title": "Watch Forecast Unavailable",
    "risk": "critical",
    "protects": [
      "Unavailable deterministic forecast must produce WATCH when no commercial intervention is otherwise supported."
    ]
  },
  "decision/watch-low-forecast-confidence-v1": {
    "title": "Watch Low Forecast Confidence",
    "risk": "critical",
    "protects": [
      "Low forecast confidence cannot be promoted into a trusted commercial intervention fallback."
    ]
  },
  "decision/healthy-known-zero-demand-v1": {
    "title": "Healthy Known Zero Demand",
    "risk": "critical",
    "protects": [
      "Known zero demand is distinct from unknown demand and does not automatically force WATCH."
    ]
  },
  "decision/reorder-medium-forecast-confidence-v1": {
    "title": "Reorder Medium Forecast Confidence",
    "risk": "critical",
    "protects": [
      "Decision confidence must never exceed deterministic forecast confidence."
    ]
  },
  "decision/reorder-medium-data-quality-v1": {
    "title": "Reorder Medium Data Quality",
    "risk": "high",
    "protects": [
      "Medium data quality caps otherwise-high decision confidence at medium."
    ]
  },
  "decision/reorder-low-data-quality-v1": {
    "title": "Reorder Low Data Quality",
    "risk": "critical",
    "protects": [
      "Low data quality forces low decision confidence without changing deterministic action type."
    ]
  },
  "decision/evidence-snapshot-canonical-v1": {
    "title": "Evidence Snapshot Canonical",
    "risk": "critical",
    "protects": [
      "Persisted action evidence must copy decision-time deterministic truth without recalculating it."
    ]
  },
  "decision/evidence-unknown-incoming-v1": {
    "title": "Evidence Unknown Incoming",
    "risk": "critical",
    "protects": [
      "Evidence snapshot must preserve unknown incoming state as null rather than fabricating zero."
    ]
  }
};

const goldenByScenarioId =
  new Map(
    decisionV1Goldens.map(
      (golden) => [
        golden.scenarioId,
        golden,
      ],
    ),
  );

export const DECISION_V1_SCENARIOS:
  readonly StoreAgentEvaluationScenario<
    DecisionV1EvaluationInput,
    unknown
  >[] =
  decisionV1Fixture.input.cases.map(
    (fixtureCase) => {
      const scenarioMetadata =
        metadata[
          fixtureCase.id
        ];

      if (!scenarioMetadata) {
        throw new Error(
          `Missing evaluation metadata for "${fixtureCase.id}".`,
        );
      }

      const golden =
        goldenByScenarioId.get(
          fixtureCase.id,
        );

      if (!golden) {
        throw new Error(
          `Missing approved golden for "${fixtureCase.id}".`,
        );
      }

      return {
        schemaVersion: 1,

        id:
          fixtureCase.id,

        title:
          scenarioMetadata.title,

        domain:
          "decision",

        risk:
          scenarioMetadata.risk,

        configurationVersion:
          golden.configurationVersion,

        input:
          fixtureCase.evaluation,

        expected:
          golden.expected,

        protects:
          scenarioMetadata.protects,
      };
    },
  );
