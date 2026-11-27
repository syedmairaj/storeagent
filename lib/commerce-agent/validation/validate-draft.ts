/**
 * AI-ARCH-1d — validate structured answer drafts against authorized evidence.
 * Drafts cannot add/remove/upgrade authoritative facts.
 */

import type {
  AgentAnswer,
  AgentFailureCode,
  Claim,
  ClaimClass,
  CommerceAgentEvidenceBundle,
  DecisionRecommendation,
  EvidenceRecord,
  MerchantContext,
} from "@/lib/commerce-agent/types";
import { recommendationHasEvidenceAuthority } from "@/lib/commerce-agent/map-inventory-explainer-evidence";
import {
  detectEstimatePromotedToFact,
  detectForbiddenActionClaims,
  detectForbiddenMarketClaims,
  detectHypothesisPresentedAsProven,
  detectPromptInjection,
  detectUnauthorizedToolRequest,
  detectUnsupportedSemanticClaims,
  extractNumbers,
  numberAllowed,
} from "@/lib/commerce-agent/validation/detect";
import {
  COMMERCE_AGENT_DRAFT_VERSION,
  type CommerceAgentAnswerDraft,
  type CommerceAgentDraftRejectionCode,
  type ValidateCommerceAgentDraftResult,
} from "@/lib/commerce-agent/validation/types";

const MIN_ANSWER_LEN = 8;
const MAX_ANSWER_LEN = 2000;

const CLAIM_RANK: Record<ClaimClass, number> = {
  unknown: 0,
  hypothesis: 1,
  estimate: 2,
  sourced_signal: 3,
  engine_calculation: 4,
  observed_fact: 5,
};

function fail(
  reasons: readonly CommerceAgentDraftRejectionCode[],
  detail: string,
  agentCodes: readonly AgentFailureCode[],
): ValidateCommerceAgentDraftResult {
  return { ok: false, reasons, detail, agentCodes };
}

function evidenceById(
  bundle: CommerceAgentEvidenceBundle,
): Map<string, EvidenceRecord> {
  const map = new Map<string, EvidenceRecord>();
  for (const record of [...bundle.evidence, ...bundle.calculations]) {
    map.set(record.evidenceId, record);
  }
  return map;
}

function claimsById(bundle: CommerceAgentEvidenceBundle): Map<string, Claim> {
  const map = new Map<string, Claim>();
  for (const claim of [...bundle.findings, ...bundle.hypotheses]) {
    map.set(claim.claimId, claim);
  }
  return map;
}

function buildAllowlist(bundle: CommerceAgentEvidenceBundle): Set<string> {
  const set = new Set<string>(bundle.allowlistedLiterals);
  for (const record of [...bundle.evidence, ...bundle.calculations]) {
    for (const num of extractNumbers(record.value)) {
      set.add(num);
    }
    if (record.unit) {
      set.add(record.unit);
    }
    if (record.sku) {
      set.add(record.sku);
    }
    if (record.observedAt) {
      for (const num of extractNumbers(record.observedAt)) {
        set.add(num);
      }
      set.add(record.observedAt);
    }
    if (record.asOf) {
      for (const num of extractNumbers(record.asOf)) {
        set.add(num);
      }
      set.add(record.asOf);
    }
  }
  for (const num of extractNumbers(bundle.sku)) {
    set.add(num);
  }
  set.add(bundle.sku);
  return set;
}

function authorizedSourceSystems(
  bundle: CommerceAgentEvidenceBundle,
): Set<string> {
  const set = new Set<string>();
  for (const record of [...bundle.evidence, ...bundle.calculations]) {
    set.add(record.sourceSystem.toLowerCase());
  }
  return set;
}

