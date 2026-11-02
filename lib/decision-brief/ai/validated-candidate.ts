/**
 * M7.4e E3.3 — opaque mint for semantically validated AI candidates.
 *
 * Only validateAiExplanationCandidate may mint. mergeAiValidatedBrief
 * refuses any object that was not minted here (WeakSet gate), so callers
 * cannot label arbitrary prose as ai_validated by importing merge.
 */

import type {
  AiExplanationCandidateV1,
} from "@/lib/decision-brief/ai/types";

const mintedValidatedCandidates =
  new WeakSet<object>();

/**
 * Opaque holder. Constructed only via mintSemanticallyValidatedCandidate.
 * Do not forge — merge rejects non-minted objects at runtime.
 */
export type SemanticallyValidatedAiExplanationCandidate = {
  readonly candidate: AiExplanationCandidateV1;
};

/**
 * Mint after full shape + claim + semantic validation succeeds.
 * Internal to the AI adapter package.
 */
export function mintSemanticallyValidatedCandidate(
  candidate: AiExplanationCandidateV1,
): SemanticallyValidatedAiExplanationCandidate {
  const token: SemanticallyValidatedAiExplanationCandidate = {
    candidate,
  };

  mintedValidatedCandidates.add(
    token,
  );

  return token;
}

/**
 * Runtime gate used by merge — forged plain objects fail closed.
 */
export function isSemanticallyValidatedCandidate(
  value: unknown,
): value is SemanticallyValidatedAiExplanationCandidate {
  return (
    typeof value === "object" &&
    value !== null &&
    mintedValidatedCandidates.has(
      value,
    )
  );
}
