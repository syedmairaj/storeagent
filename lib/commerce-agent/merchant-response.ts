/**
 * AI-ARCH-1e — merchant-safe investigation DTO.
 * Strips traces, allowlists, adapters, forceEnabled, and internal config.
 */

import type {
  AgentAbstention,
  AgentAnswer,
  AgentFailureCode,
  AgentRunResult,
  ApprovalBoundary,
  ClaimClass,
  DecisionRecommendationActionClass,
  EvidenceFreshnessClass,
} from "@/lib/commerce-agent/types";
import type { CommerceAgentStructuredIntent } from "@/lib/commerce-agent/intents";

export type MerchantInvestigationClaimDto = {
  text: string;
  claimClass: ClaimClass;
  verified: boolean;
};

export type MerchantInvestigationEvidenceDto = {
  label: string;
  value: string;
  claimClass: ClaimClass;
  sourceSystem: string;
  unit?: string | null;
  asOf?: string | null;
  observedAt?: string | null;
  freshnessClass?: EvidenceFreshnessClass;
};

export type MerchantInvestigationRecommendationDto = {
  actionClass: DecisionRecommendationActionClass;
  summary: string;
  approvalBoundary: ApprovalBoundary;
  requiresHumanApproval: true;
};

export type MerchantInvestigationAnswerDto = {
  ok: true;
  kind: "answered";
  clientRequestId: string;
  intentClass: CommerceAgentStructuredIntent;
  merchantAnswer: string;
  findings: readonly MerchantInvestigationClaimDto[];
  evidence: readonly MerchantInvestigationEvidenceDto[];
  calculations: readonly MerchantInvestigationEvidenceDto[];
  hypotheses: readonly MerchantInvestigationClaimDto[];
  uncertainty: readonly string[];
  missingEvidenceLabels: readonly string[];
  conflicts: readonly { summary: string }[];
  recommendedAction: MerchantInvestigationRecommendationDto;
  nextSteps: readonly { code: string; label: string }[];
  generator: AgentAnswer["generator"];
  evidenceHash: string;
  freshnessClass: EvidenceFreshnessClass;
  asOf: string | null;
};

export type MerchantInvestigationAbstentionDto = {
  ok: true;
  kind: "abstained";
  clientRequestId: string;
  intentClass: CommerceAgentStructuredIntent;
  code: AgentFailureCode;
  merchantMessage: string;
  missingEvidenceLabels: readonly string[];
  nextSteps: readonly { code: string; label: string }[];
  evidenceHash?: string;
  generator?: AgentAnswer["generator"];
};

export type MerchantInvestigationRejectionCode =
  | "UNAUTHORIZED"
  | "PERMISSION_DENIED"
  | "AGENT_DISABLED"
  | "INVALID_INPUT"
  | "GRAIN_NOT_FOUND"
  | "TENANT_SCOPE_MISMATCH"
  | "UNSUPPORTED_INTENT"
  | "AI_UNAVAILABLE";

export type MerchantInvestigationErrorDto = {
  ok: false;
  code: MerchantInvestigationRejectionCode;
  error: string;
  clientRequestId?: string;
};

export type MerchantInvestigationDto =
  | MerchantInvestigationAnswerDto
  | MerchantInvestigationAbstentionDto
  | MerchantInvestigationErrorDto;

const SENSITIVE_KEY_RE =
  /forceEnabled|organizationAllowlist|draftAdapter|toolDeps|L1ToolDeps|enablementSource|test_injected|live_provider|supportsLiveNetwork|tokenEstimate|budgetRemaining/i;

function mapEvidence(
  record: AgentAnswer["evidence"][number],
): MerchantInvestigationEvidenceDto {
  return {
    label: record.label,
    value: record.value,
    claimClass: record.claimClass,
    sourceSystem: record.sourceSystem,
    unit: record.unit ?? null,
    asOf: record.asOf ?? null,
    observedAt: record.observedAt ?? null,
    freshnessClass: record.freshnessClass,
  };
}

function deriveFreshness(answer: AgentAnswer): EvidenceFreshnessClass {
  const classes = [...answer.evidence, ...answer.calculations]
    .map((item) => item.freshnessClass)
    .filter((value): value is EvidenceFreshnessClass => value != null);
  if (classes.includes("stale")) {
    return "stale";
  }
  if (classes.includes("current")) {
    return "current";
  }
  return "unknown";
}

