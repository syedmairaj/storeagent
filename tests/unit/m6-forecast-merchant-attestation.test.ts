import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type { AuthenticatedIdentity } from "@/lib/auth/types";

import {
  bindMerchantAttestationTenant,
  createMerchantForecastAttestation,
} from "@/lib/forecasting/merchant-attestation";

import {
  ForecastEvidenceConflictError,
  ForecastEvidenceDeniedError,
  type ForecastEvidencePersistencePort,
} from "@/lib/persistence/forecast-evidence";

import type { TenantContext } from "@/lib/tenancy/types";

vi.mock("server-only", () => ({}));

const IDENTITY: AuthenticatedIdentity = {
  userId: "user-owner",
  email: "owner@example.invalid",
};

const OWNER: TenantContext = {
  userId: "user-owner",
  organizationId: "org-a",
  role: "owner",
  storeId: "store-a",
};

const ADMIN: TenantContext = {
  userId: "user-owner",
  organizationId: "org-a",
  role: "admin",
  storeId: "store-a",
};

function mockPersistence(
  overrides: Partial<ForecastEvidencePersistencePort> = {},
): ForecastEvidencePersistencePort {
  return {
    issueTrustedProviderPromotion: vi.fn(),
    issueMerchantAttestationPromotion: vi.fn(),
    issueTrustedProviderCoverage: vi.fn(),
    issueMerchantAttestationCoverage: vi.fn(),
    invalidateCoverageWithProvider: vi.fn(),
    invalidateCoverageWithMerchant: vi.fn(),
    ...overrides,
  };
}

