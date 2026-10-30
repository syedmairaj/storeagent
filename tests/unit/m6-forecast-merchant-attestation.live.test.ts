import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { holdOrdersLiveLock } from "../support/orders-live-lock";

vi.mock("server-only", () => ({}));

const execFileAsync = promisify(execFile);
const LIVE = process.env.RUN_SUPABASE_LIVE === "1";
const describeLive = LIVE ? describe : describe.skip;

const ORG = "61003000-0000-4000-8000-000000000001";
const STORE = "61003000-0000-4000-8000-000000000002";
const FOREIGN_STORE = "61003000-0000-4000-8000-000000000012";
const OWNER = "61003000-0000-4000-8000-000000000007";
const ANALYST = "61003000-0000-4000-8000-000000000008";

function assertLocalSupabaseApiUrl(url: string): void {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    throw new Error(
      "Live suite requires a local Supabase API URL; received unparseable value.",
    );
  }

  const host = parsed.hostname;
  const local = host === "127.0.0.1" || host === "localhost";

  if (!local || parsed.protocol !== "http:") {
    throw new Error(
      `Live suite refuses non-local Supabase API URL host "${host}" (protocol ${parsed.protocol}).`,
    );
  }
}

async function psql(sql: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "psql",
    [
      "-h",
      "127.0.0.1",
      "-p",
      "55322",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-t",
      "-A",
      "-c",
      sql,
    ],
    {
      env: {
        ...process.env,
        PGPASSWORD: "postgres",
      },
    },
  );

  return stdout.trim();
}

async function ensureOwnedFixtures(): Promise<void> {
  await psql(`
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data
    ) values
    ('${OWNER}', '00000000-0000-0000-0000-000000000000', 'authenticated',
     'authenticated', 'm6-attest-owner@example.invalid', '', now(), now(), now(),
     '{}', '{}'),
    ('${ANALYST}', '00000000-0000-0000-0000-000000000000', 'authenticated',
     'authenticated', 'm6-attest-analyst@example.invalid', '', now(), now(), now(),
     '{}', '{}')
    on conflict (id) do nothing;

    insert into public.organizations (id, name, default_currency, timezone)
    values ('${ORG}', 'M6 Attest Org', 'USD', 'UTC')
    on conflict (id) do nothing;

    insert into public.organization_members (organization_id, user_id, role)
    values
      ('${ORG}', '${OWNER}', 'owner'),
      ('${ORG}', '${ANALYST}', 'analyst')
    on conflict do nothing;

    insert into public.stores (
      id, organization_id, name, status, currency, timezone
    ) values
      ('${STORE}', '${ORG}', 'Attest Store', 'active', 'USD', 'UTC'),
      ('${FOREIGN_STORE}', '${ORG}', 'Foreign Attest Store', 'active', 'USD', 'UTC')
    on conflict (id) do nothing;
  `);
}

