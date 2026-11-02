/**
 * M7.4e E3.3 — privacy-safe observability projection.
 *
 * Allowed: briefMode/actionType/generator/validation/rejection codes,
 * adapterId, prompt/profile versions, groundingHash, latency, token estimates,
 * flag/allowlist booleans.
 *
 * Forbidden by default: full prose, secrets, raw envelope JSON, service_role.
 */

import type {
  ExplainDecisionBriefDiagnostics,
} from "@/lib/decision-brief/ai/types";

import type {
  BriefGenerator,
  BriefValidationStatus,
  DecisionBriefActionType,
  DecisionBriefMode,
  DecisionBriefRejectionCode,
} from "@/lib/decision-brief/types";

export type PrivacySafeAiExplanationLog = {
  briefMode: DecisionBriefMode;
  briefId: string;
  actionType: DecisionBriefActionType;
  generator: BriefGenerator;
  validationStatus: BriefValidationStatus;
  rejectionCodes: readonly DecisionBriefRejectionCode[];
  adapterId?: string;
  promptVersion?: string;
  semanticProfileVersion?: string;
  groundingHash?: string;
  latencyMs?: number;
  inputTokenEstimate?: number;
  outputTokenEstimate?: number;
  aiExplanationEnabled: boolean;
  allowlistMatch: boolean;
  enablementSource: ExplainDecisionBriefDiagnostics["enablementSource"];
  forceDeterministicFallback: boolean;
  aiAttempted: boolean;
  candidateDiscarded: boolean;
  lateResultDiscarded: boolean;
  adapterFailureReason?: ExplainDecisionBriefDiagnostics["adapterFailureReason"];
};

export function toPrivacySafeAiExplanationLog(input: {
  briefId: string;
  briefMode: DecisionBriefMode;
  actionType: DecisionBriefActionType;
  generator: BriefGenerator;
  validationStatus: BriefValidationStatus;
  diagnostics: ExplainDecisionBriefDiagnostics;
  aiExplanationEnabled: boolean;
  allowlistMatch: boolean;
  adapterId?: string;
  promptVersion?: string;
  semanticProfileVersion?: string;
  latencyMs?: number;
  inputTokenEstimate?: number;
  outputTokenEstimate?: number;
}): PrivacySafeAiExplanationLog {
  return {
    briefMode: input.briefMode,
    briefId: input.briefId,
    actionType: input.actionType,
    generator: input.generator,
    validationStatus: input.validationStatus,
    rejectionCodes: [
      ...input.diagnostics.discardReasons,
    ],
    adapterId: input.adapterId,
    promptVersion: input.promptVersion,
    semanticProfileVersion:
      input.semanticProfileVersion,
    groundingHash:
      input.diagnostics.groundingHash,
    latencyMs: input.latencyMs,
    inputTokenEstimate:
      input.inputTokenEstimate,
    outputTokenEstimate:
      input.outputTokenEstimate,
    aiExplanationEnabled:
      input.aiExplanationEnabled,
    allowlistMatch: input.allowlistMatch,
    enablementSource:
      input.diagnostics.enablementSource,
    forceDeterministicFallback:
      input.diagnostics.forceDeterministicFallback,
    aiAttempted:
      input.diagnostics.aiAttempted,
    candidateDiscarded:
      input.diagnostics.candidateDiscarded,
    lateResultDiscarded:
      input.diagnostics.lateResultDiscarded,
    adapterFailureReason:
      input.diagnostics.adapterFailureReason,
  };
}