function detectInventedSource(text: string, authorized: ReadonlySet<string>): boolean {
  const mentions = text.match(/\bsource(?:d)?\s*(?:system|ref)?\s*[:=]?\s*([a-z0-9_.-]+)/gi);
  if (!mentions) {
    return false;
  }
  for (const mention of mentions) {
    const parts = mention.split(/[:=\s]/).filter(Boolean);
    const candidate = parts[parts.length - 1]?.toLowerCase();
    if (!candidate) {
      continue;
    }
    if (
      candidate === "source" ||
      candidate === "sourced" ||
      candidate === "system" ||
      candidate === "ref"
    ) {
      continue;
    }
    if (!authorized.has(candidate)) {
      return true;
    }
  }
  // Common invented labels
  if (/\bfrom\s+(bloomberg|gartner|similarweb|amazon\s+best[- ]?sellers)\b/i.test(text)) {
    return true;
  }
  return false;
}

function detectScopeMismatch(
  text: string,
  bundle: CommerceAgentEvidenceBundle,
  context: MerchantContext,
): string | null {
  const uuidRe =
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
  const allowed = new Set(
    [
      bundle.organizationId,
      bundle.storeId,
      bundle.locationId,
      bundle.variantId,
      context.organizationId,
      context.storeId,
      context.locationId,
      context.variantId,
    ]
      .filter(Boolean)
      .map((v) => (v as string).toLowerCase()),
  );
  for (const match of text.match(uuidRe) ?? []) {
    if (!allowed.has(match.toLowerCase())) {
      return `Draft references unauthorized grain id ${match}.`;
    }
  }

  // Explicit wrong SKU token (SKU-XXXX style) differing from bundle.sku
  const skuMentions = text.match(/\bSKU[-_]?[A-Z0-9]+\b/gi) ?? [];
  for (const mention of skuMentions) {
    const normalized = mention.replace(/^SKU[-_]?/i, "");
    const bundleSku = bundle.sku.replace(/^SKU[-_]?/i, "");
    if (
      normalized.toLowerCase() !== bundleSku.toLowerCase() &&
      mention.toLowerCase() !== bundle.sku.toLowerCase()
    ) {
      return `Draft references SKU ${mention} outside authorized grain.`;
    }
  }

  const countryMentions = text.match(/\bcountry(?:Code)?\s*[:=]\s*([A-Z]{2})\b/g);
  if (countryMentions) {
    const expected =
      bundle.evidence.find((e) => e.countryCode)?.countryCode ??
      context.countryCode ??
      null;
    for (const mention of countryMentions) {
      const code = mention.slice(-2).toUpperCase();
      if (expected && code !== expected.toUpperCase()) {
        return `Draft country ${code} does not match authorized scope.`;
      }
      if (!expected) {
        return `Draft asserts country ${code} without authorized country evidence.`;
      }
    }
  }

  // Unit tokens adjacent to numbers must match an evidence unit when units exist.
  const unitHits = text.match(
    /\b\d+(?:\.\d+)?\s*(kg|lbs?|units?|days?|pcs?|each|usd|eur|gbp)\b/gi,
  );
  if (unitHits) {
    const allowedUnits = new Set(
      [...bundle.evidence, ...bundle.calculations]
        .map((e) => e.unit?.toLowerCase())
        .filter((u): u is string => Boolean(u)),
    );
    // Also allow common inventory prose units used in finding text.
    for (const finding of bundle.findings) {
      for (const hit of finding.text.match(
        /\b(kg|lbs?|units?|days?|pcs?|each|usd|eur|gbp)\b/gi,
      ) ?? []) {
        allowedUnits.add(hit.toLowerCase());
      }
    }
    allowedUnits.add("days");
    allowedUnits.add("day");
    allowedUnits.add("units");
    allowedUnits.add("unit");
    for (const hit of unitHits) {
      const unit = hit.replace(/^-?\d+(?:\.\d+)?\s*/i, "").toLowerCase();
      if (allowedUnits.size > 0 && !allowedUnits.has(unit)) {
        return `Draft uses unit "${unit}" not present in authorized evidence.`;
      }
    }
  }

  return null;
}

