import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

const ROOT = process.cwd();
const MIGRATION =
  "supabase/migrations/20261030200000_m6_p4c1_forecast_evaluation_persistence.sql";

function read(relative: string): string {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

function normalized(relative: string): string {
  return read(relative).replace(/\s+/g, " ").toLowerCase();
}

describe("M6 P4c.1 forecast evaluation persistence architecture", () => {
  it("adds immutable evaluation runs and model scores tables", () => {
    const source = read(MIGRATION);

    expect(source).toContain("create table public.forecast_evaluation_runs");
    expect(source).toContain(
      "create table public.forecast_evaluation_model_scores",
    );
    expect(source).toContain("forecast_evaluation_runs_idempotency_uidx");
    expect(source).toContain("fixture_fingerprint");
    expect(source).toContain("algorithm_versions_fingerprint");
    expect(source).toContain("origins_hash");
    expect(source).toContain("is_scored_evaluation");
    expect(source).toContain("scored_dates date[]");
    expect(source).toContain("origins_hash");
    expect(source).not.toMatch(/^\s*origins\s+jsonb/im);
  });

  it("hard-false trust flags and scored vs audit-only gates", () => {
    const source = read(MIGRATION);
    const sql = normalized(MIGRATION);

    expect(source).toContain("forecast_evaluation_runs_trust_hard_false_check");
    expect(sql).toContain("claims_production_approval = false");
    expect(sql).toContain("claims_m7_numeric_eligibility = false");
    expect(sql).toContain("algorithm_approved = false");
    expect(source).toContain("forecast_evaluation_runs_scored_gate_check");
    expect(source).toContain("'preliminary'");
    expect(source).toContain("'INSUFFICIENT_BACKTEST_POINTS'");
    expect(source).toContain("'UNSUPPORTED_HISTORICAL_REPLAY'");
    expect(source).toContain("'INVALID_HISTORY'");
  });

  it("blocks mutation and denies direct client/service_role DML", () => {
    const source = read(MIGRATION);

    expect(source).toContain("prevent_forecast_evaluation_mutation");
    expect(source).toContain(
      "before update or delete on public.forecast_evaluation_runs",
    );
    expect(source).toContain(
      "before update or delete on public.forecast_evaluation_model_scores",
    );
    expect(source).toContain(
      "revoke all\non table public.forecast_evaluation_runs\nfrom public, anon, authenticated, service_role",
    );
    expect(source).toContain(
      "revoke all\non table public.forecast_evaluation_model_scores\nfrom public, anon, authenticated, service_role",
    );
    expect(source).toContain("grant select\non table public.forecast_evaluation_runs");
    expect(source).toContain("forecast_evaluation_runs_select_member");
    expect(source).toContain(
      "forecast_evaluation_model_scores_select_member",
    );
  });

  it("defines SECURITY DEFINER service_role persist RPC with empty search_path", () => {
    const source = read(MIGRATION);
    const sql = normalized(MIGRATION);

    expect(source).toContain(
      "create or replace function public.persist_forecast_evaluation_result(",
    );
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(source).toContain(
      "grant execute\non function public.persist_forecast_evaluation_result",
    );
    expect(source).toContain("to service_role");
    expect(source).toContain("from public, anon, authenticated");
    expect(source).toContain("EVALUATION_IDEMPOTENCY_BODY_CONFLICT");
    expect(source).toContain("'replayed'");
    expect(source).toContain("'created'");
    expect(source).toContain("rejects trustedCompleteDates");
    expect(source).toContain(
      "rejects production/M7/algorithm approval claims",
    );
    expect(source).not.toMatch(/current_pointer|published_at|create table public\.forecast_publications/i);
  });

  it("requires three models for scored diagnostics and zero for rejections", () => {
    const source = read(MIGRATION);

    expect(source).toContain(
      "scored forecast evaluation requires exactly three model scores",
    );
    expect(source).toContain(
      "audit-only forecast evaluation must persist zero model scores",
    );
    expect(source).toContain(
      "rejected integrity must not persist as scored evaluation",
    );
    expect(source).toContain("forecast_evaluation_assert_finite_numeric");
    expect(source).toContain("candidate");
    expect(source).toContain("naive_lag1");
    expect(source).toContain("'zero'");
  });
});
