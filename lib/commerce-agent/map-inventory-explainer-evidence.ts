/**
 * AI-ARCH-1a — pure mapping from AI-INV InventoryExplainerEvidence → agent evidence.
 * Does not call networks, mutate inputs, invent numeric defaults, or trust model text.
 */

import {
  INVENTORY_EXPLAINER_EVIDENCE_VERSION,
  type InventoryExplainerEvidence,
  type InventoryExplainerFact,
  type InventoryExplainerFactId,
  type InventoryExplainerNextStep,
} from "@/lib/inventory-explainer/types";
import type {
  AgentFailureCode,
  ApprovalBoundary,
  Claim,
  ClaimClass,
  CommerceAgentEvidenceBundle,
  DecisionRecommendation,
  DecisionRecommendationActionClass,
  EvidenceFreshnessClass,
  EvidenceRecord,
  MapInventoryExplainerEvidenceResult,
  MerchantContext,
} from "@/lib/commerce-agent/types";
import { COMMERCE_AGENT_EVIDENCE_BUNDLE_VERSION } from "@/lib/commerce-agent/types";

const ENGINE_FACT_IDS = new Set<InventoryExplainerFactId>([
  "cover",
  "cover_status",
  "safety_stock",
  "reorder_point",
  "target_stock",
]);

const OBSERVED_FACT_IDS = new Set<InventoryExplainerFactId>([
  "identity",
  "available",
  "observed_at",
  "velocity",
  "eligible_days",
  "stock_condition",
  "incoming_trust",
  "metric_provenance",
  "planning_assumptions",
]);

const UNKNOWN_FACT_IDS = new Set<InventoryExplainerFactId>(["missing"]);

/** next_step is guidance, not a business fact — excluded from evidence records. */
const NON_EVIDENCE_FACT_IDS = new Set<InventoryExplainerFactId>(["next_step"]);

function claimClassForFact(fact: InventoryExplainerFact): ClaimClass {
  if (UNKNOWN_FACT_IDS.has(fact.id)) {
    return "unknown";
  }
  if (ENGINE_FACT_IDS.has(fact.id)) {
    return "engine_calculation";
  }
  if (OBSERVED_FACT_IDS.has(fact.id)) {
    if (fact.id === "planning_assumptions") {
      return "estimate";
    }
    return "observed_fact";
  }
  return "unknown";
}

function sourceSystemForFact(fact: InventoryExplainerFact): string {
  if (fact.id === "planning_assumptions") {
    return "organization_planning_inputs";
  }
  if (fact.id === "incoming_trust") {
    return "incoming_attestation";
  }
  if (
    ENGINE_FACT_IDS.has(fact.id) ||
    fact.id === "velocity" ||
    fact.id === "eligible_days"
  ) {
    return "sku_daily_metrics";
  }
  if (
    fact.id === "available" ||
    fact.id === "observed_at" ||
    fact.id === "stock_condition"
  ) {
    return "inventory_observation";
  }
  if (fact.id === "missing") {
    return "inventory_explainer_missing";
  }
  return fact.source || "inventory_explainer";
}

function freshnessForEvidence(
  evidence: InventoryExplainerEvidence,
): EvidenceFreshnessClass {
  if (evidence.stockObservationsStale) {
    return "stale";
  }
  if (evidence.metricIsHistorical) {
    return "unknown";
  }
  return "current";
}

function mapFactToEvidenceRecord(
  fact: InventoryExplainerFact,
  evidence: InventoryExplainerEvidence,
  freshnessClass: EvidenceFreshnessClass,
  index: number,
): EvidenceRecord {
  const claimClass = claimClassForFact(fact);
  return {
    evidenceId: `inv:${evidence.evidenceHash}:${fact.id}:${index}`,
    claimClass,
    label: fact.label,
    value: fact.value,
    sourceSystem: sourceSystemForFact(fact),
    sourceRef: fact.source,
    observedAt: fact.id === "observed_at" ? fact.value : (fact.asOf ?? null),
    asOf: fact.asOf ?? null,
    organizationId: evidence.organizationId,
    storeId: evidence.storeId,
    locationId: evidence.locationId,
    variantId: evidence.variantId,
    sku: evidence.sku,
    matchQuality: "exact",
    freshnessClass,
    licenseOk: true,
    inventoryFactId: fact.id,
  };
}