describe("M6 P2b.2c.1 merchant attestation boundary", () => {
  it("binds session actor and rejects forged session/tenant mismatches", () => {
    expect(bindMerchantAttestationTenant(IDENTITY, OWNER)).toEqual({
      userId: "user-owner",
      organizationId: "org-a",
      role: "owner",
      storeId: "store-a",
    });

    expect(() =>
      bindMerchantAttestationTenant(
        { userId: "forged-actor", email: null },
        OWNER,
      ),
    ).toThrow(ForecastEvidenceDeniedError);

    expect(() =>
      bindMerchantAttestationTenant(IDENTITY, {
        ...OWNER,
        userId: "other-user",
      }),
    ).toThrow(ForecastEvidenceDeniedError);
  });

  it("denies analyst, missing store, and foreign narrowing store", async () => {
    expect(() =>
      bindMerchantAttestationTenant(IDENTITY, {
        ...OWNER,
        role: "analyst",
      }),
    ).toThrow(/owner or admin/);

    expect(() =>
      bindMerchantAttestationTenant(IDENTITY, {
        ...OWNER,
        storeId: null,
      }),
    ).toThrow(/authorized store/);

    const persistence = mockPersistence({
      issueMerchantAttestationPromotion: vi.fn(),
    });
    const boundary = createMerchantForecastAttestation(
      IDENTITY,
      OWNER,
      persistence,
    );

    await expect(
      boundary.attestPromotion({
        localDate: "2026-07-01",
        state: "none",
        observedAt: "2026-07-02T00:00:00.000Z",
        idempotencyKey: "promo-1",
        narrowing: {
          authorizedStoreId: "store-foreign",
          locationId: "loc-1",
        },
      }),
    ).rejects.toBeInstanceOf(ForecastEvidenceDeniedError);

    expect(persistence.issueMerchantAttestationPromotion).not.toHaveBeenCalled();
  });

  it("rejects forged org/actor/trust/closure/trustedCompleteDates command keys", async () => {
    const persistence = mockPersistence();
    const boundary = createMerchantForecastAttestation(
      IDENTITY,
      OWNER,
      persistence,
    );

    await expect(
      boundary.attestPromotion({
        localDate: "2026-07-01",
        state: "none",
        observedAt: "2026-07-02T00:00:00.000Z",
        idempotencyKey: "promo-1",
        organizationId: "org-forged",
      } as never),
    ).rejects.toBeInstanceOf(ForecastEvidenceDeniedError);

    await expect(
      boundary.attestCoverage({
        localDate: "2026-07-01",
        stream: "orders",
        coverage: "partial",
        observedAt: "2026-07-02T00:00:00.000Z",
        asOf: "2026-07-02T00:00:00.000Z",
        idempotencyKey: "cov-1",
        actorUserId: "forged",
      } as never),
    ).rejects.toBeInstanceOf(ForecastEvidenceDeniedError);

    await expect(
      boundary.attestCoverage({
        localDate: "2026-07-01",
        stream: "orders",
        coverage: "complete",
        observedAt: "2026-07-02T00:00:00.000Z",
        asOf: "2026-07-02T00:00:00.000Z",
        idempotencyKey: "cov-2",
        confirmDayStreamClosed: true,
        closureId: "client-closure",
      } as never),
    ).rejects.toBeInstanceOf(ForecastEvidenceDeniedError);

    await expect(
      boundary.attestPromotion({
        localDate: "2026-07-01",
        state: "none",
        observedAt: "2026-07-02T00:00:00.000Z",
        idempotencyKey: "promo-2",
        trustedCompleteDates: ["2026-07-01"],
      } as never),
    ).rejects.toBeInstanceOf(ForecastEvidenceDeniedError);

    await expect(
      boundary.attestPromotion({
        localDate: "2026-07-01",
        state: "none",
        observedAt: "2026-07-02T00:00:00.000Z",
        idempotencyKey: "promo-3",
        discountAmount: "10.00",
      } as never),
    ).rejects.toBeInstanceOf(ForecastEvidenceDeniedError);

    expect(persistence.issueMerchantAttestationPromotion).not.toHaveBeenCalled();
    expect(persistence.issueMerchantAttestationCoverage).not.toHaveBeenCalled();
  });

  it("attests store-day promotion from bound tenant only", async () => {
    const issueMerchantAttestationPromotion = vi.fn(async () => ({
      evidenceId: "ev_promo",
      disposition: "created" as const,
      trust: "verified_merchant_attestation" as const,
      version: 1,
    }));

    const boundary = createMerchantForecastAttestation(
      IDENTITY,
      ADMIN,
      mockPersistence({ issueMerchantAttestationPromotion }),
    );

    await expect(
      boundary.attestPromotion({
        localDate: "2026-07-01",
        state: "none",
        observedAt: "2026-07-02T00:00:00.000Z",
        idempotencyKey: "promo-1",
      }),
    ).resolves.toEqual({
      evidenceId: "ev_promo",
      disposition: "created",
      trust: "verified_merchant_attestation",
      version: 1,
    });

    expect(issueMerchantAttestationPromotion).toHaveBeenCalledWith(
      {
        userId: "user-owner",
        organizationId: "org-a",
        role: "admin",
        storeId: "store-a",
      },
      {
        localDate: "2026-07-01",
        state: "none",
        observedAt: "2026-07-02T00:00:00.000Z",
        idempotencyKey: "promo-1",
        version: undefined,
        supersedesEvidenceId: undefined,
        locationId: null,
        variantId: null,
      },
    );
  });

  it("requires explicit closure confirmation for complete and keeps streams separate", async () => {
    const issueMerchantAttestationCoverage = vi.fn(async (_tenant, request) => ({
      evidenceId: `ev_${request.stream}`,
      disposition: "created" as const,
      trust: "verified_merchant_attestation" as const,
      version: 1,
      coverage: request.coverage,
      closureId:
        request.coverage === "complete" ? "merchant_day_stream_closure:x" : null,
    }));

    const boundary = createMerchantForecastAttestation(
      IDENTITY,
      OWNER,
      mockPersistence({ issueMerchantAttestationCoverage }),
    );

    await expect(
      boundary.attestCoverage({
        localDate: "2026-07-01",
        stream: "orders",
        coverage: "complete",
        observedAt: "2026-07-02T00:00:00.000Z",
        asOf: "2026-07-02T00:00:00.000Z",
        idempotencyKey: "orders-complete",
      }),
    ).rejects.toThrow(/explicit day\/stream closure confirmation/);

    await expect(
      boundary.attestCoverage({
        localDate: "2026-07-01",
        stream: "orders",
        coverage: "partial",
        observedAt: "2026-07-02T00:00:00.000Z",
        asOf: "2026-07-02T00:00:00.000Z",
        idempotencyKey: "orders-partial",
        confirmDayStreamClosed: true,
      }),
    ).rejects.toThrow(/must not confirm/);

    await expect(
      boundary.attestCoverage({
        localDate: "2026-07-01",
        stream: "orders",
        coverage: "complete",
        observedAt: "2026-07-02T00:00:00.000Z",
        asOf: "2026-07-02T00:00:00.000Z",
        idempotencyKey: "orders-complete",
        confirmDayStreamClosed: true,
      }),
    ).resolves.toMatchObject({
      coverage: "complete",
      trust: "verified_merchant_attestation",
    });

    await expect(
      boundary.attestCoverage({
        localDate: "2026-07-01",
        stream: "returns",
        coverage: "complete",
        observedAt: "2026-07-02T00:00:00.000Z",
        asOf: "2026-07-02T00:00:00.000Z",
        idempotencyKey: "returns-complete",
        confirmDayStreamClosed: true,
      }),
    ).resolves.toMatchObject({
      evidenceId: "ev_returns",
      coverage: "complete",
    });

    expect(issueMerchantAttestationCoverage).toHaveBeenCalledWith(
      expect.objectContaining({ storeId: "store-a" }),
      expect.objectContaining({
        stream: "orders",
        coverage: "complete",
        assertDayStreamClosed: true,
        locationId: null,
        variantId: null,
      }),
    );
  });

  it("forwards authorized narrowing and rejects empty narrowing", async () => {
    const issueMerchantAttestationPromotion = vi.fn(async () => ({
      evidenceId: "ev_narrow",
      disposition: "created" as const,
      trust: "verified_merchant_attestation" as const,
      version: 1,
    }));

    const boundary = createMerchantForecastAttestation(
      IDENTITY,
      OWNER,
      mockPersistence({ issueMerchantAttestationPromotion }),
    );

    await expect(
      boundary.attestPromotion({
        localDate: "2026-07-01",
        state: "promotion",
        observedAt: "2026-07-02T00:00:00.000Z",
        idempotencyKey: "narrow-empty",
        narrowing: {
          authorizedStoreId: "store-a",
        },
      }),
    ).rejects.toThrow(/locationId and\/or variantId/);

    await boundary.attestPromotion({
      localDate: "2026-07-01",
      state: "promotion",
      observedAt: "2026-07-02T00:00:00.000Z",
      idempotencyKey: "narrow-ok",
      narrowing: {
        authorizedStoreId: "store-a",
        locationId: "loc-1",
        variantId: "var-1",
      },
    });

    expect(issueMerchantAttestationPromotion).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        locationId: "loc-1",
        variantId: "var-1",
        state: "promotion",
      }),
    );
  });

  it("propagates persistence replay and conflict outcomes", async () => {
    const issueMerchantAttestationPromotion = vi
      .fn()
      .mockResolvedValueOnce({
        evidenceId: "ev_1",
        disposition: "created",
        trust: "verified_merchant_attestation",
        version: 1,
      })
      .mockResolvedValueOnce({
        evidenceId: "ev_1",
        disposition: "replayed",
        trust: "verified_merchant_attestation",
        version: 1,
      })
      .mockRejectedValueOnce(
        new ForecastEvidenceConflictError("conflicting payload"),
      );

    const boundary = createMerchantForecastAttestation(
      IDENTITY,
      OWNER,
      mockPersistence({ issueMerchantAttestationPromotion }),
    );

    const command = {
      localDate: "2026-07-01",
      state: "none" as const,
      observedAt: "2026-07-02T00:00:00.000Z",
      idempotencyKey: "replay-1",
    };

    await expect(boundary.attestPromotion(command)).resolves.toMatchObject({
      disposition: "created",
    });
    await expect(boundary.attestPromotion(command)).resolves.toMatchObject({
      disposition: "replayed",
    });
    await expect(boundary.attestPromotion(command)).rejects.toBeInstanceOf(
      ForecastEvidenceConflictError,
    );
  });

  it("invalidates coverage through the bound merchant actor only", async () => {
    const invalidateCoverageWithMerchant = vi.fn(async () => ({
      evidenceId: "ev_cov",
      disposition: "invalidated" as const,
      invalidatedAt: "2026-07-03T00:00:00.000Z",
    }));

    const boundary = createMerchantForecastAttestation(
      IDENTITY,
      OWNER,
      mockPersistence({ invalidateCoverageWithMerchant }),
    );

    await expect(
      boundary.invalidateCoverage({
        evidenceId: "ev_cov",
        invalidatedAt: "2026-07-03T00:00:00.000Z",
        lateEventObservedAt: "2026-07-03T00:00:00.000Z",
      }),
    ).resolves.toEqual({
      evidenceId: "ev_cov",
      disposition: "invalidated",
      invalidatedAt: "2026-07-03T00:00:00.000Z",
    });

    expect(invalidateCoverageWithMerchant).toHaveBeenCalledWith(
      {
        userId: "user-owner",
        organizationId: "org-a",
        role: "owner",
        storeId: "store-a",
      },
      {
        evidenceId: "ev_cov",
        invalidatedAt: "2026-07-03T00:00:00.000Z",
        lateEventObservedAt: "2026-07-03T00:00:00.000Z",
      },
    );
  });
});
