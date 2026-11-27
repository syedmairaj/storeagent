/**
 * AI-MKT-1d — versioned research answer-draft contracts + validation entry.
 * Drafts never become output until claim validation passes. No live models.
 */

import type { NormalizedEvidenceItem } from "@/lib/market-research/normalize/types";
import type { ResearchConflict } from "@/lib/market-research/types";
import {
  detectFakeCitations,
  validateAllMaterialClaims,
} from "@/lib/market-research/orchestration/validate-claims";
import {
  MARKET_RESEARCH_DRAFT_PROMPT_VERSION,
  MARKET_RESEARCH_DRAFT_VERSION,
  type MarketResearchAnswerDraft,
  type MarketResearchDraftAdapterId,
  type MarketResearchDraftRejectionCode,
} from "@/lib/market-research/orchestration/types";
import {
  detectForbiddenActionClaims,
  detectPromptInjection,
} from "@/lib/commerce-agent/validation/detect";

export type ValidateResearchDraftResult =
  | { ok: true }
  | {
      ok: false;
      reasons: readonly MarketResearchDraftRejectionCode[];
      detail: string;
    };

export type MarketResearchDraftGenerateOptions = {
  signal: AbortSignal;
  timeoutMs: number;
  maxDraftChars: number;
};

export type MarketResearchDraftAdapterResult =
  | { ok: true; draft: MarketResearchAnswerDraft }
  | {
      ok: false;
      reason: MarketResearchDraftRejectionCode;
      detail: string;
    };

export interface MarketResearchDraftAdapter {
  readonly adapterId: MarketResearchDraftAdapterId | "live_provider";
  readonly supportsLiveNetwork: boolean;
  generate(
    input: {
      evidenceHash: string;
      researchAnswerBaseline: string;
      evidenceIds: readonly string[];
      accepted: readonly NormalizedEvidenceItem[];
    },
    options: MarketResearchDraftGenerateOptions,
  ): Promise<MarketResearchDraftAdapterResult>;
}

export function isMarketResearchAnswerDraft(
  value: unknown,
): value is MarketResearchAnswerDraft {
  if (!value || typeof value !== "object") return false;
  const d = value as Record<string, unknown>;
  return (
    d.schemaVersion === MARKET_RESEARCH_DRAFT_VERSION &&
    typeof d.evidenceHash === "string" &&
    typeof d.researchAnswer === "string" &&
    Array.isArray(d.citedEvidenceIds) &&
    Array.isArray(d.materialClaims)
  );
}

export function assertLiveResearchDraftForbidden(
  adapter: MarketResearchDraftAdapter,
): boolean {
  return (
    adapter.adapterId === "live_provider" || adapter.supportsLiveNetwork === true
  );
}

/**
 * Validate a research draft against accepted evidence + evidence hash binding.
 */
export function validateMarketResearchAnswerDraft(input: {
  draft: unknown;
  evidenceHash: string;
  accepted: readonly NormalizedEvidenceItem[];
  conflicts?: readonly ResearchConflict[];
  rejectedEvidenceIds?: ReadonlySet<string>;
  maxDraftChars: number;
}): ValidateResearchDraftResult {
  if (!isMarketResearchAnswerDraft(input.draft)) {
    return {
      ok: false,
      reasons: ["MALFORMED_OUTPUT"],
      detail: "Draft failed schema check",
    };
  }

  const draft = input.draft;

  if (draft.adapterId === "live_provider") {
    return {
      ok: false,
      reasons: ["LIVE_PROVIDER_FORBIDDEN"],
      detail: "Live draft providers are forbidden in AI-MKT-1d",
    };
  }

  if (draft.promptVersion !== MARKET_RESEARCH_DRAFT_PROMPT_VERSION) {
    return {
      ok: false,
      reasons: ["MALFORMED_OUTPUT"],
      detail: "Draft promptVersion mismatch",
    };
  }

  if (draft.evidenceHash !== input.evidenceHash) {
    return {
      ok: false,
      reasons: ["HASH_MISMATCH"],
      detail: "Draft evidenceHash does not match authorized run binding",
    };
  }

  const answer = draft.researchAnswer.trim();
  if (answer.length < 8) {
    return {
      ok: false,
      reasons: ["ANSWER_TOO_SHORT"],
      detail: "researchAnswer too short",
    };
  }
  if (answer.length > input.maxDraftChars) {
    return {
      ok: false,
      reasons: ["ANSWER_TOO_LONG"],
      detail: "researchAnswer exceeds maxDraftChars",
    };
  }

  if (detectPromptInjection(answer)) {
    return {
      ok: false,
      reasons: ["PROMPT_INJECTION_SUSPECT"],
      detail: "Prompt injection markers in researchAnswer",
    };
  }

  if (detectForbiddenActionClaims(answer)) {
    return {
      ok: false,
      reasons: ["FORBIDDEN_ACTION_CLAIM"],
      detail: "Forbidden purchase/ads/inventory mutation language in draft",
    };
  }

  if (
    /\b(promot(?:e|able)\s+to\s+l1|real\s+merchant\s+fact|authorize\s+purchase)\b/i.test(
      answer,
    )
  ) {
    return {
      ok: false,
      reasons: ["L1_PROMOTION_ATTEMPT"],
      detail: "Draft attempts L1 / real-fact promotion",
    };
  }

  const acceptedIds = new Set(input.accepted.map((e) => e.evidenceId));
  const fake = detectFakeCitations(draft.citedEvidenceIds, acceptedIds);
  if (fake.length > 0) {
    return {
      ok: false,
      reasons: ["FORGED_CITATION"],
      detail: `Fake citations: ${fake.join(",")}`,
    };
  }

  const conflictEvidenceIds = new Set<string>();
  for (const conflict of input.conflicts ?? []) {
    for (const id of conflict.evidenceIds) {
      conflictEvidenceIds.add(id);
    }
  }

  const claims = validateAllMaterialClaims({
    claims: draft.materialClaims,
    accepted: input.accepted,
    rejectedEvidenceIds: input.rejectedEvidenceIds,
    evidenceHash: input.evidenceHash,
    draftEvidenceHash: draft.evidenceHash,
    conflictEvidenceIds,
  });

  if (!claims.ok) {
    return {
      ok: false,
      reasons: [claims.firstFailure.code],
      detail: claims.firstFailure.detail,
    };
  }

  // Every cited id should correspond to at least one material claim bind
  // when materialClaims are present; empty materialClaims with citations is ok
  // only when answer is purely meta — still require citations ⊆ accepted.
  return { ok: true };
}
