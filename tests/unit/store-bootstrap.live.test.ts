import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";

/**
 * Local PG verification for first-store bootstrap.
 * Hardcoded isolated local connection only. Never reads hosted DATABASE_URL.
 */

const execFileAsync = promisify(execFile);
const LIVE = process.env.RUN_SUPABASE_LIVE === "1";
const describeLive = LIVE ? describe : describe.skip;

const ORG = "1900a000-0000-4000-8000-000000000001";
const FOREIGN_ORG = "1900a000-0000-4000-8000-000000000011";
const USER_OWNER = "1900a000-0000-4000-8000-000000000007";
const USER_ADMIN = "1900a000-0000-4000-8000-000000000008";
const USER_ANALYST = "1900a000-0000-4000-8000-000000000009";
const USER_FOREIGN = "1900a000-0000-4000-8000-000000000017";
const INSTANCE = "00000000-0000-0000-0000-000000000000";

function quote(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function psqlArgs(): string[] {
  return [
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
    "-q",
    "-t",
    "-A",
  ];
}

function databaseEnv(): NodeJS.ProcessEnv {
  return { ...process.env, PGPASSWORD: "postgres" };
}

async function psql(sql: string): Promise<string> {
  const { stdout } = await execFileAsync("psql", [...psqlArgs(), "-c", sql], {
    env: databaseEnv(),
  });
  return stdout.trim();
}

function asAuthenticated(userId: string, selectList: string, fromRpc: string): string {
  return `
    with setup as (
      select
        set_config('request.jwt.claim.sub', ${quote(userId)}, true) as sub_claim,
        set_config('request.jwt.claim.role', 'authenticated', true) as role_claim
    )
    select ${selectList}
    from setup
    cross join lateral ${fromRpc} as created;
  `;
}

describeLive("M1.9 first-store bootstrap live", () => {
  beforeAll(async () => {
    await psql(`
      insert into auth.users (
        id, instance_id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data
      ) values
        (
          ${quote(USER_OWNER)}, ${quote(INSTANCE)}, 'authenticated', 'authenticated',
          'owner-first-store@example.test', '', now(), now(), now(), '{}', '{}'
        ),
        (
          ${quote(USER_ADMIN)}, ${quote(INSTANCE)}, 'authenticated', 'authenticated',
          'admin-first-store@example.test', '', now(), now(), now(), '{}', '{}'
        ),
        (
          ${quote(USER_ANALYST)}, ${quote(INSTANCE)}, 'authenticated', 'authenticated',
          'analyst-first-store@example.test', '', now(), now(), now(), '{}', '{}'
        ),
        (
          ${quote(USER_FOREIGN)}, ${quote(INSTANCE)}, 'authenticated', 'authenticated',
          'foreign-first-store@example.test', '', now(), now(), now(), '{}', '{}'
        )
      on conflict (id) do nothing;
    `);
  });

  beforeEach(async () => {
    await psql(`
      delete from public.locations
      where organization_id in (${quote(ORG)}, ${quote(FOREIGN_ORG)});
      delete from public.stores
      where organization_id in (${quote(ORG)}, ${quote(FOREIGN_ORG)});
      delete from public.organization_members
      where organization_id in (${quote(ORG)}, ${quote(FOREIGN_ORG)});
      delete from public.organizations
      where id in (${quote(ORG)}, ${quote(FOREIGN_ORG)});

      insert into public.organizations (
        id, name, country_code, default_currency, timezone
      ) values
        (${quote(ORG)}, 'Harbor Goods', 'US', 'USD', 'America/New_York'),
        (${quote(FOREIGN_ORG)}, 'Foreign Co', 'GB', 'GBP', 'Europe/London');

      insert into public.organization_members (organization_id, user_id, role)
      values
        (${quote(ORG)}, ${quote(USER_OWNER)}, 'owner'),
        (${quote(ORG)}, ${quote(USER_ADMIN)}, 'admin'),
        (${quote(ORG)}, ${quote(USER_ANALYST)}, 'analyst'),
        (${quote(FOREIGN_ORG)}, ${quote(USER_FOREIGN)}, 'owner');
    `);
  });

  afterAll(async () => {
    await psql(`
      delete from public.locations
      where organization_id in (${quote(ORG)}, ${quote(FOREIGN_ORG)});
      delete from public.stores
      where organization_id in (${quote(ORG)}, ${quote(FOREIGN_ORG)});
      delete from public.organization_members
      where organization_id in (${quote(ORG)}, ${quote(FOREIGN_ORG)});
      delete from public.organizations
      where id in (${quote(ORG)}, ${quote(FOREIGN_ORG)});
      delete from auth.users
      where id in (
        ${quote(USER_OWNER)},
        ${quote(USER_ADMIN)},
        ${quote(USER_ANALYST)},
        ${quote(USER_FOREIGN)}
      );
    `);
  });

  it("creates the first store with inherited currency and timezone", async () => {
    const created = await psql(
      asAuthenticated(
        USER_OWNER,
        `created.store_id::text || '|' || created.location_id::text || '|' || created.organization_id::text`,
        `public.create_current_user_first_organization_store(
          ${quote(ORG)}::uuid,
          'Harbor Downtown',
          null,
          null
        )`,
      ),
    );

    const [storeId, locationId, organizationId] = created.split("|");
    expect(storeId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(locationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(organizationId).toBe(ORG);

    const store = await psql(`
      select name || '|' || currency || '|' || timezone || '|' || status
      from public.stores
      where id = ${quote(storeId!)}::uuid;
    `);
    expect(store).toBe("Harbor Downtown|USD|America/New_York|active");

    const location = await psql(`
      select name || '|' || status || '|' || store_id::text
      from public.locations
      where id = ${quote(locationId!)}::uuid;
    `);
    expect(location).toBe(`Main|active|${storeId}`);
  });

  it("allows admin create and rejects analyst, foreign org, and duplicates", async () => {
    await psql(
      asAuthenticated(
        USER_ADMIN,
        `created.store_id::text`,
        `public.create_current_user_first_organization_store(
          ${quote(ORG)}::uuid,
          'Admin Store',
          'CAD',
          'America/Toronto'
        )`,
      ),
    );

    await expect(
      psql(
        asAuthenticated(
          USER_OWNER,
          `created.store_id::text`,
          `public.create_current_user_first_organization_store(
            ${quote(ORG)}::uuid,
            'Second Store',
            'USD',
            'UTC'
          )`,
        ),
      ),
    ).rejects.toThrow(/already has a store/i);

    await expect(
      psql(
        asAuthenticated(
          USER_ANALYST,
          `created.store_id::text`,
          `public.create_current_user_first_organization_store(
            ${quote(ORG)}::uuid,
            'Analyst Store',
            'USD',
            'UTC'
          )`,
        ),
      ),
    ).rejects.toThrow(/owner or admin/i);

    await expect(
      psql(
        asAuthenticated(
          USER_OWNER,
          `created.store_id::text`,
          `public.create_current_user_first_organization_store(
            ${quote(FOREIGN_ORG)}::uuid,
            'Cross Org',
            'GBP',
            'Europe/London'
          )`,
        ),
      ),
    ).rejects.toThrow(/membership required/i);
  });

  it("rejects incomplete organization profiles", async () => {
    await psql(`
      update public.organizations
      set country_code = null, default_currency = 'XXX'
      where id = ${quote(ORG)}::uuid;
    `);

    await expect(
      psql(
        asAuthenticated(
          USER_OWNER,
          `created.store_id::text`,
          `public.create_current_user_first_organization_store(
            ${quote(ORG)}::uuid,
            'Too Early',
            'USD',
            'UTC'
          )`,
        ),
      ),
    ).rejects.toThrow(/profile is incomplete/i);
  });

  it("serializes concurrent first-store attempts to a single winner", async () => {
    const race = asAuthenticated(
      USER_OWNER,
      `created.store_id::text`,
      `public.create_current_user_first_organization_store(
        ${quote(ORG)}::uuid,
        'Race Store',
        'USD',
        'UTC'
      )`,
    );

    const results = await Promise.allSettled([
      psql(race),
      psql(race),
      psql(race),
    ]);

    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<string> =>
        result.status === "fulfilled",
    );
    const rejected = results.filter((result) => result.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected.length).toBeGreaterThanOrEqual(1);

    const count = await psql(`
      select count(*)::text
      from public.stores
      where organization_id = ${quote(ORG)}::uuid;
    `);
    expect(count).toBe("1");
  });
});
