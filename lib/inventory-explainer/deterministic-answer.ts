/**
 * AI-INV-1.1 — situation-specific merchant guidance from allowlisted evidence.
 * Explains business significance; never invents causes, demand, profit,
 * lost sales, forecasts, or buy quantities.
 */

import type {
  InventoryExplainerAnswer,
  InventoryExplainerCitation,
  InventoryExplainerDiagnostics,
  InventoryExplainerEvidence,
  InventoryExplainerFactId,
  InventoryExplainerQuestionId,
} from "@/lib/inventory-explainer/types";
import { INVENTORY_EXPLAINER_ANSWER_VERSION } from "@/lib/inventory-explainer/types";

function cite(
  evidence: InventoryExplainerEvidence,
  ids: readonly InventoryExplainerFactId[],
): InventoryExplainerCitation[] {
  return ids
    .map((id) => evidence.facts.find((f) => f.id === id))
    .filter((f): f is NonNullable<typeof f> => Boolean(f))
    .map((f) => ({
      factId: f.id,
      label: f.label,
      value: f.value,
      source: f.source,
      asOf: f.asOf ?? null,
    }));
}

function baseDiagnostics(
  evidence: InventoryExplainerEvidence,
): InventoryExplainerDiagnostics {
  return {
    aiAttempted: false,
    enablementSource: "disabled_default",
    generator: "deterministic",
    candidateReceived: false,
    candidateDiscarded: false,
    discardReasons: [],
    evidenceHash: evidence.evidenceHash,
    lateResultDiscarded: false,
  };
}

function answered(
  evidence: InventoryExplainerEvidence,
  questionId: InventoryExplainerQuestionId,
  merchantAnswer: string,
  citationIds: readonly InventoryExplainerFactId[],
  diagnostics?: Partial<InventoryExplainerDiagnostics>,
): InventoryExplainerAnswer {
  return {
    schemaVersion: INVENTORY_EXPLAINER_ANSWER_VERSION,
    questionId,
    status: "answered",
    merchantAnswer,
    citations: cite(evidence, citationIds),
    nextSteps: evidence.nextSteps,
    evidenceHash: evidence.evidenceHash,
    generator: diagnostics?.generator ?? "deterministic",
    diagnostics: {
      ...baseDiagnostics(evidence),
      ...diagnostics,
      generator: diagnostics?.generator ?? "deterministic",
    },
  };
}

function abstained(
  evidence: InventoryExplainerEvidence,
  questionId: InventoryExplainerQuestionId,
  reason: string,
  citationIds: readonly InventoryExplainerFactId[],
): InventoryExplainerAnswer {
  return {
    schemaVersion: INVENTORY_EXPLAINER_ANSWER_VERSION,
    questionId,
    status: "abstained",
    merchantAnswer:
      "I cannot give confident guidance from the evidence on hand.",
    abstentionReason: reason,
    citations: cite(evidence, citationIds),
    nextSteps: evidence.nextSteps.length
      ? evidence.nextSteps
      : [
          {
            code: "abstain_insufficient",
            label:
              "Evidence is insufficient to explain further — refresh stock and metrics first.",
          },
        ],
    evidenceHash: evidence.evidenceHash,
    generator: "deterministic",
    diagnostics: baseDiagnostics(evidence),
  };
}

function factValue(
  evidence: InventoryExplainerEvidence,
  id: InventoryExplainerFactId,
): string | null {
  return evidence.facts.find((f) => f.id === id)?.value ?? null;
}

function formatHypotheses(evidence: InventoryExplainerEvidence): string {
  if (evidence.untestedHypotheses.length === 0) {
    return "";
  }
  return ` Untested hypotheses to check (not confirmed causes): ${evidence.untestedHypotheses.join("; ")}.`;
}

