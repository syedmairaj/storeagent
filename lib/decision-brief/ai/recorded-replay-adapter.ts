/**
 * M7.4e E3.3 — recorded_replay adapter (offline only).
 *
 * Replays checked-in candidates keyed by groundingHash.
 * supportsLiveNetwork=false. No network I/O.
 */

import {
  type AiExplanationAdapter,
  type AiExplanationAdapterResult,
  type AiExplanationCandidateV1,
  type AiExplanationGenerateOptions,
  type DeterministicGroundingEnvelope,
} from "@/lib/decision-brief/ai/types";

export type RecordedReplayAdapterOptions = {
  /**
   * groundingHash → candidate. Candidates must already bind to that hash.
   */
  recordings: ReadonlyMap<
    string,
    AiExplanationCandidateV1
  >;
  provider?: string;
  model?: string;
};

export function createRecordedReplayAdapter(
  options: RecordedReplayAdapterOptions,
): AiExplanationAdapter {
  return {
    adapterId: "recorded_replay",
    supportsLiveNetwork: false,

    async generate(
      envelope: DeterministicGroundingEnvelope,
      _generateOptions: AiExplanationGenerateOptions,
    ): Promise<AiExplanationAdapterResult> {
      void _generateOptions;

      const recorded =
        options.recordings.get(
          envelope.groundingHash,
        );

      if (
        !recorded
      ) {
        return {
          ok: false,
          reason: "AI_UNAVAILABLE",
          detail:
            "No recorded replay candidate for groundingHash.",
        };
      }

      if (
        recorded.groundingHash !==
        envelope.groundingHash
      ) {
        return {
          ok: false,
          reason: "GROUNDING_HASH_MISMATCH",
          detail:
            "Recorded candidate groundingHash does not match envelope.",
        };
      }

      return {
        ok: true,
        candidate: {
          ...recorded,
          adapterId: "recorded_replay",
          provider:
            options.provider ??
            recorded.provider ??
            "replay",
          model:
            options.model ??
            recorded.model ??
            "replay-fixture",
        },
      };
    },
  };
}