function validateClaimClassAssertions(
  draft: CommerceAgentAnswerDraft,
  claims: Map<string, Claim>,
): ValidateCommerceAgentDraftResult | null {
  for (const asserted of draft.assertedClaims ?? []) {
    const original = claims.get(asserted.claimId);
    if (!original) {
      return fail(
        ["UNSUPPORTED_CITATION"],
        `Unknown asserted claimId: ${asserted.claimId}`,
        ["UNSUPPORTED_EVIDENCE"],
      );
    }
    const fromRank = CLAIM_RANK[original.claimClass];
    const toRank = CLAIM_RANK[asserted.claimClass];
    if (toRank > fromRank) {
      return fail(
        ["CLAIM_CLASS_UPGRADE"],
        `Draft upgrades claim ${asserted.claimId} from ${original.claimClass} to ${asserted.claimClass}.`,
        ["HALLUCINATED_NUMBER"],
      );
    }
    if (
      original.claimClass === "hypothesis" &&
      (asserted.verified === true || asserted.claimClass === "observed_fact")
    ) {
      return fail(
        ["CLAIM_CLASS_UPGRADE"],
        `Draft presents hypothesis ${asserted.claimId} as verified fact.`,
        ["HALLUCINATED_NUMBER"],
      );
    }
    if (
      original.claimClass === "estimate" &&
      asserted.claimClass === "observed_fact"
    ) {
      return fail(
        ["CLAIM_CLASS_UPGRADE"],
        `Draft promotes estimate ${asserted.claimId} to observed fact.`,
        ["HALLUCINATED_NUMBER"],
      );
    }
  }
  return null;
}

function validateRecommendation(
  draft: CommerceAgentAnswerDraft,
  bundle: CommerceAgentEvidenceBundle,
): ValidateCommerceAgentDraftResult | null {
  const rec = draft.recommendedAction;
  if (!rec) {
    return null;
  }
  if (!recommendationHasEvidenceAuthority(rec, bundle)) {
    return fail(
      ["RECOMMENDATION_UNAUTHORIZED"],
      "Draft recommendation lacks evidence/input hash authority.",
      ["FORBIDDEN_ACTION_CLAIM"],
    );
  }
  if (rec.actionClass === "reorder_candidate" && rec.approvalBoundary !== "blocked_until_m7") {
    return fail(
      ["RECOMMENDATION_UNAUTHORIZED"],
      "Draft unlocks reorder_candidate without blocked_until_m7 boundary.",
      ["FORBIDDEN_ACTION_CLAIM"],
    );
  }
  if (
    rec.actionClass !== "review" &&
    rec.actionClass !== "refresh_data" &&
    rec.actionClass !== "investigate" &&
    rec.actionClass !== "watch" &&
    rec.actionClass !== "abstain" &&
    !(rec.actionClass === "reorder_candidate" && rec.approvalBoundary === "blocked_until_m7")
  ) {
    return fail(
      ["RECOMMENDATION_UNAUTHORIZED"],
      `Unsupported recommendation actionClass: ${rec.actionClass}`,
      ["FORBIDDEN_ACTION_CLAIM"],
    );
  }
  return null;
}

function validateRecommendationAgainstBaseline(
  draft: CommerceAgentAnswerDraft,
  baseline: AgentAnswer,
): ValidateCommerceAgentDraftResult | null {
  const rec = draft.recommendedAction;
  if (!rec) {
    return null;
  }
  // Draft may not invent a stronger action than the deterministic baseline.
  const baselineClass = baseline.recommendedAction.actionClass;
  const draftClass = rec.actionClass;
  const strength: Record<DecisionRecommendation["actionClass"], number> = {
    abstain: 0,
    refresh_data: 1,
    investigate: 2,
    watch: 3,
    review: 4,
    reorder_candidate: 5,
  };
  if (strength[draftClass] > strength[baselineClass]) {
    return fail(
      ["RECOMMENDATION_UNAUTHORIZED"],
      `Draft upgrades recommendation from ${baselineClass} to ${draftClass}.`,
      ["FORBIDDEN_ACTION_CLAIM"],
    );
  }
  if (rec.inputsHash && rec.inputsHash !== baseline.evidenceHash) {
    return fail(
      ["RECOMMENDATION_UNAUTHORIZED"],
      "Draft recommendation inputsHash does not match baseline evidenceHash.",
      ["STALE_EVIDENCE"],
    );
  }
  return null;
}

