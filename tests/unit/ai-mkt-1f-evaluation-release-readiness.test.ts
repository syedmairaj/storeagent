/**
 * AI-MKT-1f — offline adversarial evaluation & release-readiness suite.
 * Principle: The AI controls the investigation. It does not control what counts as a fact.
 */

import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  MARKET_RESEARCH_POLICY_PIN,
  RESEARCH_ARCH_MAX_DEADLINE_MS,
  RESEARCH_ARCH_MAX_STEPS,
  RESEARCH_ARCH_MAX_TOOL_CALLS,
  RESEARCH_DEFAULT_DEADLINE_MS,
  RESEARCH_DEFAULT_MAX_TOOL_CALLS,
} from "@/lib/market-research";
import { validateEvaluationFixture } from "@/tests/evaluation/fixture";
import {
  runAiMkt1fCase,
  runAiMkt1fSuite,
  type AiMkt1fCaseResult,
} from "@/tests/evaluation/ai-mkt-1f-runner";
import {
  aiMkt1fEvalV1Fixture,
  listAiMkt1fCaseIds,
} from "@/tests/fixtures/ai/ai-mkt-1f-eval-v1";

const ROOT = path.resolve(__dirname, "../..");

describe("AI-MKT-1f evaluation & release readiness", () => {
  const fixture = validateEvaluationFixture(aiMkt1fEvalV1Fixture);
  const cases = fixture.input.cases;

  it("publishes a versioned synthetic fixture catalog", () => {
    expect(fixture.id).toBe("ai/ai-mkt-1f-eval-v1");
    expect(fixture.fixtureVersion).toBe(1);
    expect(fixture.domain).toBe("ai");
    expect(cases.length).toBeGreaterThanOrEqual(40);
    expect(new Set(listAiMkt1fCaseIds()).size).toBe(cases.length);
    expect(fixture.input.asOf).toBe("2026-11-27T00:00:00.000Z");
    expect(fixture.input.policyPin).toBe(MARKET_RESEARCH_POLICY_PIN);
  });

  it("covers golden, security, evidence, execution, and merchant matrix themes", () => {
    const ids = listAiMkt1fCaseIds().join("\n");
    expect(ids).toContain("G01-exact-sku-ae-research");
    expect(ids).toContain("G04-conflict-signals");
    expect(ids).toContain("G10-guarded-merchant-preview-dto");
    expect(ids).toContain("S01-unauthenticated");
    expect(ids).toContain("S13-production-enabled-zero-orchestration");
    expect(ids).toContain("S15-gemini-normalize-analyze-forbidden");
    expect(ids).toContain("E01-gtin-contradict-variant");
    expect(ids).toContain("E10-search-not-sales");
    expect(ids).toContain("E15-prompt-injection-text");
    expect(ids).toContain("X01-bounds-ceilings");
    expect(ids).toContain("X08-zero-spend-credits");
    expect(ids).toContain("M01-dto-id-hash-safety");
    expect(ids).toContain("M06-hidden-feature-bypass");

    const categories = new Set(cases.map((c) => c.category));
    expect(categories.has("golden")).toBe(true);
    expect(categories.has("security")).toBe(true);
    expect(categories.has("evidence")).toBe(true);
    expect(categories.has("execution")).toBe(true);
    expect(categories.has("merchant")).toBe(true);
  });

  it("marks security and evidence honesty cases as critical", () => {
    const critical = cases.filter((c) => c.risk === "critical");
    expect(critical.length).toBeGreaterThanOrEqual(30);
    expect(critical.some((c) => c.id.includes("unauthenticated"))).toBe(true);
    expect(critical.some((c) => c.id.includes("search-not-sales"))).toBe(true);
    expect(critical.some((c) => c.id.includes("dto-id-hash-safety"))).toBe(true);
  });

  it("verifies research bounds clamp to AI-ARCH ceilings", () => {
    expect(RESEARCH_ARCH_MAX_STEPS).toBe(6);
    expect(RESEARCH_ARCH_MAX_TOOL_CALLS).toBe(4);
    expect(RESEARCH_ARCH_MAX_DEADLINE_MS).toBe(8000);
    expect(RESEARCH_DEFAULT_MAX_TOOL_CALLS).toBe(1);
    expect(RESEARCH_DEFAULT_DEADLINE_MS).toBe(2000);
  });

  for (const caseDef of cases) {
    it(`${caseDef.id} — ${caseDef.title}`, async () => {
      const result = await runAiMkt1fCase(caseDef);
      if (result.skipped) {
        expect(result.skipReason, "SKIP requires explicit reason").toBeTruthy();
        expect(result.residualGate, "SKIP requires residual gate").toBeTruthy();
        // SKIP must never count as PASS.
        expect(result.passed).toBe(false);
        return;
      }
      if (!result.passed) {
        expect.fail(
          `${result.caseId} FAILED: ${result.failureDetail ?? "unknown"} (actual=${result.actualStatus} codes=${result.actualCodes.join(",")})`,
        );
      }
      expect(result.passed).toBe(true);
    });
  }

  it("suite summary: all critical mandatory cases pass; SKIP never counted as PASS", async () => {
    const results = await runAiMkt1fSuite(cases);
    const skipped = results.filter((r) => r.skipped);
    const failed = results.filter((r) => !r.passed && !r.skipped);
    const criticalFailed = failed.filter((r) => r.critical);
    const summary = formatSummary(results);

    expect(criticalFailed, summary).toEqual([]);
    expect(failed, summary).toEqual([]);
    for (const s of skipped) {
      expect(s.passed).toBe(false);
      expect(s.skipReason).toBeTruthy();
      expect(s.residualGate).toBeTruthy();
    }
  });

  it("evaluation sources stay offline (no network / live AI / writes)", () => {
    const roots = [
      "tests/fixtures/ai/ai-mkt-1f-eval-v1.ts",
      "tests/evaluation/ai-mkt-1f-runner.ts",
    ];
    const fetchCall = ["fetch", "("].join("");
    for (const relative of roots) {
      const source = fs.readFileSync(path.join(ROOT, relative), "utf8");
      const codeLines = source
        .split("\n")
        .filter(
          (line) =>
            !line.trim().startsWith("//") &&
            !line.includes("fetchCall") &&
            !line.includes("network fetch call"),
        )
        .join("\n");
      expect(codeLines.includes(fetchCall)).toBe(false);
      expect(source.includes(["create", "Supabase"].join(""))).toBe(false);
      expect(source.includes(["Sync", "Run"].join(""))).toBe(false);
      expect(
        source.includes(["supportsLiveNetwork", ": true"].join("")),
      ).toBe(false);
      expect(source.includes(["api", ".", "openai", ".", "com"].join(""))).toBe(
        false,
      );
      expect(
        source.includes(["api", ".", "anthropic", ".", "com"].join("")),
      ).toBe(false);
      expect(
        source.includes(
          ["generativelanguage", ".", "googleapis", ".", "com"].join(""),
        ),
      ).toBe(false);
    }
  });

  it("does not invent credit/budget enforcement in honesty case", async () => {
    const honesty = cases.find((c) => c.id.includes("X08-zero-spend"));
    expect(honesty).toBeDefined();
    expect(honesty!.expected.creditsNotImplemented).toBe(true);
    expect(honesty!.expected.liveSpendZero).toBe(true);
    const result = await runAiMkt1fCase(honesty!);
    expect(result.passed).toBe(true);
    expect(result.notes.join(" ")).toContain("not_implemented:credits");
  });
});

function formatSummary(results: readonly AiMkt1fCaseResult[]): string {
  const lines = results.map((r) => {
    const mark = r.skipped ? "SKIP" : r.passed ? "PASS" : "FAIL";
    const risk = r.critical ? "CRITICAL" : "noncrit";
    const detail = r.skipped
      ? `${r.skipReason} :: gate=${r.residualGate}`
      : r.passed
        ? r.actualStatus
        : `${r.actualStatus} :: ${r.failureDetail ?? ""}`;
    return `${mark} [${risk}] ${r.caseId} — ${detail}`;
  });
  const passed = results.filter((r) => r.passed).length;
  const skipped = results.filter((r) => r.skipped).length;
  return `AI-MKT-1f results PASS=${passed} SKIP=${skipped} TOTAL=${results.length}\n${lines.join("\n")}`;
}
