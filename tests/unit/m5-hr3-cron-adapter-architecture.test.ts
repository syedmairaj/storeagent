import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

const AUTH = read("lib/persistence/metric-cron-auth.ts");
const RECOMPUTE_CRON = read(
  "app/api/internal/cron/metric-recompute/route.ts",
);
const ROLLOVER_CRON = read(
  "app/api/internal/cron/metric-rollover/route.ts",
);
const RECOMPUTE_POST = read("app/api/internal/metric-recompute/route.ts");
const ROLLOVER_POST = read("app/api/internal/metric-rollover/route.ts");
const WORKER = read("workers/aggregate-metrics.ts");
const QUEUE = read("lib/persistence/metric-recompute-queue.ts");
const ROLLOVER_QUEUE = read("lib/persistence/metric-rollover.ts");
const ENV = read(".env.example");

describe("M5-HR3.1 cron adapter architecture", () => {
  it("GET-only Node routes with maxDuration=60", () => {
    for (const route of [RECOMPUTE_CRON, ROLLOVER_CRON]) {
      expect(route).toContain('export const runtime = "nodejs"');
      expect(route).toContain("export const maxDuration = 60");
      expect(route).toContain("export async function GET");
      expect(route).not.toMatch(/export async function POST/);
      expect(route).not.toMatch(/export async function PUT/);
      expect(route).not.toMatch(/export async function DELETE/);
    }
  });

  it("uses CRON_SECRET gate; does not use worker-secret HTTP gates", () => {
    expect(AUTH).toContain("CRON_SECRET");
    expect(AUTH).toContain("CRON_SECRET_MIN_LENGTH = 32");
    expect(AUTH).toContain("CRON_AUTHORIZATION_MAX_LENGTH");
    expect(AUTH).toContain("timingSafeEqual");
    expect(AUTH).toContain('error: "cron_not_configured"');
    expect(AUTH).toContain('error: "unauthorized"');
    expect(AUTH).toContain('error: "not_found"');
    expect(AUTH).toContain('error: "organization_scope_required"');

    for (const route of [RECOMPUTE_CRON, ROLLOVER_CRON]) {
      expect(route).toContain("readCronSecret");
      expect(route).toContain("isAuthorizedCronRequest");
      expect(route).not.toContain("evaluateMetricRecomputeHttpGate");
      expect(route).not.toContain("evaluateMetricRolloverHttpGate");
      // Executable code must not read worker bearer secrets (comments alone
      // are insufficient — forbid process.env / config field access forms).
      expect(route).not.toMatch(
        /process\.env\.METRIC_(?:RECOMPUTE|ROLLOVER)_WORKER_SECRET/,
      );
      expect(route).not.toMatch(
        /METRIC_(?:RECOMPUTE|ROLLOVER)_WORKER_SECRET\s*[:=]/,
      );
    }

    expect(RECOMPUTE_CRON).toContain("evaluateMetricRecomputeCronGate");
    expect(ROLLOVER_CRON).toContain("evaluateMetricRolloverCronGate");
  });

  it("§2.4: CRON auth runs before worker-config parse and admin client", () => {
    for (const route of [RECOMPUTE_CRON, ROLLOVER_CRON]) {
      const getIdx = route.indexOf("export async function GET");
      expect(getIdx).toBeGreaterThan(-1);
      const body = route.slice(getIdx);
      const authIdx = body.indexOf("isAuthorizedCronRequest");
      const configIdx = body.search(
        /readMetric(?:Recompute|Rollover)WorkerConfig/,
      );
      const adminIdx = body.indexOf("createSupabaseAdminClient");
      expect(authIdx).toBeGreaterThan(-1);
      expect(configIdx).toBeGreaterThan(-1);
      expect(adminIdx).toBeGreaterThan(-1);
      expect(authIdx).toBeLessThan(configIdx);
      expect(configIdx).toBeLessThan(adminIdx);
      expect(route).toContain('"cache-control": "no-store"');
      expect(route).not.toMatch(
        /console\.(?:info|log|error|warn)\([^)]*CRON_SECRET/,
      );
      expect(route).not.toMatch(
        /console\.(?:info|log|error|warn)\([^)]*cronSecret/,
      );
    }
  });

  it("never selects tenant/asOf from query, body, or org headers", () => {
    for (const route of [RECOMPUTE_CRON, ROLLOVER_CRON]) {
      expect(route).not.toMatch(/request\.(json|text)\s*\(/);
      expect(route).not.toContain("searchParams");
      expect(route).not.toMatch(
        /headers\.get\(\s*["'](?:x-organization-id|organization-id|organizationId|x-as-of|asOf)["']\s*\)/,
      );
      expect(route).toContain("organizationId: gate.organizationId");
    }
  });

  it("calls tick/enqueue in-process; forbids HTTP-to-POST self-calls", () => {
    expect(RECOMPUTE_CRON).toContain("runMetricRecomputeTick");
    expect(RECOMPUTE_CRON).toContain("organizationId: gate.organizationId");
    expect(ROLLOVER_CRON).toContain("queue.enqueue");
    expect(ROLLOVER_CRON).toContain("organizationId: gate.organizationId");

    for (const route of [RECOMPUTE_CRON, ROLLOVER_CRON]) {
      expect(route).not.toMatch(/\bfetch\s*\(/);
      expect(route).not.toContain("/api/internal/metric-recompute");
      expect(route).not.toContain("/api/internal/metric-rollover");
      expect(route).not.toContain("p_organization_id: null");
      expect(route).not.toContain("organizationId: null");
    }
  });

  it("does not create vercel.json or active cron schedules", () => {
    expect(fs.existsSync(path.join(ROOT, "vercel.json"))).toBe(false);
    expect(fs.existsSync(path.join(ROOT, "vercel.ts"))).toBe(false);
    expect(RECOMPUTE_CRON).not.toMatch(/"crons"\s*:/);
    expect(ROLLOVER_CRON).not.toMatch(/"crons"\s*:/);
    expect(RECOMPUTE_CRON).not.toMatch(/\*\/\d+ \* \* \* \*/);
    expect(ROLLOVER_CRON).not.toMatch(/\*\/\d+ \* \* \* \*/);
    expect(ENV).toMatch(/CRON_SECRET=\s*$/m);
    expect(ENV).toContain("Leave unset; do not schedule crons casually");
  });

  it("keeps workers/* provider-agnostic (no Vercel imports)", () => {
    expect(WORKER).not.toContain("vercel");
    expect(WORKER).not.toContain("CRON_SECRET");
    expect(QUEUE).not.toContain("CRON_SECRET");
    expect(ROLLOVER_QUEUE).not.toContain("CRON_SECRET");
  });

  it("preserves HR1.a/b POST routes and org gates unchanged", () => {
    expect(RECOMPUTE_POST).toContain("evaluateMetricRecomputeHttpGate");
    expect(RECOMPUTE_POST).toContain("export async function POST");
    expect(RECOMPUTE_POST).not.toContain("evaluateMetricRecomputeCronGate");
    expect(ROLLOVER_POST).toContain("evaluateMetricRolloverHttpGate");
    expect(ROLLOVER_POST).toContain("export async function POST");
    expect(ROLLOVER_POST).not.toContain("evaluateMetricRolloverCronGate");
    expect(QUEUE).toContain('error: "organization_scope_required"');
    expect(ROLLOVER_QUEUE).toContain('error: "organization_scope_required"');
    expect(ROLLOVER_QUEUE).not.toContain("METRIC_RECOMPUTE_ORGANIZATION_ID");
  });

  it("rollover cron does not fall back to recompute org env", () => {
    expect(ROLLOVER_CRON).not.toMatch(
      /process\.env\.METRIC_RECOMPUTE_ORGANIZATION_ID/,
    );
    expect(ROLLOVER_CRON).not.toMatch(
      /METRIC_RECOMPUTE_ORGANIZATION_ID\s*[:=]/,
    );
    expect(AUTH).toContain("Does not read METRIC_RECOMPUTE_ORGANIZATION_ID");
    expect(ROLLOVER_QUEUE).toContain("METRIC_ROLLOVER_ORGANIZATION_ID");
    expect(ROLLOVER_CRON).toContain("readMetricRolloverWorkerConfig");
  });
});
