import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  M56E4_CANARY_APPROVAL_PHRASE,
} from "@/lib/canary/m5-6e4-single-grain-recompute";

import {
  assertCanaryRequestMatchesExpectations,
  formatM56E4Stage3SafeSummary,
  M56E4_HOSTED_CANARY_OWNER,
  M56E4_STAGE3_ALGORITHM,
  M56E4_STAGE3_CANARY_LOCATION,
  M56E4_STAGE3_CANARY_METRIC_DATE,
  M56E4_STAGE3_CANARY_ORG,
  M56E4_STAGE3_CANARY_STORE,
  M56E4_STAGE3_CANARY_VARIANT,
  resolveM56E4Stage3Credentials,
  runM56E4Stage3OneshotFromEnv,
  runM56E4Stage3PreflightOnlyFromEnv,
  sanitizeM56E4Stage3ErrorMessage,
  withTimeout,
  type M56E4CanaryRequestRow,
} from "@/lib/canary/m5-6e4-stage3-oneshot";

const TOKEN = "claim-token-abc123";
const SERVICE_KEY = "service-role-key-value-xxxxxxxx";

function baseEnv(
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    M56E4_HOSTED_SUPABASE_URL:
      "https://qlsqminsfdntpqdkhxjx.supabase.co",
    M56E4_HOSTED_SERVICE_ROLE_KEY: SERVICE_KEY,
    M56E4_CANARY_APPROVAL: M56E4_CANARY_APPROVAL_PHRASE,
    M56E4_EXPECTED_OWNER: M56E4_HOSTED_CANARY_OWNER,
    M56E4_CLAIM_TOKEN: TOKEN,
    M56E4_CLAIMED_GENERATION: "1",
    M56E4_STAGE3_MODE: "preflight",
    M56E4_NOW_ISO: "2026-10-28T12:00:00.000Z",
    ...overrides,
  };
}

function claimedRow(
  overrides: Partial<M56E4CanaryRequestRow> = {},
): M56E4CanaryRequestRow {
  return {
    organization_id: M56E4_STAGE3_CANARY_ORG,
    store_id: M56E4_STAGE3_CANARY_STORE,
    location_id: M56E4_STAGE3_CANARY_LOCATION,
    variant_id: M56E4_STAGE3_CANARY_VARIANT,
    metric_date: M56E4_STAGE3_CANARY_METRIC_DATE,
    algorithm_version: M56E4_STAGE3_ALGORITHM,
    status: "claimed",
    lease_owner_id: M56E4_HOSTED_CANARY_OWNER,
    lease_claim_token: TOKEN,
    claimed_generation: 1,
    attempt_count: 0,
    lease_expires_at: "2026-10-28T13:00:24+00:00",
    ...overrides,
  };
}

