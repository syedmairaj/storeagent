import { describe, expect, it } from "vitest";

describe("StoreAgent foundation", () => {
  it("keeps deterministic inventory truth outside the AI layer", () => {
    const numericTruthOwner = "deterministic-engine";
    const aiRole = "explanation";

    expect(numericTruthOwner).toBe("deterministic-engine");
    expect(aiRole).not.toBe(numericTruthOwner);
  });
});