function deriveAsOf(answer: AgentAnswer): string | null {
  for (const item of [...answer.evidence, ...answer.calculations]) {
    if (item.asOf) {
      return item.asOf;
    }
    if (item.observedAt) {
      return item.observedAt;
    }
  }
  return null;
}

/**
 * Convert an orchestrator result into a merchant-safe DTO.
 * Never includes AgentTrace or internal enablement/config surfaces.
 */
export function toMerchantInvestigationDto(input: {
  result: AgentRunResult;
  clientRequestId: string;
  intentClass: CommerceAgentStructuredIntent;
}): MerchantInvestigationAnswerDto | MerchantInvestigationAbstentionDto {
  const { result, clientRequestId, intentClass } = input;

  if (result.status === "abstained") {
    return serializeAbstention({
      abstention: result,
      clientRequestId,
      intentClass,
    });
  }

  const hypotheses = result.findings.filter(
    (claim) => claim.claimClass === "hypothesis",
  );
  // Hypotheses are never verified findings in assemble; surface labeled
  // uncertainty that explicitly mentions hypothesis language when present.
  const hypothesisNotes = result.uncertainty
    .filter((line) => /hypothesis|untested|estimate/i.test(line))
    .map((text) => ({
      text,
      claimClass: "hypothesis" as const,
      verified: false,
    }));

  return {
    ok: true,
    kind: "answered",
    clientRequestId,
    intentClass,
    merchantAnswer: result.merchantAnswer,
    findings: result.findings.map((claim) => ({
      text: claim.text,
      claimClass: claim.claimClass,
      verified: claim.verified,
    })),
    evidence: result.evidence.map(mapEvidence),
    calculations: result.calculations.map(mapEvidence),
    hypotheses: hypotheses.length > 0 ? hypotheses.map((claim) => ({
      text: claim.text,
      claimClass: claim.claimClass,
      verified: claim.verified,
    })) : hypothesisNotes,
    uncertainty: [...result.uncertainty],
    missingEvidenceLabels: [],
    conflicts: [],
    recommendedAction: {
      actionClass: result.recommendedAction.actionClass,
      summary: result.recommendedAction.summary,
      approvalBoundary: result.recommendedAction.approvalBoundary,
      requiresHumanApproval: true,
    },
    nextSteps: result.nextSteps.map((step) => ({
      code: step.code,
      label: step.label,
    })),
    generator: result.generator,
    evidenceHash: result.evidenceHash,
    freshnessClass: deriveFreshness(result),
    asOf: deriveAsOf(result),
  };
}

export function serializeAbstention(input: {
  abstention: AgentAbstention;
  clientRequestId: string;
  intentClass: CommerceAgentStructuredIntent;
}): MerchantInvestigationAbstentionDto {
  return {
    ok: true,
    kind: "abstained",
    clientRequestId: input.clientRequestId,
    intentClass: input.intentClass,
    code: input.abstention.code,
    merchantMessage: input.abstention.merchantMessage,
    missingEvidenceLabels: [...input.abstention.missingEvidenceLabels],
    nextSteps: input.abstention.nextSteps.map((step) => ({
      code: step.code,
      label: step.label,
    })),
    evidenceHash: input.abstention.evidenceHash,
  };
}

export function merchantInvestigationError(input: {
  code: MerchantInvestigationRejectionCode;
  error: string;
  clientRequestId?: string;
}): MerchantInvestigationErrorDto {
  return {
    ok: false,
    code: input.code,
    error: input.error,
    clientRequestId: input.clientRequestId,
  };
}

/**
 * Deep-ish scan that a serializable DTO does not leak sensitive internals.
 * Used by tests and as a final guard before returning to the browser.
 */
export function assertMerchantSafeDto(value: unknown): void {
  const seen = new Set<unknown>();
  const stack: unknown[] = [value];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current == null || typeof current !== "object") {
      continue;
    }
    if (seen.has(current)) {
      continue;
    }
    seen.add(current);
    if (Array.isArray(current)) {
      for (const item of current) {
        stack.push(item);
      }
      continue;
    }
    for (const [key, nested] of Object.entries(current)) {
      if (SENSITIVE_KEY_RE.test(key)) {
        throw new Error(`UNSAFE_MERCHANT_DTO_KEY:${key}`);
      }
      if (key === "trace" || key === "steps") {
        throw new Error(`UNSAFE_MERCHANT_DTO_KEY:${key}`);
      }
      stack.push(nested);
    }
  }
}
