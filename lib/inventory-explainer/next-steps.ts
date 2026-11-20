/**
 * AI-INV-1.1 — prioritized 1–3 SKU-specific next steps from guidance situation.
 */

import type { GuidanceSituationId } from "@/lib/inventory-explainer/guidance-situation";
import type {
  IncomingTrustClass,
  InventoryExplainerNextStep,
  InventoryExplainerNextStepCode,
} from "@/lib/inventory-explainer/types";

const NEXT_STEP_LABELS: Record<InventoryExplainerNextStepCode, string> = {
  refresh_stock:
    "Upload updated stock for this store/location on the store-local as-of date, then activate demand metrics.",
  wait_metrics: "Wait for demand metrics to finish updating for this SKU grain.",
  activate_metrics:
    "Activate demand metrics after sales and current-day stock exist for this SKU, store, and location.",
  accumulate_history:
    "Accumulate more eligible sales days before treating cover or velocity as decision-ready.",
  reimport_known_qty:
    "Re-import inventory with a known available quantity for this SKU.",
  review_assumptions:
    "Review this SKU against your replenishment assumptions — commercial recommendations stay unauthorized.",
  attest_incoming:
    "Attest incoming completeness or add trusted purchase-order evidence before treating inbound as known.",
  keep_evidence_current: "Keep stock and sales evidence current for this grain.",
  abstain_insufficient:
    "Evidence is insufficient to explain further — refresh stock and metrics first.",
  verify_availability:
    "Verify whether this SKU is still unavailable at this store/location with a same-day stock observation.",
  investigate_demand:
    "Check listing visibility, conversion, price, seasonality, and variant preference as untested hypotheses — not confirmed causes.",
  confirm_metric_window:
    "Confirm the sales window and eligible-day coverage before reading velocity as stable demand.",
};

export function labelForNextStepCode(
  code: InventoryExplainerNextStepCode,
): string {
  return NEXT_STEP_LABELS[code];
}

const MAX_PRIORITIZED_STEPS = 3;

/**
 * Build at most three situation-specific next steps (no identical generic lists).
 */
export function resolvePrioritizedGuidanceSteps(input: {
  situationId: GuidanceSituationId;
  incomingTrust: IncomingTrustClass;
}): InventoryExplainerNextStep[] {
  const codes: InventoryExplainerNextStepCode[] = [];

  switch (input.situationId) {
    case "recorded_oos_with_positive_sales":
      codes.push("verify_availability", "refresh_stock", "review_assumptions");
      break;
    case "recorded_oos_without_positive_sales":
      codes.push("verify_availability", "investigate_demand", "refresh_stock");
      break;
    case "in_stock_zero_observed_sales":
      codes.push(
        "investigate_demand",
        "confirm_metric_window",
        "refresh_stock",
      );
      break;
    case "in_stock_short_history":
      codes.push(
        "accumulate_history",
        "confirm_metric_window",
        "keep_evidence_current",
      );
      break;
    case "stale_stock_or_metrics":
      codes.push("refresh_stock", "confirm_metric_window", "review_assumptions");
      break;
    case "unknown_stock":
      codes.push("reimport_known_qty", "refresh_stock");
      break;
    case "unknown_or_missing_demand":
      codes.push(
        "accumulate_history",
        "confirm_metric_window",
        "activate_metrics",
      );
      break;
    case "missing_metrics":
      codes.push("activate_metrics", "refresh_stock");
      break;
    case "pending_metrics":
      codes.push("wait_metrics", "keep_evidence_current");
      break;
    case "low_cover_review":
      codes.push(
        "review_assumptions",
        "confirm_metric_window",
        "verify_availability",
      );
      break;
    case "high_cover_review":
      codes.push("review_assumptions", "confirm_metric_window");
      break;
    case "in_stock_stable_review":
      codes.push("keep_evidence_current", "review_assumptions");
      break;
    default: {
      const _exhaustive: never = input.situationId;
      return _exhaustive;
    }
  }

  if (input.incomingTrust === "unknown") {
    // Incoming unknown is secondary — append only if room remains.
    if (!codes.includes("attest_incoming") && codes.length < MAX_PRIORITIZED_STEPS) {
      codes.push("attest_incoming");
    } else if (
      !codes.includes("attest_incoming") &&
      codes.length >= MAX_PRIORITIZED_STEPS
    ) {
      // Replace the least-urgent trailing step when incoming is the key gap.
      if (
        input.situationId === "low_cover_review" ||
        input.situationId === "recorded_oos_with_positive_sales"
      ) {
        codes[MAX_PRIORITIZED_STEPS - 1] = "attest_incoming";
      }
    }
  }

  const unique: InventoryExplainerNextStepCode[] = [];
  for (const code of codes) {
    if (!unique.includes(code)) {
      unique.push(code);
    }
    if (unique.length >= MAX_PRIORITIZED_STEPS) {
      break;
    }
  }

  return unique.map((code) => ({
    code,
    label: NEXT_STEP_LABELS[code],
  }));
}

export function isAllowedNextStepCode(
  code: string,
): code is InventoryExplainerNextStepCode {
  return Object.prototype.hasOwnProperty.call(NEXT_STEP_LABELS, code);
}

/** @deprecated Prefer resolvePrioritizedGuidanceSteps — retained for call-site clarity. */
export function resolveDeterministicNextSteps(input: {
  situationId: GuidanceSituationId;
  incomingTrust: IncomingTrustClass;
}): InventoryExplainerNextStep[] {
  return resolvePrioritizedGuidanceSteps(input);
}