describeLive("M6 P2b.2c.1 merchant attestation live", () => {
  let releaseOrdersLock: (() => Promise<void>) | undefined;
  const runStamp = Date.now();
  const runId = `attest-${runStamp}`;
  const promoDate = new Date(Date.UTC(2026, 0, 1 + (runStamp % 300)))
    .toISOString()
    .slice(0, 10);
  const coverageDate = new Date(
    Date.UTC(2026, 0, 1 + ((runStamp + 17) % 300)),
  )
    .toISOString()
    .slice(0, 10);

  beforeAll(async () => {
    const apiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    assertLocalSupabaseApiUrl(apiUrl);

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error(
        "Live suite requires SUPABASE_SERVICE_ROLE_KEY for the local instance.",
      );
    }

    releaseOrdersLock = await holdOrdersLiveLock();
    await ensureOwnedFixtures();
  });

  afterAll(async () => {
    await releaseOrdersLock?.();
  });

  it("denies analyst and forged session actor before RPC", async () => {
    const { createSupabaseAdminClient } = await import(
      "@/lib/supabase/admin"
    );
    const { createForecastEvidencePersistence } = await import(
      "@/lib/persistence/forecast-evidence"
    );
    const {
      createMerchantForecastAttestation,
    } = await import("@/lib/forecasting/merchant-attestation");
    const { ForecastEvidenceDeniedError } = await import(
      "@/lib/persistence/forecast-evidence"
    );

    const persistence = createForecastEvidencePersistence(
      createSupabaseAdminClient(),
    );

    expect(() =>
      createMerchantForecastAttestation(
        { userId: ANALYST, email: null },
        {
          userId: ANALYST,
          organizationId: ORG,
          role: "analyst",
          storeId: STORE,
        },
        persistence,
      ),
    ).toThrow(/owner or admin/);

    expect(() =>
      createMerchantForecastAttestation(
        { userId: "61003000-0000-4000-8000-000000000099", email: null },
        {
          userId: OWNER,
          organizationId: ORG,
          role: "owner",
          storeId: STORE,
        },
        persistence,
      ),
    ).toThrow(ForecastEvidenceDeniedError);
  });

  it("attests promotion + per-stream complete with confirmation; replays and conflicts", async () => {
    const { createSupabaseAdminClient } = await import(
      "@/lib/supabase/admin"
    );
    const {
      createForecastEvidencePersistence,
      ForecastEvidenceConflictError,
      ForecastEvidenceDeniedError,
    } = await import("@/lib/persistence/forecast-evidence");
    const { createMerchantForecastAttestation } = await import(
      "@/lib/forecasting/merchant-attestation"
    );

    const persistence = createForecastEvidencePersistence(
      createSupabaseAdminClient(),
    );
    const boundary = createMerchantForecastAttestation(
      { userId: OWNER, email: null },
      {
        userId: OWNER,
        organizationId: ORG,
        role: "owner",
        storeId: STORE,
      },
      persistence,
    );

    const promo = await boundary.attestPromotion({
      localDate: promoDate,
      state: "none",
      observedAt: "2026-07-02T00:00:00.000Z",
      idempotencyKey: `${runId}-promo`,
    });

    expect(promo.disposition).toBe("created");
    expect(promo.trust).toBe("verified_merchant_attestation");

    const promoReplay = await boundary.attestPromotion({
      localDate: promoDate,
      state: "none",
      observedAt: "2026-07-02T00:00:00.000Z",
      idempotencyKey: `${runId}-promo`,
    });
    expect(promoReplay).toEqual({
      ...promo,
      disposition: "replayed",
    });

    await expect(
      boundary.attestPromotion({
        localDate: promoDate,
        state: "promotion",
        observedAt: "2026-07-02T00:00:00.000Z",
        idempotencyKey: `${runId}-promo`,
      }),
    ).rejects.toBeInstanceOf(ForecastEvidenceConflictError);

    await expect(
      boundary.attestCoverage({
        localDate: coverageDate,
        stream: "orders",
        coverage: "complete",
        observedAt: "2026-07-02T00:00:00.000Z",
        asOf: "2026-07-02T00:00:00.000Z",
        idempotencyKey: `${runId}-orders-incomplete`,
      }),
    ).rejects.toBeInstanceOf(ForecastEvidenceDeniedError);

    const ordersComplete = await boundary.attestCoverage({
      localDate: coverageDate,
      stream: "orders",
      coverage: "complete",
      observedAt: "2026-07-02T00:00:00.000Z",
      asOf: "2026-07-02T00:00:00.000Z",
      idempotencyKey: `${runId}-orders-complete`,
      confirmDayStreamClosed: true,
    });

    expect(ordersComplete.disposition).toBe("created");
    expect(ordersComplete.coverage).toBe("complete");
    expect(ordersComplete.trust).toBe("verified_merchant_attestation");
    expect(ordersComplete.closureId).toMatch(/^merchant_day_stream_closure:/);

    const returnsComplete = await boundary.attestCoverage({
      localDate: coverageDate,
      stream: "returns",
      coverage: "complete",
      observedAt: "2026-07-02T00:00:00.000Z",
      asOf: "2026-07-02T00:00:00.000Z",
      idempotencyKey: `${runId}-returns-complete`,
      confirmDayStreamClosed: true,
    });
    expect(returnsComplete.coverage).toBe("complete");
    expect(returnsComplete.closureId).toMatch(/^merchant_day_stream_closure:/);

    const invalidated = await boundary.invalidateCoverage({
      evidenceId: ordersComplete.evidenceId,
      invalidatedAt: "2026-07-03T00:00:00.000Z",
      lateEventObservedAt: "2026-07-03T00:00:00.000Z",
    });
    expect(invalidated.disposition).toBe("invalidated");
    expect(Date.parse(invalidated.invalidatedAt)).toBe(
      Date.parse("2026-07-03T00:00:00.000Z"),
    );
  });

  it("isolates foreign store narrowing from the bound tenant store", async () => {
    const { createSupabaseAdminClient } = await import(
      "@/lib/supabase/admin"
    );
    const {
      createForecastEvidencePersistence,
      ForecastEvidenceDeniedError,
    } = await import("@/lib/persistence/forecast-evidence");
    const { createMerchantForecastAttestation } = await import(
      "@/lib/forecasting/merchant-attestation"
    );

    const boundary = createMerchantForecastAttestation(
      { userId: OWNER, email: null },
      {
        userId: OWNER,
        organizationId: ORG,
        role: "owner",
        storeId: STORE,
      },
      createForecastEvidencePersistence(createSupabaseAdminClient()),
    );

    await expect(
      boundary.attestPromotion({
        localDate: promoDate,
        state: "none",
        observedAt: "2026-07-02T00:00:00.000Z",
        idempotencyKey: `${runId}-foreign-narrow`,
        narrowing: {
          authorizedStoreId: FOREIGN_STORE,
          locationId: "61003000-0000-4000-8000-000000000099",
        },
      }),
    ).rejects.toBeInstanceOf(ForecastEvidenceDeniedError);
  });
});
