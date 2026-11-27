/**
 * AI-ARCH-1f — offline evaluation & release-readiness suite.
 * Design: docs/AI_ARCH_0_TECHNICAL_DESIGN.md §9–12
 * Principle: The AI controls the investigation. It does not control what counts as a fact.
 */

import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  ORCHESTRATOR_DEFAULT_DEADLINE_MS,
  ORCHESTRATOR_MAX_STEPS,
  ORCHESTRATOR_MAX_TOOL_CALLS,
  COMMERCE_AGENT_STRUCTURED_INTENTS,
} from "@/lib/commerce-agent";
import { validateEvaluationFixture } from "@/tests/evaluation/fixture";
import {
  runAiArch1fCase,
  runAiArch1fSuite,
  type AiArch1fCaseResult,
} from "@/tests/evaluation/ai-arch-1f-runner";
import {
  aiArch1fEvalV1Fixture,
  listAiArch1fCaseIds,
} from "@/tests/fixtures/ai/ai-arch-1f-eval-v1";

const ROOT = path.resolve(__dirname, "../..");

describe("AI-ARCH-1f evaluation & release readiness", () => {
  const fixture = validateEvaluationFixture(aiArch1fEvalV1Fixture);
  const cases = fixture.input.cases;

  it("publishes a versioned synthetic fixture catalog", () => {
    expect(fixture.id).toBe("ai/ai-arch-1f-eval-v1");
    expect(fixture.fixtureVersion).toBe(1);
    expect(fixture.domain).toBe("ai");
    expect(cases.length).toBeGreaterThanOrEqual(30);
    expect(new Set(listAiArch1fCaseIds()).size).toBe(cases.length);
    expect(fixture.input.asOf).toBe("2026-11-27T00:00:00.000Z");
  });

  it("covers design §9 matrix themes and four structured intents", () => {
    const ids = listAiArch1fCaseIds().join("\n");
    expect(ids).toContain("G01-correct-inventory-facts");
    expect(ids).toContain("G03-zero-sales");
    expect(ids).toContain("G04-missing-evidence");
    expect(ids).toContain("G07-conflicting");
    expect(ids).toContain("G08-reorder-explain-only");
    expect(ids).toContain("A01-unauthorized-org");
    expect(ids).toContain("A15-hallucinated-number");
    expect(ids).toContain("A21-forbidden-purchase");
    expect(ids).toContain("B01-orchestrator-bounds");
    expect(ids).toContain("B02-budget-spend-honesty");

    const intents = new Set(
      cases
        .map((c) => c.intentClass)
        .filter((value) => value != null),
    );
    for (const intent of COMMERCE_AGENT_STRUCTURED_INTENTS) {
      expect(intents.has(intent.id)).toBe(true);
    }
  });

  it("marks security and evidence cases as critical", () => {
    const critical = cases.filter((c) => c.risk === "critical");
    expect(critical.length).toBeGreaterThanOrEqual(20);
    expect(
      critical.some((c) => c.id.includes("unauthorized-org")),
    ).toBe(true);
    expect(
      critical.some((c) => c.id.includes("hallucinated-number")),
    ).toBe(true);
    expect(
      critical.some((c) => c.id.includes("merchant-dto-safe")),
    ).toBe(true);
  });

  it("verifies enforced orchestrator bounds (6 / 4 / 8000)", () => {
    expect(ORCHESTRATOR_MAX_STEPS).toBe(6);
    expect(ORCHESTRATOR_MAX_TOOL_CALLS).toBe(4);
    expect(ORCHESTRATOR_DEFAULT_DEADLINE_MS).toBe(8000);
  });

  for (const caseDef of cases) {
    it(`${caseDef.id} — ${caseDef.title}`, async () => {
      const result = await runAiArch1fCase(caseDef);
      if (!result.passed) {
        expect.fail(
          `${result.caseId} FAILED: ${result.failureDetail ?? "unknown"} (actual=${result.actualStatus} codes=${result.actualCodes.join(",")})`,
        );
      }
      expect(result.passed).toBe(true);
    });
  }

  it("suite summary: all critical cases pass", async () => {
    const results = await runAiArch1fSuite(cases);
    const failed = results.filter((r) => !r.passed);
    const criticalFailed = failed.filter((r) => r.critical);

    const summary = formatSummary(results);
    // Keep summary assertion readable in failure output.
    expect(criticalFailed, summary).toEqual([]);
    expect(failed, summary).toEqual([]);
  });

  it("evaluation sources stay offline (no network / live AI / writes)", () => {
    // Scan fixture + runner only (not this file — deny-list strings self-match).
    const roots = [
      "tests/fixtures/ai/ai-arch-1f-eval-v1.ts",
      "tests/evaluation/ai-arch-1f-runner.ts",
    ];
    for (const relative of roots) {
      const source = fs.readFileSync(path.join(ROOT, relative), "utf8");
      expect(source).not.toMatch(/\bfetch\s*\(/);
      expect(source).not.toMatch(/createSupabase/i);
      expect(source).not.toMatch(/\bSyncRun\b/);
      expect(source).not.toContain("supportsLiveNetwork: true");
      expect(source).not.toContain("api.openai.com");
      expect(source).not.toContain("api.anthropic.com");
    }
  });

  it("does not invent credit/budget enforcement in honesty case", async () => {
    const honesty = cases.find((c) => c.id.includes("B02-budget-spend"));
    expect(honesty).toBeDefined();
    expect(honesty!.expected.costEnforcementPresent).toBe(false);
    expect(honesty!.expected.liveSpendZero).toBe(true);
    const result = await runAiArch1fCase(honesty!);
    expect(result.passed).toBe(true);
    expect(result.notes.join(" ")).toContain("not_implemented:credits");
  });
});

function formatSummary(results: readonly AiArch1fCaseResult[]): string {
  const lines = results.map((r) => {
    const mark = r.passed ? "PASS" : "FAIL";
    const risk = r.critical ? "CRITICAL" : "noncrit";
    const detail = r.passed
      ? r.actualStatus
      : `${r.actualStatus} :: ${r.failureDetail ?? ""}`;
    return `${mark} [${risk}] ${r.caseId} — ${detail}`;
  });
  const passed = results.filter((r) => r.passed).length;
  return `AI-ARCH-1f results ${passed}/${results.length}\n${lines.join("\n")}`;
}
