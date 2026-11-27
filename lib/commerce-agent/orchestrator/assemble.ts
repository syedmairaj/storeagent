/**
 * AI-ARCH-1c — assemble AgentAnswer / AgentAbstention from verified evidence only.
 */

import type {
  AgentAbstention,
  AgentAnswer,
  AgentFailureCode,
  AgentIntentClass,
  AgentTrace,
  Claim,
  CommerceAgentEvidenceBundle,
  DecisionRecommendation,
} from "@/lib/commerce-agent/types";
import {
  COMMERCE_AGENT_TRACE_VERSION,
} from "@/lib/commerce-agent/types";
import { recommendationHasEvidenceAuthority } from "@/lib/commerce-agent/map-inventory-explainer-evidence";

export function createAgentTrace(input: {
  runId: string;
  clientRequestId: string;
  organizationId: string;
  startedAt: string;
  steps: AgentTrace["steps"];
  endedAt?: string;
  cancelled?: boolean;
}): AgentTrace {
  return {
    schemaVersion: COMMERCE_AGENT_TRACE_VERSION,
    runId: input.runId,
    clientRequestId: input.clientRequestId,
    organizationId: input.organizationId,
    startedAt: input.startedAt,
    endedAt: input.endedAt ?? new Date().toISOString(),
    steps: input.steps,
    cancelled: input.cancelled,
  };
}

export function abstain(input: {
  code: AgentFailureCode;
  merchantMessage: string;
  trace: AgentTrace;
  missingEvidenceLabels?: readonly string[];
  nextSteps?: readonly { code: string; label: string }[];
  evidenceHash?: string;
}): AgentAbstention {
  return {
    status: "abstained",
    code: input.code,
    merchantMessage: input.merchantMessage,
    missingEvidenceLabels: input.missingEvidenceLabels ?? [],
    nextSteps: input.nextSteps ?? [],
    evidenceHash: input.evidenceHash,
    trace: input.trace,
  };
}

function verifiedFindings(bundle: CommerceAgentEvidenceBundle): Claim[] {
  return bundle.findings.filter(
    (claim) =>
      claim.verified === true &&
      (claim.claimClass === "observed_fact" ||
        claim.claimClass === "engine_calculation" ||
        claim.claimClass === "estimate"),
  );
}

function sanitizeRecommendation(
  bundle: CommerceAgentEvidenceBundle,
): DecisionRecommendation {
  const rec = bundle.recommendedAction;
  if (!recommendationHasEvidenceAuthority(rec, bundle)) {
    return {
      recommendationId: `rec:${bundle.evidenceHash}:abstain`,
      actionClass: "abstain",
      summary: "No evidence-authorized recommendation.",
      inputsHash: bundle.evidenceHash,
      requiresHumanApproval: true,
      approvalBoundary: "none",
    };
  }
  // L1 never upgrades to actionable reorder create.
  if (rec.actionClass === "reorder_candidate") {
    return {
      ...rec,
      actionClass: "review",
      summary: `${rec.summary} (explain-only; create blocked until M7).`,
      approvalBoundary: "blocked_until_m7",
      requiresHumanApproval: true,
    };
  }
  return {
    ...rec,
    requiresHumanApproval: true,
  };
}

function buildMerchantAnswer(input: {
  intentClass: AgentIntentClass;
  bundle: CommerceAgentEvidenceBundle;
  findings: readonly Claim[];
}): string {
  const lines: string[] = [];
  const sku = input.bundle.sku;
  lines.push(`SKU ${sku}:`);

  for (const finding of input.findings.slice(0, 6)) {
    lines.push(`- ${finding.text}`);
  }

  if (input.bundle.uncertainty.length > 0) {
    lines.push(`Uncertainty: ${input.bundle.uncertainty.slice(0, 3).join(" | ")}`);
  }

  if (input.intentClass === "zero_sales_diagnosis") {
    const hypotheses = input.bundle.hypotheses.slice(0, 2);
    if (hypotheses.length > 0) {
      lines.push(
        `Untested hypotheses (not confirmed): ${hypotheses
          .map((h) => h.text)
          .join("; ")}`,
      );
    }
  }

  lines.push("No purchase or create action is authorized by this answer.");
  return lines.join(" ");
}

/**
 * Decide answer vs abstention from a mapped evidence bundle.
 */
export function assembleFromEvidenceBundle(input: {
  intentClass: AgentIntentClass;
  bundle: CommerceAgentEvidenceBundle;
  trace: AgentTrace;
}): AgentAnswer | AgentAbstention {
  const { bundle, intentClass, trace } = input;

  if (intentClass === "reorder_review" && bundle.freshnessClass === "stale") {
    return abstain({
      code: "STALE_EVIDENCE",
      merchantMessage:
        "Stock or metrics look stale. Refresh observations before a reorder review.",
      missingEvidenceLabels: bundle.missingLabels,
      nextSteps: bundle.nextSteps,
      evidenceHash: bundle.evidenceHash,
      trace,
    });
  }

  if (bundle.conflicts.length > 0) {
    return abstain({
      code: "CONFLICTING_EVIDENCE",
      merchantMessage:
        "Conflicting inventory evidence was detected. I will not invent a reconciled number.",
      missingEvidenceLabels: bundle.missingLabels,
      nextSteps: bundle.nextSteps,
      evidenceHash: bundle.evidenceHash,
      trace,
    });
  }

  const findings = verifiedFindings(bundle);
  if (findings.length === 0) {
    return abstain({
      code: "INSUFFICIENT_EVIDENCE",
      merchantMessage:
        "There is not enough verified inventory evidence to answer safely.",
      missingEvidenceLabels: bundle.missingLabels,
      nextSteps: bundle.nextSteps,
      evidenceHash: bundle.evidenceHash,
      trace,
    });
  }

  if (
    intentClass === "data_gap" &&
    bundle.missingLabels.length === 0 &&
    bundle.freshnessClass === "current"
  ) {
    // Still answer with verified facts; uncertainty notes completeness.
  }

  const recommendedAction = sanitizeRecommendation(bundle);
  const calculations = bundle.calculations.filter((c) =>
    findings.some((f) => f.evidenceIds.includes(c.evidenceId)),
  );

  const evidence = bundle.evidence.filter(
    (e) =>
      e.claimClass === "observed_fact" ||
      e.claimClass === "engine_calculation" ||
      e.claimClass === "estimate" ||
      e.claimClass === "unknown",
  );

  return {
    status: "answered",
    merchantAnswer: buildMerchantAnswer({ intentClass, bundle, findings }),
    findings,
    evidence,
    calculations,
    uncertainty: bundle.uncertainty,
    recommendedAction,
    nextSteps: bundle.nextSteps,
    approvalBoundary: recommendedAction.approvalBoundary,
    evidenceHash: bundle.evidenceHash,
    generator: "deterministic",
    trace,
  };
}