function nextStepsSentence(evidence: InventoryExplainerEvidence): string {
  const steps = evidence.nextSteps;
  if (steps.length === 0) {
    return "";
  }
  if (steps.length === 1) {
    return ` Next: ${steps[0].label}`;
  }
  const ordinals = ["First", "Second", "Third"] as const;
  const numbered = steps
    .map((step, index) => `${ordinals[index] ?? "Next"}: ${step.label}`)
    .join(" ");
  return ` Prioritized next steps — ${numbered}`;
}

export function buildDeterministicInventoryExplainerAnswer(
  evidence: InventoryExplainerEvidence,
  questionId: InventoryExplainerQuestionId,
): InventoryExplainerAnswer {
  const situation = evidence.guidanceSituationId;
  const significance = evidence.guidanceSignificance;

  switch (questionId) {
    case "why_flagged": {
      const condition = factValue(evidence, "stock_condition");
      if (!condition) {
        return abstained(
          evidence,
          questionId,
          "Stock condition could not be derived from trusted fields.",
          ["identity"],
        );
      }

      const parts = [significance];

      if (situation === "recorded_oos_with_positive_sales") {
        parts.push(
          "Business meaning: historical sales existed while the last recorded available quantity is zero — the urgent question is whether availability is still true, not inventing a purchase quantity.",
        );
      } else if (situation === "in_stock_zero_observed_sales") {
        parts.push(
          "Business meaning: stock is recorded on hand but no sales were observed in the window — investigate demand/visibility signals; zero observed sales is not a confirmed preference or quality conclusion.",
        );
        parts.push(formatHypotheses(evidence).trim());
      } else if (situation === "in_stock_short_history") {
        parts.push(
          "Business meaning: limited eligible history makes velocity and cover less decision-ready — not a stockout prediction.",
        );
      } else if (
        situation === "stale_stock_or_metrics" ||
        situation === "pending_metrics"
      ) {
        parts.push(
          "Business meaning: evidence freshness is the blocker — stale or pending fields are not live availability or current cover.",
        );
      } else if (situation === "low_cover_review") {
        parts.push(
          "Business meaning: calculable cover is in the low-cover review band — a planning review cue, not a purchase authorization.",
        );
      } else if (situation === "high_cover_review") {
        parts.push(
          "Business meaning: calculable cover is in the high-cover review band — not an overstock or cash claim.",
        );
      } else if (situation === "in_stock_stable_review") {
        parts.push(
          "This SKU is not in an adverse attention band from trusted signals.",
        );
      }

      parts.push(
        "This is not a REORDER, REDUCE, PROMOTE, or WATCH action.",
      );
      parts.push(nextStepsSentence(evidence).trim());

      return answered(
        evidence,
        questionId,
        parts.filter(Boolean).join(" "),
        [
          "stock_condition",
          "available",
          "velocity",
          "cover",
          "observed_at",
          "eligible_days",
          "identity",
          "next_step",
        ],
      );
    }

    case "sales_rate_meaning": {
      const velocity = factValue(evidence, "velocity");
      const eligible = factValue(evidence, "eligible_days");

      if (!velocity) {
        return abstained(
          evidence,
          questionId,
          "Sales velocity is missing from trusted metrics.",
          ["missing", "metric_provenance"],
        );
      }

      if (
        situation === "in_stock_zero_observed_sales" ||
        evidence.coverStatus === "zero_demand"
      ) {
        return answered(
          evidence,
          questionId,
          `Known-zero sales rate in the 30-day window means no units were observed sold on eligible days — distinct from unknown demand. That does not prove a preference or quality failure, and it is not a forecast or buy quantity.${formatHypotheses(evidence)}${nextStepsSentence(evidence)}`,
          ["velocity", "cover_status", "eligible_days", "available", "next_step"],
        );
      }

      if (/unknown/i.test(velocity) || situation === "unknown_or_missing_demand") {
        return answered(
          evidence,
          questionId,
          `Sales rate is unknown for this grain — StoreAgent does not treat unknown as zero.${eligible ? ` Eligible days evidence: ${eligible}.` : ""} Unknown demand is not a confirmed sales gap.${nextStepsSentence(evidence)}`,
          ["velocity", "eligible_days", "metric_provenance", "next_step"],
        );
      }

      if (situation === "recorded_oos_with_positive_sales") {
        return answered(
          evidence,
          questionId,
          `Historical sales rate (${velocity}${eligible ? `; ${eligible}` : ""}) shows positive observed demand while available quantity was last recorded at zero. Use this to prioritize availability verification — not to invent a buy quantity or stockout date.${evidence.metricIsHistorical || evidence.stockObservationsStale ? " The metric may be historical while cover is not current." : ""}${nextStepsSentence(evidence)}`,
          [
            "velocity",
            "eligible_days",
            "available",
            "observed_at",
            "metric_provenance",
            "next_step",
          ],
        );
      }

      if (situation === "in_stock_short_history") {
        return answered(
          evidence,
          questionId,
          `Sales rate (${velocity}${eligible ? `; ${eligible}` : ""}) is observed history over a short eligible window — treat it as provisional, not a stable demand forecast.${nextStepsSentence(evidence)}`,
          ["velocity", "eligible_days", "metric_provenance", "next_step"],
        );
      }

      const hist =
        evidence.metricIsHistorical || evidence.stockObservationsStale
          ? " The metric is historical while cover is not current."
          : "";

      return answered(
        evidence,
        questionId,
        `The sales rate is average units sold per day over the eligible portion of a 30-day window (${velocity}${eligible ? `; ${eligible}` : ""}). It is observed history — not a forecast and not a buy quantity.${hist}${nextStepsSentence(evidence)}`,
        ["velocity", "eligible_days", "metric_provenance", "next_step"],
      );
    }

    case "cover_unavailable": {
      if (evidence.coverAvailability === "calculable") {
        const cover = factValue(evidence, "cover");
        return answered(
          evidence,
          questionId,
          `Stock cover is calculable (${cover ?? "available"}) from trusted velocity and quantity. Calculable cover is a review input — not a healthy-stock claim or buy authorization.${nextStepsSentence(evidence)}`,
          ["cover", "cover_status", "velocity", "available", "next_step"],
        );
      }

      if (situation === "in_stock_zero_observed_sales" || evidence.coverStatus === "zero_demand") {
        return answered(
          evidence,
          questionId,
          `Cover is unavailable because sales in the velocity window are known zero — StoreAgent does not invent infinite cover from zero demand. Focus on demand/visibility investigation, not cover math.${formatHypotheses(evidence)}${nextStepsSentence(evidence)}`,
          ["cover", "cover_status", "velocity", "available", "next_step"],
        );
      }

      if (
        situation === "stale_stock_or_metrics" ||
        situation === "pending_metrics" ||
        evidence.stockObservationsStale
      ) {
        return answered(
          evidence,
          questionId,
          `Cover is unavailable because stock or metrics are not current. Stale evidence is not treated as current days-of-stock — refresh availability before reading cover.${nextStepsSentence(evidence)}`,
          ["cover", "cover_status", "metric_provenance", "observed_at", "next_step"],
        );
      }

      if (situation === "unknown_stock" || situation === "unknown_or_missing_demand") {
        return answered(
          evidence,
          questionId,
          `Cover is unavailable because required inputs are unknown. Unknown quantity or demand is not treated as zero.${nextStepsSentence(evidence)}`,
          ["cover", "cover_status", "available", "velocity", "missing", "next_step"],
        );
      }

      if (situation === "in_stock_short_history") {
        return answered(
          evidence,
          questionId,
          `Cover stays unavailable or cautious while eligible sales history is short — accumulate more eligible days before treating cover as decision-ready.${nextStepsSentence(evidence)}`,
          ["cover", "eligible_days", "cover_status", "next_step"],
        );
      }

      const cover = factValue(evidence, "cover");
      return answered(
        evidence,
        questionId,
        `Stock cover is unavailable (${cover ?? evidence.coverStatus}). Days-of-stock stays blank until trusted quantity and velocity align.${nextStepsSentence(evidence)}`,
        ["cover", "cover_status", "missing", "next_step"],
      );
    }

    case "missing_data": {
      const missing = factValue(evidence, "missing");
      const incoming = factValue(evidence, "incoming_trust");
      const parts: string[] = [];

      if (evidence.missingLabels.length > 0) {
        parts.push(
          `Blocking gaps for this SKU: ${missing ?? evidence.missingLabels.join("; ")}.`,
        );
      } else {
        parts.push("Core stock/metric fields are present for this grain.");
      }

      if (evidence.incomingTrust === "unknown") {
        parts.push(
          `Incoming remains unknown (not zero)${incoming ? ` — ${incoming}` : ""}. Provider-observed receipts are not trusted PO quantities.`,
        );
      }

      if (situation === "recorded_oos_with_positive_sales") {
        parts.push(
          "Most important gap to close: same-day availability confirmation at this store/location.",
        );
      } else if (situation === "in_stock_zero_observed_sales") {
        parts.push(
          "Most important gap to close: demand/visibility evidence — sales are known zero, not unknown.",
        );
      } else if (
        situation === "stale_stock_or_metrics" ||
        situation === "pending_metrics"
      ) {
        parts.push("Most important gap to close: freshness of stock and metrics.");
      }

      parts.push(
        "Missing or unknown evidence is never filled with invented numbers.",
      );
      parts.push(nextStepsSentence(evidence).trim());

      return answered(
        evidence,
        questionId,
        parts.filter(Boolean).join(" "),
        [
          "missing",
          "incoming_trust",
          "available",
          "velocity",
          "metric_provenance",
          "next_step",
        ],
      );
    }

    case "verify_before_replenishing": {
      const planning = factValue(evidence, "planning_assumptions");
      const parts = [
        "Before replenishing, use evidence to verify the right risk — StoreAgent will not create a purchase action here.",
      ];

      if (situation === "recorded_oos_with_positive_sales") {
        parts.push(
          "Priority: confirm whether availability is still zero with a fresh observation, then re-read historical sales only as context — not as an automatic buy quantity.",
        );
      } else if (situation === "in_stock_zero_observed_sales") {
        parts.push(
          "Priority: investigate why observed sales are zero while stock is recorded — visibility, conversion, listing quality, price, seasonality, or variant preference remain untested hypotheses, not confirmed causes.",
        );
      } else if (
        situation === "stale_stock_or_metrics" ||
        situation === "pending_metrics"
      ) {
        parts.push(
          "Priority: refresh stock and wait for current metrics — do not replenish from stale cover.",
        );
      } else if (situation === "in_stock_short_history") {
        parts.push(
          "Priority: confirm the sales window is long enough before treating velocity as stable demand.",
        );
      } else {
        parts.push(
          "Priority: confirm stock freshness, sales history, planning assumptions, and incoming trust.",
        );
      }

      if (planning) {
        parts.push(`Saved assumptions: ${planning}.`);
      }

      const thresholds = [
        factValue(evidence, "safety_stock"),
        factValue(evidence, "reorder_point"),
        factValue(evidence, "target_stock"),
      ].filter(Boolean);
      if (thresholds.length > 0) {
        parts.push(
          `Calculated thresholds (SS/ROP/target) are planning levels, not buy quantities: ${thresholds.join(", ")}.`,
        );
      }

      if (evidence.incomingTrust === "unknown") {
        parts.push(
          "Incoming is unknown — do not treat provider-observed receipts as trusted PO quantities.",
        );
      }

      parts.push(nextStepsSentence(evidence).trim());

      return answered(
        evidence,
        questionId,
        parts.filter(Boolean).join(" "),
        [
          "next_step",
          "planning_assumptions",
          "safety_stock",
          "reorder_point",
          "target_stock",
          "incoming_trust",
          "available",
          "velocity",
          "observed_at",
        ],
      );
    }

    default: {
      const _exhaustive: never = questionId;
      return _exhaustive;
    }
  }
}