/**
 * Validate a structured AI draft against the authorized evidence bundle
 * and the deterministic baseline answer.
 */
export function validateCommerceAgentAnswerDraft(input: {
  draft: CommerceAgentAnswerDraft;
  bundle: CommerceAgentEvidenceBundle;
  context: MerchantContext;
  baseline: AgentAnswer;
}): ValidateCommerceAgentDraftResult {
  const { draft, bundle, context, baseline } = input;

  if (draft.adapterId === "live_provider") {
    return fail(
      ["LIVE_PROVIDER_FORBIDDEN"],
      "Live providers are forbidden in L1 draft validation.",
      ["LIVE_PROVIDER_FORBIDDEN"],
    );
  }

  if (draft.schemaVersion !== COMMERCE_AGENT_DRAFT_VERSION) {
    return fail(
      ["MALFORMED_OUTPUT"],
      "Unsupported draft schema version.",
      ["UNSUPPORTED_EVIDENCE"],
    );
  }

  if (draft.evidenceHash !== bundle.evidenceHash) {
    return fail(
      ["STALE_EVIDENCE"],
      "Draft evidenceHash does not match authorized evidence bundle.",
      ["STALE_EVIDENCE"],
    );
  }

  if (draft.evidenceHash !== baseline.evidenceHash) {
    return fail(
      ["STALE_EVIDENCE"],
      "Draft evidenceHash does not match deterministic baseline.",
      ["STALE_EVIDENCE"],
    );
  }

  const answer = draft.merchantAnswer?.trim() ?? "";
  if (answer.length < MIN_ANSWER_LEN || answer.length > MAX_ANSWER_LEN) {
    return fail(
      ["MALFORMED_OUTPUT"],
      "merchantAnswer length out of bounds.",
      ["UNSUPPORTED_EVIDENCE"],
    );
  }

  if (detectPromptInjection(answer)) {
    return fail(
      ["PROMPT_INJECTION_SUSPECT"],
      "Prompt-injection markers detected in draft.",
      ["PROMPT_INJECTION_SUSPECT"],
    );
  }

  if (detectForbiddenActionClaims(answer)) {
    return fail(
      ["FORBIDDEN_ACTION_CLAIM"],
      "Draft contains forbidden purchase/advertising/create directives.",
      ["FORBIDDEN_ACTION_CLAIM"],
    );
  }

  if (detectForbiddenMarketClaims(answer) || detectUnsupportedSemanticClaims(answer)) {
    return fail(
      ["UNSUPPORTED_CLAIM"],
      "Draft contains unsupported market, competitor, or causal claims.",
      ["FORBIDDEN_ACTION_CLAIM"],
    );
  }

  if (detectHypothesisPresentedAsProven(answer)) {
    return fail(
      ["CLAIM_CLASS_UPGRADE"],
      "Draft presents a hypothesis as proven.",
      ["HALLUCINATED_NUMBER"],
    );
  }

  if (detectEstimatePromotedToFact(answer)) {
    return fail(
      ["CLAIM_CLASS_UPGRADE"],
      "Draft promotes an estimate to an observed fact.",
      ["HALLUCINATED_NUMBER"],
    );
  }

  if (detectUnauthorizedToolRequest(answer)) {
    return fail(
      ["FORBIDDEN_ACTION_CLAIM"],
      "Draft requests unauthorized tools.",
      ["FORBIDDEN_ACTION_CLAIM"],
    );
  }

  const allowlist = buildAllowlist(bundle);
  // Baseline numbers are also authorized (deterministic prose already grounded).
  for (const num of extractNumbers(baseline.merchantAnswer)) {
    allowlist.add(num);
  }

  for (const num of extractNumbers(answer)) {
    if (!numberAllowed(num, allowlist)) {
      return fail(
        ["HALLUCINATED_NUMBER"],
        `Number ${num} is not present in authorized evidence.`,
        ["HALLUCINATED_NUMBER"],
      );
    }
  }

  const evidenceMap = evidenceById(bundle);
  for (const evidenceId of draft.citedEvidenceIds) {
    if (!evidenceMap.has(evidenceId)) {
      return fail(
        ["UNSUPPORTED_CITATION"],
        `Unknown evidence citation: ${evidenceId}`,
        ["UNSUPPORTED_EVIDENCE"],
      );
    }
  }

  const claimMap = claimsById(bundle);
  for (const claimId of draft.citedClaimIds ?? []) {
    if (!claimMap.has(claimId)) {
      return fail(
        ["UNSUPPORTED_CITATION"],
        `Unknown claim citation: ${claimId}`,
        ["UNSUPPORTED_EVIDENCE"],
      );
    }
  }

  const classResult = validateClaimClassAssertions(draft, claimMap);
  if (classResult) {
    return classResult;
  }

  const authorizedSources = authorizedSourceSystems(bundle);
  if (detectInventedSource(answer, authorizedSources)) {
    return fail(
      ["UNSUPPORTED_CITATION"],
      "Draft cites an invented or unauthorized source.",
      ["UNSUPPORTED_EVIDENCE"],
    );
  }

  const scopeError = detectScopeMismatch(answer, bundle, context);
  if (scopeError) {
    return fail(["SCOPE_MISMATCH"], scopeError, ["TENANT_SCOPE_MISMATCH"]);
  }

  // Timestamp literals that look like ISO dates must appear in evidence.
  const isoDates = answer.match(
    /\b\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)?\b/g,
  );
  if (isoDates) {
    const allowedDates = new Set<string>();
    for (const record of [...bundle.evidence, ...bundle.calculations]) {
      if (record.observedAt) {
        allowedDates.add(record.observedAt);
      }
      if (record.asOf) {
        allowedDates.add(record.asOf);
      }
    }
    for (const date of isoDates) {
      const ok = [...allowedDates].some(
        (allowed) => allowed === date || allowed.startsWith(date),
      );
      if (!ok) {
        return fail(
          ["UNSUPPORTED_CLAIM"],
          `Draft timestamp ${date} is not present in authorized evidence.`,
          ["STALE_EVIDENCE"],
        );
      }
    }
  }

  const nextCodes = new Set(bundle.nextSteps.map((s) => s.code));
  for (const code of draft.suggestedNextStepCodes ?? []) {
    if (!nextCodes.has(code)) {
      return fail(
        ["FORBIDDEN_ACTION_CLAIM"],
        `Unsupported next-step code: ${code}`,
        ["FORBIDDEN_ACTION_CLAIM"],
      );
    }
  }

  const recBundle = validateRecommendation(draft, bundle);
  if (recBundle) {
    return recBundle;
  }
  const recBaseline = validateRecommendationAgainstBaseline(draft, baseline);
  if (recBaseline) {
    return recBaseline;
  }

  return { ok: true };
}

