import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

const ROOT = process.cwd();

const MIGRATION =
  "supabase/migrations/20261030110000_m6_p2b2b2_forecast_evidence_rpcs.sql";

function migration(): string {
  return fs.readFileSync(path.join(ROOT, MIGRATION), "utf8");
}

function normalized(): string {
  return migration().replace(/\s+/g, " ").toLowerCase();
}

describe("M6 P2b.2b.2 forecast evidence RPC architecture", () => {
  it("defines service_role-only SECURITY DEFINER RPCs with empty search_path", () => {
    const sql = normalized();

    for (const name of [
      "issue_trusted_provider_promotion_evidence",
      "issue_merchant_attestation_promotion_evidence",
      "issue_trusted_provider_coverage_evidence",
      "issue_merchant_attestation_coverage_evidence",
      "invalidate_forecast_day_coverage_evidence",
    ]) {
      expect(sql).toContain(`create or replace function public.${name}`);
    }

    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("grant execute");
    expect(sql).toContain("to service_role");
    expect(sql).toContain(
      "from public, anon, authenticated",
    );
  });

  it("stamps trust inside RPCs and never accepts trust parameters", () => {
    const source = migration();
    const issueBlocks = source.split(
      /create or replace function public\.issue_/i,
    ).slice(1);

    expect(issueBlocks.length).toBeGreaterThanOrEqual(4);

    for (const block of issueBlocks) {
      const header = block.slice(0, block.indexOf("returns"));
      expect(header).not.toMatch(/\bp_trust\b/);
      expect(header).not.toMatch(/\bp_closure_id\b/);
      expect(header).not.toMatch(/\bp_evidence_id\b/);
      expect(header).not.toMatch(/\bp_source\b/);
    }

    expect(source).not.toMatch(/p_closure_id\b/);
    expect(normalized()).toContain("'trusted_provider'");
    expect(normalized()).toContain("'verified_merchant_attestation'");
  });

  it("fail-closes provider complete and requires merchant closure assertion", () => {
    const source = migration();

    expect(source).toMatch(
      /no authoritative day\/stream closure source/i,
    );
    expect(source).toContain("p_assert_day_stream_closed");
    expect(source).toMatch(
      /requires explicit day\/stream closure attestation/i,
    );
    expect(source).not.toMatch(/from public\.sync_runs/);
    expect(source).not.toContain("discount_amount");
  });

  it("uses advisory locking and late-event invalidation fencing", () => {
    const sql = normalized();

    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("for update");
    expect(sql).toContain(
      "late-event observed_at must be after coverage as_of watermark",
    );
    expect(sql).toContain("already invalidated");
  });

  it("requires tenant-agent auth for invalidation and same-scope supersession", () => {
    const source = migration();

    expect(source).toContain(
      "coverage invalidation requires exactly one of integration_id or actor_user_id",
    );
    expect(source).toContain(
      "supersedes_evidence_id scope mismatch for promotion evidence",
    );
    expect(source).toContain(
      "supersedes_evidence_id scope mismatch for coverage evidence",
    );
    expect(source).toMatch(/Owner\/admin day\/stream attestation only/i);
  });
});
