import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

const GUARD = read("lib/persistence/metric-worker-runtime-env.ts");
const QUEUE = read("lib/persistence/metric-recompute-queue.ts");
const ROLLOVER = read("lib/persistence/metric-rollover.ts");
const RECOMPUTE_POST = read("app/api/internal/metric-recompute/route.ts");
const ROLLOVER_POST = read("app/api/internal/metric-rollover/route.ts");
const RECOMPUTE_CRON = read(
  "app/api/internal/cron/metric-recompute/route.ts",
);
const ROLLOVER_CRON = read("app/api/internal/cron/metric-rollover/route.ts");
const WORKER = read("workers/aggregate-metrics.ts");
const AUTH = read("lib/persistence/metric-cron-auth.ts");

describe("M5-HR3.2a Preview worker guard architecture", () => {
  it("central guard keys only on exact VERCEL_ENV=preview", () => {
    expect(GUARD).toContain('import "server-only"');
    expect(GUARD).toContain('VERCEL_PREVIEW_ENV = "preview"');
    expect(GUARD).toContain("isVercelPreviewRuntime");
    expect(GUARD).toContain("isMetricWorkerEnvEnabled");
    expect(GUARD).toContain("env.VERCEL_ENV === VERCEL_PREVIEW_ENV");
    expect(GUARD).toContain('enabledFlag === "1"');
    expect(GUARD).toContain("verified Production");
    expect(GUARD).toContain("exact `preview` only");

    // Executable surface must not branch on these (comments may mention bans).
    const executable = GUARD.replace(/\/\*[\s\S]*?\*\//g, "").replace(
      /\/\/.*$/gm,
      "",
    );
    expect(executable).not.toContain("NODE_ENV");
    expect(executable).not.toMatch(/\bheaders\b/);
    expect(executable).not.toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(executable).not.toMatch(/\brequest\b/);
    // No positive Production attestation in executable logic.
    expect(executable).not.toContain('=== "production"');
  });

  it("both config readers inherit the shared Preview hard-disable", () => {
    expect(QUEUE).toContain("isMetricWorkerEnvEnabled");
    expect(QUEUE).toContain("METRIC_RECOMPUTE_WORKER_ENABLED");
    expect(ROLLOVER).toContain("isMetricWorkerEnvEnabled");
    expect(ROLLOVER).toContain("METRIC_ROLLOVER_WORKER_ENABLED");

    // No direct ENABLE === "1" bypass that skips the Preview guard.
    expect(QUEUE).not.toMatch(
      /enabled:\s*\n\s*env\.METRIC_RECOMPUTE_WORKER_ENABLED === "1"/,
    );
    expect(ROLLOVER).not.toMatch(
      /enabled:\s*\n\s*env\.METRIC_ROLLOVER_WORKER_ENABLED === "1"/,
    );
  });

  it("all four HTTP entry points read config (inherit guard); no alternate enable path", () => {
    expect(RECOMPUTE_POST).toContain("readMetricRecomputeWorkerConfig");
    expect(RECOMPUTE_POST).toContain("evaluateMetricRecomputeHttpGate");
    expect(ROLLOVER_POST).toContain("readMetricRolloverWorkerConfig");
    expect(ROLLOVER_POST).toContain("evaluateMetricRolloverHttpGate");
    expect(RECOMPUTE_CRON).toContain("readMetricRecomputeWorkerConfig");
    expect(RECOMPUTE_CRON).toContain("evaluateMetricRecomputeCronGate");
    expect(ROLLOVER_CRON).toContain("readMetricRolloverWorkerConfig");
    expect(ROLLOVER_CRON).toContain("evaluateMetricRolloverCronGate");

    for (const route of [
      RECOMPUTE_POST,
      ROLLOVER_POST,
      RECOMPUTE_CRON,
      ROLLOVER_CRON,
    ]) {
      expect(route).not.toMatch(
        /METRIC_(?:RECOMPUTE|ROLLOVER)_WORKER_ENABLED\s*===\s*["']1["']/,
      );
      expect(route).not.toContain("VERCEL_ENV");
      expect(route).not.toMatch(/headers\.get\(\s*["']x-vercel-env["']/);
    }
  });

  it("keeps tick libraries and cron auth free of Vercel preview coupling", () => {
    expect(WORKER).not.toContain("VERCEL_ENV");
    expect(WORKER).not.toContain("isMetricWorkerEnvEnabled");
    expect(WORKER).not.toContain("isVercelPreviewRuntime");
    expect(AUTH).not.toContain("VERCEL_ENV");
    expect(AUTH).not.toContain("isMetricWorkerEnvEnabled");
  });

  it("does not introduce vercel.json or active cron schedules", () => {
    expect(fs.existsSync(path.join(ROOT, "vercel.json"))).toBe(false);
    expect(fs.existsSync(path.join(ROOT, "vercel.ts"))).toBe(false);
  });
});