function actionClassForNextStep(
  code: string,
): DecisionRecommendationActionClass {
  switch (code) {
    case "refresh_stock":
    case "reimport_known_qty":
    case "keep_evidence_current":
    case "attest_incoming":
      return "refresh_data";
    case "investigate_demand":
    case "verify_availability":
    case "confirm_metric_window":
      return "investigate";
    case "wait_metrics":
    case "activate_metrics":
    case "accumulate_history":
    case "review_assumptions":
      return "review";
    case "abstain_insufficient":
      return "abstain";
    default:
      return "review";
  }
}

function approvalBoundaryForAction(
  actionClass: DecisionRecommendationActionClass,
): ApprovalBoundary {
  if (actionClass === "reorder_candidate") {
    return "blocked_until_m7";
  }
  if (actionClass === "abstain") {
    return "none";
  }
  return "merchant_required";
}

function buildRecommendation(
  evidence: InventoryExplainerEvidence,
  nextSteps: readonly InventoryExplainerNextStep[],
): DecisionRecommendation {
  const primary = nextSteps[0];
  const actionClass = primary
    ? actionClassForNextStep(primary.code)
    : "abstain";
  return {
    recommendationId: `rec:${evidence.evidenceHash}:primary`,
    actionClass,
    summary: primary?.label ?? "Insufficient evidence to recommend an action.",
    engineVersion: "ai-inv-1.1-guidance",
    inputsHash: evidence.evidenceHash,
    requiresHumanApproval: true,
    approvalBoundary: approvalBoundaryForAction(actionClass),
  };
}

function detectConflicts(
  records: readonly EvidenceRecord[],
  evidence: InventoryExplainerEvidence,
): CommerceAgentEvidenceBundle["conflicts"] {
  const conflicts: Array<{
    conflictId: string;
    evidenceIds: readonly string[];
    summary: string;
  }> = [];

  const cover = records.find((r) => r.inventoryFactId === "cover");
  if (evidence.coverAvailability === "unavailable" && cover) {
    conflicts.push({
      conflictId: `conflict:cover_unavailable:${evidence.evidenceHash}`,
      evidenceIds: [cover.evidenceId],
      summary:
        "Cover availability is unavailable while a cover evidence record is present.",
    });
  }

  const byFact = new Map<string, EvidenceRecord[]>();
  for (const record of records) {
    if (!record.inventoryFactId) {
      continue;
    }
    const list = byFact.get(record.inventoryFactId) ?? [];
    list.push(record);
    byFact.set(record.inventoryFactId, list);
  }
  for (const [factId, list] of byFact) {
    if (list.length < 2) {
      continue;
    }
    const values = new Set(list.map((r) => r.value));
    if (values.size > 1) {
      conflicts.push({
        conflictId: `conflict:divergent:${factId}:${evidence.evidenceHash}`,
        evidenceIds: list.map((r) => r.evidenceId),
        summary: `Divergent values for inventory fact "${factId}".`,
      });
    }
  }

  return conflicts;
}

function fail(
  code: AgentFailureCode,
  error: string,
): MapInventoryExplainerEvidenceResult {
  return { ok: false, code, error };
}

/**
 * Map server-owned AI-INV evidence into commerce-agent evidence records.
 * Requires trusted MerchantContext; rejects tenant mismatches and bad schemas.
 */
