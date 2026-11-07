import { describe, expect, it } from "vitest";

import {
  STORY_MAX_CYCLES,
  STORY_STAGE_DURATION_MS,
  advanceStory,
  canAutoAdvance,
  initialStoryPlayback,
  requestPause,
  requestPlay,
  requestReplay,
  takeManualControl,
} from "@/components/marketing/decision-story-playback";

const openGates = {
  inView: true,
  reducedMotion: false,
  isMobile: false,
  documentHidden: false,
  hovered: false,
  focused: false,
};

describe("decision-story-playback", () => {
  it("uses the required per-stage dwell times", () => {
    expect([...STORY_STAGE_DURATION_MS]).toEqual([5000, 7000, 7000, 9000]);
  });

  it("advances stages then restarts for a second cycle", () => {
    let state = initialStoryPlayback();
    for (let i = 0; i < 3; i++) state = advanceStory(state);
    expect(state.stageIndex).toBe(3);
    state = advanceStory(state);
    expect(state.stageIndex).toBe(0);
    expect(state.cycleCount).toBe(1);
    expect(state.mode).toBe("auto");
  });

  it("completes after two full cycles and holds review", () => {
    let state = initialStoryPlayback();
    const stages: number[] = [];
    // cycle 0: 4 advances → cycle 1 at stage 0
    for (let i = 0; i < 4; i++) {
      state = advanceStory(state);
      stages.push(state.stageIndex);
    }
    expect(stages).toEqual([1, 2, 3, 0]);
    expect(state.cycleCount).toBe(1);
    // cycle 1: 4 advances → complete
    for (let i = 0; i < 4; i++) state = advanceStory(state);
    expect(state.mode).toBe("complete");
    expect(state.cycleCount).toBe(STORY_MAX_CYCLES);
    expect(state.stageIndex).toBe(3);
    expect(state.wantsPlay).toBe(false);
    // stuck
    const stuck = advanceStory(state);
    expect(stuck.stageIndex).toBe(3);
    expect(stuck.mode).toBe("complete");
  });

  it("manual control cancels autoplay until play/replay", () => {
    let state = initialStoryPlayback();
    state = takeManualControl(state, { stageIndex: 2 });
    expect(state.mode).toBe("manual");
    expect(canAutoAdvance(state, openGates)).toBe(false);
    state = requestPlay(state);
    expect(state.mode).toBe("auto");
    expect(canAutoAdvance(state, openGates)).toBe(true);
    state = requestPause(state);
    expect(canAutoAdvance(state, openGates)).toBe(false);
    state = requestReplay();
    expect(state.stageIndex).toBe(0);
    expect(state.cycleCount).toBe(0);
  });

  it("blocks autoplay on mobile, reduced motion, hover, and offscreen", () => {
    const state = initialStoryPlayback();
    expect(canAutoAdvance(state, { ...openGates, isMobile: true })).toBe(false);
    expect(
      canAutoAdvance(state, { ...openGates, reducedMotion: true }),
    ).toBe(false);
    expect(canAutoAdvance(state, { ...openGates, hovered: true })).toBe(false);
    expect(canAutoAdvance(state, { ...openGates, inView: false })).toBe(false);
    expect(
      canAutoAdvance(state, { ...openGates, documentHidden: true }),
    ).toBe(false);
  });
});