describe("M5.6E.4 Stage 3 oneshot", () => {
  it("resolves credentials only from M56E4_HOSTED_* and required approvals", () => {
    const resolved = resolveM56E4Stage3Credentials(baseEnv());

    expect(resolved.supabaseUrl).toBe(
      "https://qlsqminsfdntpqdkhxjx.supabase.co",
    );
    expect(resolved.ownerId).toBe(M56E4_HOSTED_CANARY_OWNER);
    expect(resolved.claimedGeneration).toBe(1);
    expect(resolved.mode).toBe("preflight");
    expect(resolved.preflightTimeoutMs).toBe(30_000);
    expect(resolved.networkTimeoutMs).toBe(10_000);
  });

  it("ignores .env.local-style Supabase vars and fails without hosted pin", () => {
    expect(() =>
      resolveM56E4Stage3Credentials(
        baseEnv({
          M56E4_HOSTED_SUPABASE_URL: undefined,
          NEXT_PUBLIC_SUPABASE_URL:
            "https://qlsqminsfdntpqdkhxjx.supabase.co",
          SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
        }),
      ),
    ).toThrow(/M56E4_HOSTED_SUPABASE_URL/);

    expect(() =>
      resolveM56E4Stage3Credentials(
        baseEnv({
          M56E4_HOSTED_SUPABASE_URL:
            "https://127.0.0.1:54321",
        }),
      ),
    ).toThrow(/local Supabase instance/);
  });

  it("marks the Stage 2B canary lease expired relative to now after expiry", () => {
    const matched = assertCanaryRequestMatchesExpectations(
      claimedRow(),
      {
        ownerId: M56E4_HOSTED_CANARY_OWNER,
        claimToken: TOKEN,
        claimedGeneration: 1,
        now: new Date("2026-10-28T14:00:00.000Z"),
      },
    );

    expect(matched.leaseExpired).toBe(true);
  });

  it("refuses execute when the lease is expired", async () => {
    const row = claimedRow({
      lease_expires_at: "2026-10-28T13:00:24+00:00",
    });

    await expect(
      runM56E4Stage3OneshotFromEnv(
        baseEnv({
          M56E4_STAGE3_MODE: "execute",
          M56E4_STAGE3_EXECUTE_OK: "STAGE3_EXECUTE_APPROVED",
          M56E4_NOW_ISO: "2026-10-28T14:00:00.000Z",
        }),
        {
          createClient: () => ({}) as never,
          loadRow: async () => row,
          runRecompute: vi.fn(),
        },
      ),
    ).rejects.toThrow(/lease is expired/);
  });

  it("refuses execute without explicit STAGE3_EXECUTE_APPROVED", async () => {
    await expect(
      runM56E4Stage3OneshotFromEnv(
        baseEnv({
          M56E4_STAGE3_MODE: "execute",
          M56E4_NOW_ISO: "2026-10-28T12:30:00.000Z",
        }),
        {
          createClient: () => ({}) as never,
          loadRow: async () => claimedRow(),
          runRecompute: vi.fn(),
        },
      ),
    ).rejects.toThrow(/M56E4_STAGE3_EXECUTE_OK/);
  });

  it("refuses revoked / compromised claim tokens", () => {
    expect(() =>
      resolveM56E4Stage3Credentials(
        baseEnv({
          M56E4_REVOKED_CLAIM_TOKENS: TOKEN,
        }),
      ),
    ).toThrow(/claim token is revoked/);
  });

  it("preflight-only never calls recompute even if mode=execute is set", async () => {
    const runRecompute = vi.fn();
    const result = await runM56E4Stage3PreflightOnlyFromEnv(
      baseEnv({
        M56E4_STAGE3_MODE: "execute",
        M56E4_STAGE3_EXECUTE_OK: "STAGE3_EXECUTE_APPROVED",
        M56E4_NOW_ISO: "2026-10-28T12:30:00.000Z",
      }),
      {
        createClient: () => ({}) as never,
        loadRow: async () => claimedRow(),
      },
    );

    expect(result.preflight.mode).toBe("preflight");
    expect(result.preflight.request.lease_claim_token).toBeNull();
    expect(runRecompute).not.toHaveBeenCalled();
  });

  it("preflight succeeds without calling recompute", async () => {
    const runRecompute = vi.fn();
    const result = await runM56E4Stage3OneshotFromEnv(
      baseEnv({
        M56E4_NOW_ISO: "2026-10-28T12:30:00.000Z",
      }),
      {
        createClient: () => ({}) as never,
        loadRow: async () => claimedRow(),
        runRecompute,
      },
    );

    expect(result.preflight.leaseExpired).toBe(false);
    expect(result.preflight.readyToExecute).toBe(false);
    expect(runRecompute).not.toHaveBeenCalled();

    const summary = formatM56E4Stage3SafeSummary(result);
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain(SERVICE_KEY);
    expect(serialized).not.toContain(TOKEN);
    expect(summary.claimToken).toEqual({
      present: true,
      length: TOKEN.length,
    });
  });

  it("execute calls the guarded runner when lease is fresh and approved", async () => {
    const runRecompute = vi.fn(async () => ({
      startedAttemptCount: 1,
      completion: "succeeded" as const,
    }));

    const result = await runM56E4Stage3OneshotFromEnv(
      baseEnv({
        M56E4_STAGE3_MODE: "execute",
        M56E4_STAGE3_EXECUTE_OK: "STAGE3_EXECUTE_APPROVED",
        M56E4_NOW_ISO: "2026-10-28T12:30:00.000Z",
      }),
      {
        createClient: () => ({}) as never,
        loadRow: async () => claimedRow(),
        runRecompute,
      },
    );

    expect(runRecompute).toHaveBeenCalledOnce();
    expect(result.completion).toBe("succeeded");
    expect(result.startedAttemptCount).toBe(1);
  });

  it("bounds hanging preflight loads with a timeout and redacts secrets", async () => {
    await expect(
      runM56E4Stage3PreflightOnlyFromEnv(
        baseEnv({
          M56E4_PREFLIGHT_TIMEOUT_MS: "1000",
        }),
        {
          createClient: () => ({}) as never,
          loadRow: () =>
            new Promise(() => {
              /* never resolves */
            }),
        },
      ),
    ).rejects.toThrow(/timed out after 1000ms/);

    const sanitized = sanitizeM56E4Stage3ErrorMessage(
      `boom ${SERVICE_KEY} eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig`,
    );
    expect(sanitized).not.toContain(SERVICE_KEY);
    expect(sanitized).toContain("[redacted-jwt]");
    // Mismatch errors must never embed the token value.
    expect(
      sanitizeM56E4Stage3ErrorMessage(
        "request lease_claim_token does not match expected claim token.",
      ),
    ).not.toContain(TOKEN);
  });

  it("withTimeout rejects after the deadline", async () => {
    await expect(
      withTimeout(
        new Promise(() => {
          /* hang */
        }),
        20,
        "unit",
      ),
    ).rejects.toThrow(/unit timed out after 20ms/);
  });
});
