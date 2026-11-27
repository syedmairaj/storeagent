/**
 * AI-ARCH-1b — tool invocation result contract.
 * Distinguishes execution success vs evidence verification vs recommendation eligibility.
 */

import type { L1ToolId } from "@/lib/commerce-agent/tools/ids";

export type L1EvidenceVerification =
  | "verified"
  | "partial"
  | "unverified"
  | "not_applicable";

/**
 * L1 never unlocks create/buy. Explain-only at most.
 */
export type L1RecommendationEligibility =
  | "not_eligible"
  | "explain_only"
  | "blocked_until_m7";

export type L1ToolFailureCode =
  | "UNSUPPORTED_TOOL"
  | "FORBIDDEN_TOOL"
  | "PERMISSION_DENIED"
  | "TENANT_SCOPE_MISMATCH"
  | "MALFORMED_INPUT"
  | "MALFORMED_OUTPUT"
  | "NOT_FOUND"
  | "TIMEOUT"
  | "TRANSIENT"
  | "EVIDENCE_MISMATCH"
  | "WRITE_CAPABILITY_FORBIDDEN";

export type L1ToolSuccess<TOutput> = {
  ok: true;
  toolId: L1ToolId;
  latencyMs: number;
  execution: "success";
  evidenceVerification: L1EvidenceVerification;
  recommendationEligibility: L1RecommendationEligibility;
  evidenceIds: readonly string[];
  output: TOutput;
};

export type L1ToolFailure = {
  ok: false;
  toolId: string;
  latencyMs: number;
  execution: "failed";
  evidenceVerification: "not_applicable";
  recommendationEligibility: "not_eligible";
  code: L1ToolFailureCode;
  detail: string;
};

export type L1ToolInvocationResult<TOutput = unknown> =
  | L1ToolSuccess<TOutput>
  | L1ToolFailure;

export function l1Fail(
  toolId: string,
  code: L1ToolFailureCode,
  detail: string,
  latencyMs = 0,
): L1ToolFailure {
  return {
    ok: false,
    toolId,
    latencyMs,
    execution: "failed",
    evidenceVerification: "not_applicable",
    recommendationEligibility: "not_eligible",
    code,
    detail,
  };
}
