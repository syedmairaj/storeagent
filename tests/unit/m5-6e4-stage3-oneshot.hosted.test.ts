import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * Gated hosted Stage 3 one-shot.
 *
 * Default: skipped (no mutation).
 *
 * Read-only preflight (preferred after a fresh claim):
 *
 *   M56E4_STAGE3_RUN=1
 *   M56E4_STAGE3_MODE=preflight
 *   M56E4_HOSTED_SUPABASE_URL=https://qlsqminsfdntpqdkhxjx.supabase.co
 *   M56E4_HOSTED_SERVICE_ROLE_KEY=…   # never commit / never echo
 *   M56E4_CANARY_APPROVAL=M5_6E4_CANARY_APPROVED
 *   M56E4_EXPECTED_OWNER=m56e4-hosted-canary
 *   M56E4_CLAIM_TOKEN=…              # fresh token only; never reuse disclosed
 *   M56E4_CLAIMED_GENERATION=1
 *   # optional after disclosure:
 *   # M56E4_REVOKED_CLAIM_TOKENS=<disclosed-token>
 *
 * Execute (separate authorization — not this default path):
 *   M56E4_STAGE3_MODE=execute
 *   M56E4_STAGE3_EXECUTE_OK=STAGE3_EXECUTE_APPROVED
 *
 * Do not set METRIC_*_WORKER_ENABLED. Do not edit .env.local.
 */

import {
  formatM56E4Stage3SafeSummary,
  M56E4_STAGE3_PREFLIGHT_TIMEOUT_MS,
  runM56E4Stage3OneshotFromEnv,
  runM56E4Stage3PreflightOnlyFromEnv,
} from "@/lib/canary/m5-6e4-stage3-oneshot";

const shouldRun = process.env.M56E4_STAGE3_RUN === "1";
const requestedMode =
  (process.env.M56E4_STAGE3_MODE ?? "preflight").trim();

describe.skipIf(!shouldRun)(
  "M5.6E.4 Stage 3 hosted oneshot (gated)",
  () => {
    it(
      "runs read-only preflight or authorized execute from process env only",
      async () => {
        const result =
          requestedMode === "execute"
            ? await runM56E4Stage3OneshotFromEnv(process.env)
            : await runM56E4Stage3PreflightOnlyFromEnv(process.env);

        const summary = formatM56E4Stage3SafeSummary(result);

        console.log(JSON.stringify(summary, null, 2));

        expect(summary.supabaseUrl).toBe(
          "https://qlsqminsfdntpqdkhxjx.supabase.co",
        );
        expect(summary.serviceRole).toEqual({
          present: true,
          length: expect.any(Number),
        });
        expect(summary.claimToken).toEqual({
          present: true,
          length: expect.any(Number),
        });

        const serialized = JSON.stringify(summary);
        expect(serialized).not.toMatch(/eyJ|service_role|sb_secret/i);
        expect(serialized).not.toContain(
          process.env.M56E4_HOSTED_SERVICE_ROLE_KEY ??
            "__missing_service_role__",
        );
        expect(serialized).not.toContain(
          process.env.M56E4_CLAIM_TOKEN ?? "__missing_claim_token__",
        );

        if (requestedMode === "execute") {
          expect(summary.mode).toBe("execute");
          expect(summary.leaseExpired).toBe(false);
          expect(summary.completion).toBe("succeeded");
        } else {
          expect(summary.mode).toBe("preflight");
          expect(summary.completion).toBeNull();
          expect(summary.startedAttemptCount).toBeNull();
        }
      },
      M56E4_STAGE3_PREFLIGHT_TIMEOUT_MS,
    );
  },
);

describe("M5.6E.4 Stage 3 hosted oneshot gate", () => {
  it("defaults to skipped so CI/local runs never mutate hosted", () => {
    if (process.env.M56E4_STAGE3_RUN === "1") {
      expect(shouldRun).toBe(true);
      return;
    }

    expect(shouldRun).toBe(false);
  });

  it("documents a preflight timeout above Vitest's 5s default", () => {
    expect(M56E4_STAGE3_PREFLIGHT_TIMEOUT_MS).toBeGreaterThan(5_000);
    expect(M56E4_STAGE3_PREFLIGHT_TIMEOUT_MS).toBe(30_000);
  });
});
