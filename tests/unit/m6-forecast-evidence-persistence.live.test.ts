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

const ORG = "61002000-0000-4000-8000-000000000001";
const STORE = "61002000-0000-4000-8000-000000000002";
const INTEGRATION = "61002000-0000-4000-8000-000000000006";
const OWNER = "61002000-0000-4000-8000-000000000007";
const ANALYST = "61002000-0000-4000-8000-000000000008";

function assertLocalSupabaseApiUrl(url: string): void {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    throw new Error(
      `Live suite requires a local Supabase API URL; received unparseable value.`,
    );
  }

  const host = parsed.hostname;
  const local =
    host === "127.0.0.1" || host === "localhost";

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

/**
 * Evidence tables are append-only (DELETE blocked by trigger). Parent
 * rows stay because evidence FKs are ON DELETE RESTRICT. Fixtures use
 * suite-owned UUIDs and are upserted; local db reset owns final wipe.
 */
async function ensureOwnedFixtures(): Promise<void> {
  await psql(`
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data
    ) values
    ('${OWNER}', '00000000-0000-0000-0000-000000000000', 'authenticated',
     'authenticated', 'm6-persist-owner@example.invalid', '', now(), now(), now(),
     '{}', '{}'),
    ('${ANALYST}', '00000000-0000-0000-0000-000000000000', 'authenticated',
     'authenticated', 'm6-persist-analyst@example.invalid', '', now(), now(), now(),
     '{}', '{}')
    on conflict (id) do nothing;

    insert into public.organizations (id, name, default_currency, timezone)
    values ('${ORG}', 'M6 Persist Org', 'USD', 'UTC')
    on conflict (id) do nothing;

    insert into public.organization_members (organization_id, user_id, role)
    values
      ('${ORG}', '${OWNER}', 'owner'),
      ('${ORG}', '${ANALYST}', 'analyst')
    on conflict do nothing;

    insert into public.stores (
      id, organization_id, name, status, currency, timezone
    ) values (
      '${STORE}', '${ORG}', 'Persist Store', 'active', 'USD', 'UTC'
    ) on conflict (id) do nothing;

    insert into public.integrations (
      id, organization_id, store_id, provider, status
    ) values (
      '${INTEGRATION}', '${ORG}', '${STORE}', 'csv', 'active'
    ) on conflict (id) do nothing;
  `);
}