export function mapInventoryExplainerEvidence(input: {
  evidence: InventoryExplainerEvidence;
  context: MerchantContext;
}): MapInventoryExplainerEvidenceResult {
  const { evidence, context } = input;

  if (evidence.schemaVersion !== INVENTORY_EXPLAINER_EVIDENCE_VERSION) {
    return fail(
      "UNSUPPORTED_EVIDENCE",
      "Inventory explainer evidence schema is not supported.",
    );
  }

  if (!evidence.evidenceHash || !evidence.evidenceHash.startsWith("sha256:")) {
    return fail(
      "UNSUPPORTED_EVIDENCE",
      "Evidence hash is missing or malformed.",
    );
  }

  if (evidence.organizationId !== context.organizationId) {
    return fail(
      "TENANT_SCOPE_MISMATCH",
      "Evidence organization does not match trusted merchant context.",
    );
  }

  if (context.storeId && evidence.storeId !== context.storeId) {
    return fail(
      "TENANT_SCOPE_MISMATCH",
      "Evidence store does not match trusted merchant context.",
    );
  }

  const freshnessClass = freshnessForEvidence(evidence);
  const evidenceRecords: EvidenceRecord[] = [];
  let index = 0;

  for (const fact of evidence.facts) {
    if (NON_EVIDENCE_FACT_IDS.has(fact.id)) {
      continue;
    }
    evidenceRecords.push(
      mapFactToEvidenceRecord(fact, evidence, freshnessClass, index),
    );
    index += 1;
  }

  for (const label of evidence.missingLabels) {
    const already = evidenceRecords.some(
      (r) => r.inventoryFactId === "missing" && r.value.includes(label),
    );
    if (already) {
      continue;
    }
    evidenceRecords.push({
      evidenceId: `inv:${evidence.evidenceHash}:missing-label:${index}`,
      claimClass: "unknown",
      label: "Missing evidence",
      value: label,
      sourceSystem: "inventory_explainer_missing",
      sourceRef: "missingLabels",
      organizationId: evidence.organizationId,
      storeId: evidence.storeId,
      locationId: evidence.locationId,
      variantId: evidence.variantId,
      sku: evidence.sku,
      matchQuality: "unknown",
      freshnessClass,
      licenseOk: true,
      inventoryFactId: "missing",
    });
    index += 1;
  }

  const calculations = evidenceRecords.filter(
    (r) => r.claimClass === "engine_calculation",
  );

  const conflicts = detectConflicts(evidenceRecords, evidence);
  const conflictedEvidenceIds = new Set(
    conflicts.flatMap((c) => c.evidenceIds),
  );

  const findings: Claim[] = evidenceRecords
    .filter((r) => r.claimClass !== "unknown")
    .map((r) => {
      const conflictIds = conflicts
        .filter((c) => c.evidenceIds.includes(r.evidenceId))
        .map((c) => c.conflictId);
      const verifiedBase =
        r.claimClass === "observed_fact" ||
        r.claimClass === "engine_calculation" ||
        r.claimClass === "estimate";
      return {
        claimId: `claim:${r.evidenceId}`,
        text: `${r.label}: ${r.value}`,
        claimClass: r.claimClass,
        evidenceIds: [r.evidenceId],
        verified: verifiedBase && !conflictedEvidenceIds.has(r.evidenceId),
        ...(conflictIds.length > 0 ? { conflictIds } : {}),
      };
    });

  const hypotheses: Claim[] = evidence.untestedHypotheses.map((text, i) => ({
    claimId: `hypothesis:${evidence.evidenceHash}:${i}`,
    text,
    claimClass: "hypothesis" as const,
    evidenceIds: [],
    verified: false,
  }));

  const uncertainty: string[] = [];
  if (freshnessClass === "stale") {
    uncertainty.push("Stock or metric observations are stale.");
  }
  if (evidence.missingLabels.length > 0) {
    uncertainty.push(`Missing: ${evidence.missingLabels.join("; ")}`);
  }
  if (evidence.coverAvailability === "unavailable") {
    uncertainty.push("Stock cover is unavailable.");
  }
  if (evidence.decisionEligibility === "unauthorized") {
    uncertainty.push("Decision create remains unauthorized (L1 explain-only).");
  }
  for (const hypothesis of hypotheses) {
    uncertainty.push(`Untested hypothesis: ${hypothesis.text}`);
  }
  for (const conflict of conflicts) {
    uncertainty.push(conflict.summary);
  }

  const nextSteps = evidence.nextSteps.map((s) => ({
    code: s.code,
    label: s.label,
  }));

  const bundle: CommerceAgentEvidenceBundle = {
    schemaVersion: COMMERCE_AGENT_EVIDENCE_BUNDLE_VERSION,
    evidenceHash: evidence.evidenceHash,
    organizationId: evidence.organizationId,
    storeId: evidence.storeId,
    locationId: evidence.locationId,
    variantId: evidence.variantId,
    sku: evidence.sku,
    grainKey: evidence.grainKey,
    freshnessClass,
    evidence: evidenceRecords,
    calculations,
    hypotheses,
    findings,
    missingLabels: [...evidence.missingLabels],
    uncertainty,
    conflicts,
    nextSteps,
    recommendedAction: buildRecommendation(evidence, evidence.nextSteps),
    allowlistedLiterals: [...evidence.allowlistedLiterals],
    guidanceSituationId: evidence.guidanceSituationId,
  };

  return { ok: true, bundle };
}

/**
 * Model / free-text cannot mint numeric recommendations.
 * A recommendation is only valid when tied to an evidenceHash from mapped evidence.
 */
export function recommendationHasEvidenceAuthority(
  recommendation: DecisionRecommendation,
  bundle: CommerceAgentEvidenceBundle,
): boolean {
  if (!recommendation.inputsHash) {
    return false;
  }
  if (recommendation.inputsHash !== bundle.evidenceHash) {
    return false;
  }
  if (recommendation.actionClass === "reorder_candidate") {
    return recommendation.approvalBoundary === "blocked_until_m7";
  }
  return true;
}