export function mapDraftRejectionToAgentCode(
  reason: CommerceAgentDraftRejectionCode,
): AgentFailureCode {
  switch (reason) {
    case "HALLUCINATED_NUMBER":
    case "CLAIM_CLASS_UPGRADE":
      return "HALLUCINATED_NUMBER";
    case "PROMPT_INJECTION_SUSPECT":
      return "PROMPT_INJECTION_SUSPECT";
    case "FORBIDDEN_ACTION_CLAIM":
    case "UNSUPPORTED_CLAIM":
    case "RECOMMENDATION_UNAUTHORIZED":
      return "FORBIDDEN_ACTION_CLAIM";
    case "STALE_EVIDENCE":
      return "STALE_EVIDENCE";
    case "SCOPE_MISMATCH":
      return "TENANT_SCOPE_MISMATCH";
    case "LIVE_PROVIDER_FORBIDDEN":
      return "LIVE_PROVIDER_FORBIDDEN";
    case "AI_TIMEOUT":
      return "TIMEOUT";
    case "COST_CAP_EXCEEDED":
      return "COST_CAP_EXCEEDED";
    case "RATE_LIMITED":
      return "RATE_LIMITED";
    case "AI_UNAVAILABLE":
    case "MALFORMED_OUTPUT":
    case "UNSUPPORTED_CITATION":
    default:
      return "UNSUPPORTED_EVIDENCE";
  }
}