describeLive("M6 P2b.2b.3 forecast evidence persistence live", () => {
  let releaseOrdersLock: (() => Promise<void>) | undefined;
  const runStamp = Date.now();
  const runId = `live-${runStamp}`;
  // Unique calendar days so re-runs avoid active-grain uniqueness collisions.
  const coverageLocalDate = new Date(
    Date.UTC(2026, 0, 1 + (runStamp % 300)),
  )
    .toISOString()
    .slice(0, 10);
  const promoLocalDate = new Date(
    Date.UTC(2026, 0, 1 + ((runStamp + 50) % 300)),
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
    // Evidence is append-only; suite-owned parents stay for FK RESTRICT.
    // Local db reset owns final wipe of disposable fixtures.
    await releaseOrdersLock?.();
  });

  it("persists provider partial, rejects provider complete, and replays", async () => {
    const { createSupabaseAdminClient } = await import(
      "@/lib/supabase/admin"
    );
    const {
      createForecastEvidencePersistence,
      ForecastEvidenceConflictError,
      ForecastEvidenceDeniedError,
    } = await import("@/lib/persistence/forecast-evidence");

    const persistence = createForecastEvidencePersistence(
      createSupabaseAdminClient(),
    );

    const provider = {
      organizationId: ORG,
      storeId: STORE,
      integrationId: INTEGRATION,
      provider: "csv",
    };

    const localDate = coverageLocalDate;
    const observedAt = "2026-07-02T00:00:00.000Z";
    const asOf = "2026-07-02T00:00:00.000Z";
    const idempotencyKey = `${runId}-partial`;

    await expect(
      persistence.issueTrustedProviderCoverage(provider, {
        localDate,
        stream: "orders",
        coverage: "complete",
        observedAt,
        asOf,
        idempotencyKey: `${runId}-complete-denied`,
      }),
    ).rejects.toBeInstanceOf(ForecastEvidenceDeniedError);

    const created = await persistence.issueTrustedProviderCoverage(
      provider,
      {
        localDate,
        stream: "orders",
        coverage: "partial",
        observedAt,
        asOf,
        idempotencyKey,
      },
    );

    expect(created.disposition).toBe("created");
    expect(created.trust).toBe("trusted_provider");
    expect(created.coverage).toBe("partial");
    expect(created.closureId).toBeNull();
    expect(created.evidenceId.length).toBeGreaterThan(0);
    expect(created.version).toBe(1);

    const replayed = await persistence.issueTrustedProviderCoverage(
      provider,
      {
        localDate,
        stream: "orders",
        coverage: "partial",
        observedAt,
        asOf,
        idempotencyKey,
      },
    );

    expect(replayed).toEqual({
      ...created,
      disposition: "replayed",
    });

    await expect(
      persistence.issueTrustedProviderCoverage(provider, {
        localDate,
        stream: "orders",
        coverage: "partial",
        observedAt: "2026-07-02T01:00:00.000Z",
        asOf,
        idempotencyKey,
      }),
    ).rejects.toBeInstanceOf(ForecastEvidenceConflictError);

    const invalidateAt = "2026-07-02T12:00:00.000Z";
    const invalidated = await persistence.invalidateCoverageWithProvider(
      provider,
      {
        evidenceId: created.evidenceId,
        invalidatedAt: invalidateAt,
        lateEventObservedAt: invalidateAt,
      },
    );

    expect(invalidated.evidenceId).toBe(created.evidenceId);
    expect(invalidated.disposition).toBe("invalidated");
    // PostgREST may serialize timestamptz as +00:00 rather than .000Z.
    expect(Date.parse(invalidated.invalidatedAt)).toBe(
      Date.parse(invalidateAt),
    );

    const invalidatedAtDb = await psql(`
      select invalidated_at is not null
      from public.forecast_day_coverage_evidence
      where organization_id = '${ORG}'::uuid
        and evidence_id = '${created.evidenceId}'
    `);
    expect(invalidatedAtDb).toBe("t");
  });

  it("rejects analyst merchant attestation against live membership", async () => {
    const { createSupabaseAdminClient } = await import(
      "@/lib/supabase/admin"
    );
    const {
      createForecastEvidencePersistence,
      ForecastEvidenceDeniedError,
    } = await import("@/lib/persistence/forecast-evidence");

    const persistence = createForecastEvidencePersistence(
      createSupabaseAdminClient(),
    );

    await expect(
      persistence.issueMerchantAttestationPromotion(
        {
          userId: ANALYST,
          organizationId: ORG,
          role: "analyst",
          storeId: STORE,
        },
        {
          localDate: promoLocalDate,
          state: "none",
          observedAt: "2026-07-04T00:00:00.000Z",
          idempotencyKey: `${runId}-analyst-denied`,
        },
      ),
    ).rejects.toBeInstanceOf(ForecastEvidenceDeniedError);
  });

  it("persists owner merchant promotion and denies foreign integration", async () => {
    const { createSupabaseAdminClient } = await import(
      "@/lib/supabase/admin"
    );
    const {
      createForecastEvidencePersistence,
      ForecastEvidenceDeniedError,
    } = await import("@/lib/persistence/forecast-evidence");

    const persistence = createForecastEvidencePersistence(
      createSupabaseAdminClient(),
    );

    const created = await persistence.issueMerchantAttestationPromotion(
      {
        userId: OWNER,
        organizationId: ORG,
        role: "owner",
        storeId: STORE,
      },
      {
        localDate: promoLocalDate,
        state: "none",
        observedAt: "2026-07-04T00:00:00.000Z",
        idempotencyKey: `${runId}-owner-promo`,
      },
    );

    expect(created.disposition).toBe("created");
    expect(created.trust).toBe("verified_merchant_attestation");
    expect(created.version).toBe(1);

    await expect(
      persistence.issueTrustedProviderPromotion(
        {
          organizationId: ORG,
          storeId: STORE,
          integrationId: "61002000-0000-4000-8000-000000000099",
          provider: "csv",
        },
        {
          localDate: "2026-07-04",
          state: "none",
          observedAt: "2026-07-05T00:00:00.000Z",
          idempotencyKey: `${runId}-foreign-integration`,
        },
      ),
    ).rejects.toBeInstanceOf(ForecastEvidenceDeniedError);
  });
});
