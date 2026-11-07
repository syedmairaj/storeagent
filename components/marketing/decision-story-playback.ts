import { STORY_STAGES } from "@/components/marketing/decision-story-meta";

/** Per-stage dwell while autoplay is active (ms). */
export const STORY_STAGE_DURATION_MS = [
  5000, // Problem
  7000, // Signals
  7000, // Decision
  9000, // Review
] as const;

export const STORY_MAX_CYCLES = 2;

export type StoryPlaybackMode = "auto" | "manual" | "complete";

export type StoryPlaybackState = {
  stageIndex: number;
  cycleCount: number;
  mode: StoryPlaybackMode;
  /** User intent to autoplay when conditions allow. */
  wantsPlay: boolean;
};

export const initialStoryPlayback = (): StoryPlaybackState => ({
  stageIndex: 0,
  cycleCount: 0,
  mode: "auto",
  wantsPlay: true,
});

export function stageDurationMs(stageIndex: number): number {
  return (
    STORY_STAGE_DURATION_MS[
      Math.max(0, Math.min(stageIndex, STORY_STAGE_DURATION_MS.length - 1))
    ] ?? 5000
  );
}

export type AutoplayGates = {
  inView: boolean;
  reducedMotion: boolean;
  isMobile: boolean;
  documentHidden: boolean;
  hovered: boolean;
  focused: boolean;
};

export function canAutoAdvance(
  state: StoryPlaybackState,
  gates: AutoplayGates,
): boolean {
  if (state.mode !== "auto") return false;
  if (!state.wantsPlay) return false;
  if (gates.reducedMotion || gates.isMobile) return false;
  if (!gates.inView || gates.documentHidden) return false;
  if (gates.hovered || gates.focused) return false;
  return true;
}

export function advanceStory(
  state: StoryPlaybackState,
): StoryPlaybackState {
  const last = STORY_STAGES.length - 1;
  if (state.stageIndex < last) {
    return { ...state, stageIndex: state.stageIndex + 1 };
  }
  // Finished Review of current cycle
  const nextCycle = state.cycleCount + 1;
  if (nextCycle >= STORY_MAX_CYCLES) {
    return {
      ...state,
      stageIndex: last,
      cycleCount: STORY_MAX_CYCLES,
      mode: "complete",
      wantsPlay: false,
    };
  }
  return {
    ...state,
    stageIndex: 0,
    cycleCount: nextCycle,
    mode: "auto",
    wantsPlay: true,
  };
}

export function takeManualControl(
  state: StoryPlaybackState,
  patch: Partial<Pick<StoryPlaybackState, "stageIndex">> = {},
): StoryPlaybackState {
  return {
    ...state,
    ...patch,
    mode: "manual",
    wantsPlay: false,
  };
}

export function requestPlay(state: StoryPlaybackState): StoryPlaybackState {
  if (state.mode === "complete") {
    return {
      stageIndex: 0,
      cycleCount: 0,
      mode: "auto",
      wantsPlay: true,
    };
  }
  return { ...state, mode: "auto", wantsPlay: true };
}

export function requestPause(state: StoryPlaybackState): StoryPlaybackState {
  return { ...state, wantsPlay: false, mode: "manual" };
}

export function requestReplay(): StoryPlaybackState {
  return {
    stageIndex: 0,
    cycleCount: 0,
    mode: "auto",
    wantsPlay: true,
  };
}

export function statusLabel(
  state: StoryPlaybackState,
  gates: AutoplayGates,
  advancing: boolean,
): string {
  if (gates.reducedMotion || gates.isMobile) {
    return "Manual mode — use next and previous.";
  }
  if (state.mode === "complete") {
    return "Demo complete — press Replay to watch again.";
  }
  if (!gates.inView) return "Paused while off-screen.";
  if (gates.documentHidden) return "Paused while tab is hidden.";
  if (gates.hovered) return "Paused on hover.";
  if (gates.focused) return "Paused while focused.";
  if (advancing) {
    return `Playing cycle ${state.cycleCount + 1} of ${STORY_MAX_CYCLES}.`;
  }
  return "Paused — press Play to continue.";
}
