import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  createForecastEvidencePersistence,
  ForecastEvidenceConflictError,
  ForecastEvidenceDeniedError,
} from "@/lib/persistence/forecast-evidence";

import type { VerifiedProviderIssuanceContext } from "@/lib/forecasting/evidence-issuance";

import type { TenantContext } from "@/lib/tenancy/types";

vi.mock("server-only", () => ({}));

const PROVIDER: VerifiedProviderIssuanceContext = {
  organizationId: "org-a",
  storeId: "store-a",
  integrationId: "int-1",
  provider: "csv",
};

const OWNER: TenantContext = {
  userId: "user-owner",
  organizationId: "org-a",
  role: "owner",
  storeId: "store-a",
};

function rpcClient(
  implementation: (
    rpcName: string,
    args: Record<string, unknown>,
  ) => Promise<{
    data: unknown;
    error: { message: string } | null;
  }>,
) {
  return {
    rpc: vi.fn(implementation),
  };
}

describe("M6 P2b.2b.3 forecast evidence persistence adapter", () => {
  it("issues provider promotion from context and never forwards trust", async () => {
    const client = rpcClient(async (rpcName, args) => {
      expect(rpcName).toBe("issue_trusted_provider_promotion_evidence");
      expect(args).toMatchObject({
        p_organization_id: "org-a",
        p_store_id: "store-a",
        p_integration_id: "int-1",
        p_state: "none",
        p_idempotency_key: "promo-1",
      });
      expect(args).not.toHaveProperty("p_trust");
      expect(args).not.toHaveProperty("p_closure_id");

      return {
        data: [
          {
            evidence_id: "ev_promo",
            disposition: "created",
            trust: "trusted_provider",
            version: 1,
          },
        ],
        error: null,
      };
    });

    const persistence = createForecastEvidencePersistence(client);

    await expect(
      persistence.issueTrustedProviderPromotion(PROVIDER, {
        localDate: "2026-06-15",
        state: "none",
        observedAt: "2026-06-16T00:00:00.000Z",
        idempotencyKey: "promo-1",
      }),
    ).resolves.toEqual({
      evidenceId: "ev_promo",
      disposition: "created",
      trust: "trusted_provider",
      version: 1,
    });
  });

  it("rejects forged payload trust/org overrides and foreign merchant roles", async () => {
    const client = rpcClient(async () => ({
      data: [],
      error: null,
    }));
    const persistence = createForecastEvidencePersistence(client);

    await expect(
      persistence.issueTrustedProviderPromotion(PROVIDER, {
        localDate: "2026-06-15",
        state: "none",
        observedAt: "2026-06-16T00:00:00.000Z",
        idempotencyKey: "x",
        trust: "verified_merchant_attestation",
      } as never),
    ).rejects.toBeInstanceOf(ForecastEvidenceDeniedError);

    await expect(
      persistence.issueMerchantAttestationPromotion(
        { ...OWNER, role: "analyst" },
        {
          localDate: "2026-06-15",
          state: "none",
          observedAt: "2026-06-16T00:00:00.000Z",
          idempotencyKey: "x",
        },
      ),
    ).rejects.toThrow(/owner or admin/);

    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("fail-closes provider complete and requires merchant closure assertion", async () => {
    const client = rpcClient(async () => ({
      data: [],
      error: null,
    }));
    const persistence = createForecastEvidencePersistence(client);

    await expect(
      persistence.issueTrustedProviderCoverage(PROVIDER, {
        localDate: "2026-06-15",
        stream: "orders",
        coverage: "complete",
        observedAt: "2026-06-16T00:00:00.000Z",
        asOf: "2026-06-16T00:00:00.000Z",
        idempotencyKey: "complete-denied",
      }),
    ).rejects.toThrow(/no authoritative day\/stream closure/);

    await expect(
      persistence.issueMerchantAttestationCoverage(OWNER, {
        localDate: "2026-06-15",
        stream: "returns",
        coverage: "complete",
        observedAt: "2026-06-16T00:00:00.000Z",
        asOf: "2026-06-16T00:00:00.000Z",
        idempotencyKey: "m-complete",
      }),
    ).rejects.toThrow(/explicit day\/stream closure/);

    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("maps merchant complete with assert flag and stamps merchant trust only", async () => {
    const client = rpcClient(async (rpcName, args) => {
      expect(rpcName).toBe(
        "issue_merchant_attestation_coverage_evidence",
      );
      expect(args.p_actor_user_id).toBe("user-owner");
      expect(args.p_assert_day_stream_closed).toBe(true);
      expect(args).not.toHaveProperty("p_closure_id");
      expect(args).not.toHaveProperty("p_integration_id");

      return {
        data: [
          {
            evidence_id: "ev_m",
            disposition: "created",
            trust: "verified_merchant_attestation",
            version: 1,
            coverage: "complete",
            closure_id: "merchant_day_stream_closure:ev_m",
          },
        ],
        error: null,
      };
    });

    const persistence = createForecastEvidencePersistence(client);

    await expect(
      persistence.issueMerchantAttestationCoverage(OWNER, {
        localDate: "2026-06-15",
        stream: "returns",
        coverage: "complete",
        observedAt: "2026-06-16T00:00:00.000Z",
        asOf: "2026-06-16T00:00:00.000Z",
        idempotencyKey: "m-complete",
        assertDayStreamClosed: true,
      }),
    ).resolves.toMatchObject({
      trust: "verified_merchant_attestation",
      coverage: "complete",
      disposition: "created",
    });
  });

  it("maps replay vs conflict and denied RPC errors deterministically", async () => {
    const replayClient = rpcClient(async () => ({
      data: [
        {
          evidence_id: "ev_replay",
          disposition: "replayed",
          trust: "trusted_provider",
          version: 1,
        },
      ],
      error: null,
    }));

    await expect(
      createForecastEvidencePersistence(
        replayClient,
      ).issueTrustedProviderPromotion(PROVIDER, {
        localDate: "2026-06-15",
        state: "none",
        observedAt: "2026-06-16T00:00:00.000Z",
        idempotencyKey: "replay",
      }),
    ).resolves.toMatchObject({ disposition: "replayed" });

    const conflictClient = rpcClient(async () => ({
      data: null,
      error: {
        message:
          "duplicate promotion evidence idempotency key has conflicting payload",
      },
    }));

    await expect(
      createForecastEvidencePersistence(
        conflictClient,
      ).issueTrustedProviderPromotion(PROVIDER, {
        localDate: "2026-06-15",
        state: "promotion",
        observedAt: "2026-06-16T00:00:00.000Z",
        idempotencyKey: "replay",
      }),
    ).rejects.toBeInstanceOf(ForecastEvidenceConflictError);

    const deniedClient = rpcClient(async () => ({
      data: null,
      error: {
        message: "forecast evidence actor is not an organization member",
      },
    }));

    await expect(
      createForecastEvidencePersistence(
        deniedClient,
      ).issueMerchantAttestationPromotion(OWNER, {
        localDate: "2026-06-15",
        state: "none",
        observedAt: "2026-06-16T00:00:00.000Z",
        idempotencyKey: "denied",
      }),
    ).rejects.toBeInstanceOf(ForecastEvidenceDeniedError);
  });

  it("invalidates only with context-derived agent identity", async () => {
    const client = rpcClient(async (rpcName, args) => {
      expect(rpcName).toBe(
        "invalidate_forecast_day_coverage_evidence",
      );
      expect(args).toEqual({
        p_organization_id: "org-a",
        p_evidence_id: "ev_cov",
        p_invalidated_at: "2026-06-16T12:00:00.000Z",
        p_late_event_observed_at: "2026-06-16T12:00:00.000Z",
        p_integration_id: "int-1",
        p_actor_user_id: null,
      });

      return {
        data: [
          {
            evidence_id: "ev_cov",
            disposition: "invalidated",
            invalidated_at: "2026-06-16T12:00:00.000Z",
          },
        ],
        error: null,
      };
    });

    await expect(
      createForecastEvidencePersistence(
        client,
      ).invalidateCoverageWithProvider(PROVIDER, {
        evidenceId: "ev_cov",
        invalidatedAt: "2026-06-16T12:00:00.000Z",
        lateEventObservedAt: "2026-06-16T12:00:00.000Z",
      }),
    ).resolves.toEqual({
      evidenceId: "ev_cov",
      disposition: "invalidated",
      invalidatedAt: "2026-06-16T12:00:00.000Z",
    });

    const merchantClient = rpcClient(async (_rpc, args) => {
      expect(args.p_integration_id).toBeNull();
      expect(args.p_actor_user_id).toBe("user-owner");

      return {
        data: [
          {
            evidence_id: "ev_cov",
            disposition: "invalidated",
            invalidated_at: "2026-06-16T12:00:00.000Z",
          },
        ],
        error: null,
      };
    });

    await createForecastEvidencePersistence(
      merchantClient,
    ).invalidateCoverageWithMerchant(OWNER, {
      evidenceId: "ev_cov",
      invalidatedAt: "2026-06-16T12:00:00.000Z",
      lateEventObservedAt: "2026-06-16T12:00:00.000Z",
    });
  });

  it("rejects missing authorization on store-less merchant context", async () => {
    const client = rpcClient(async () => ({
      data: null,
      error: null,
    }));

    await expect(
      createForecastEvidencePersistence(
        client,
      ).invalidateCoverageWithMerchant(
        { ...OWNER, storeId: null },
        {
          evidenceId: "ev_cov",
          invalidatedAt: "2026-06-16T12:00:00.000Z",
          lateEventObservedAt: "2026-06-16T12:00:00.000Z",
        },
      ),
    ).rejects.toBeInstanceOf(ForecastEvidenceDeniedError);

    expect(client.rpc).not.toHaveBeenCalled();
  });
});
