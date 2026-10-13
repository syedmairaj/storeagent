import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import { buildDataQualityIssueKey } from "@/lib/data-quality/identity";

const execFileAsync = promisify(execFile);
const LIVE = process.env.RUN_SUPABASE_LIVE === "1";
const describeLive = LIVE ? describe : describe.skip;

const ORG = "a4610000-0000-4000-8000-000000000001";
const ORG_B = "b4610000-0000-4000-8000-000000000001";
const STORE = "a4610000-0000-4000-8000-000000000002";
const LOCATION = "a4610000-0000-4000-8000-000000000003";
const PRODUCT = "a4610000-0000-4000-8000-000000000004";
const VARIANT = "a4610000-0000-4000-8000-000000000005";

const DETECTED_AT = "2026-10-01T00:00:00Z";
const OCCURRED_AT = "2026-10-13T12:34:56Z";

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

function issueKey(issueCode: string): string {
  return buildDataQualityIssueKey({
    issueCode,
    subject: {
      kind: "variant",
      variantId: VARIANT,
    },
  });
}

async function createOpenIssue(issueCode: string): Promise<string> {
  const key = issueKey(issueCode);
  const row = await psql(`
    select issue_id::text
    from public.persist_data_quality_issue(
      '${ORG}'::uuid,
      '${STORE}'::uuid,
      null,
      '${VARIANT}'::uuid,
      '${issueCode}',
      $issue_key$${key}$issue_key$,
      'high',
      'Observed inventory quantity is negative.',
      'Correct the observed inventory quantity before using it for recommendations.',
      '{"provenance":"negative_inventory_observation","quantityField":"on_hand","observedQuantity":-3}'::jsonb,
      '${DETECTED_AT}'::timestamptz,
      'variant',
      null,
      null,
      '${VARIANT}',
      null,
      null,
      null,
      null
    );
  `);

  return row;
}

function transitionSql(
  issueId: string,
  transition: "resolve" | "ignore" | "supersede",
  organizationId = ORG,
  occurredAt = OCCURRED_AT,
): string {
  return `
    select
      issue_id::text || '|' ||
      previous_status || '|' ||
      status || '|' ||
      coalesce(resolved_at::text, 'null')
    from public.transition_data_quality_issue(
      '${organizationId}'::uuid,
      '${issueId}'::uuid,
      '${transition}',
      '${occurredAt}'::timestamptz
    );
  `;
}

async function identity(issueId: string): Promise<string> {
  return psql(`
    select
      organization_id::text || '|' ||
      store_id::text || '|' ||
      coalesce(location_id::text, 'null') || '|' ||
      variant_id::text || '|' ||
      issue_code || '|' ||
      issue_key || '|' ||
      detected_at::text || '|' ||
      occurrence_count::text || '|' ||
      severity || '|' ||
      message
    from public.data_quality_issues
    where id = '${issueId}';
  `);
}

describeLive("M4.6 data quality issue lifecycle", () => {
  beforeAll(async () => {
    await psql(`
      delete from public.data_quality_issues
      where organization_id in ('${ORG}', '${ORG_B}');
      delete from public.product_variants
      where organization_id in ('${ORG}', '${ORG_B}');
      delete from public.products
      where organization_id in ('${ORG}', '${ORG_B}');
      delete from public.locations
      where organization_id in ('${ORG}', '${ORG_B}');
      delete from public.stores
      where organization_id in ('${ORG}', '${ORG_B}');
      delete from public.organizations
      where id in ('${ORG}', '${ORG_B}');

      insert into public.organizations (
        id, name, default_currency, timezone
      ) values
        ('${ORG}', 'M4.6 Org A', 'USD', 'UTC'),
        ('${ORG_B}', 'M4.6 Org B', 'USD', 'UTC');

      insert into public.stores (
        id, organization_id, name, status, currency, timezone
      ) values (
        '${STORE}', '${ORG}', 'Store A', 'active', 'USD', 'UTC'
      );

      insert into public.locations (
        id, organization_id, store_id, name, status
      ) values (
        '${LOCATION}', '${ORG}', '${STORE}', 'Location A', 'active'
      );

      insert into public.products (
        id, organization_id, store_id, title, status
      ) values (
        '${PRODUCT}', '${ORG}', '${STORE}', 'Product A', 'active'
      );

      insert into public.product_variants (
        id, organization_id, store_id, product_id, sku, status
      ) values (
        '${VARIANT}', '${ORG}', '${STORE}', '${PRODUCT}', 'SKU-A', 'active'
      );
    `);
  });

  afterAll(async () => {
    await psql(`
      delete from public.data_quality_issues
      where organization_id in ('${ORG}', '${ORG_B}');
      delete from public.product_variants
      where organization_id in ('${ORG}', '${ORG_B}');
      delete from public.products
      where organization_id in ('${ORG}', '${ORG_B}');
      delete from public.locations
      where organization_id in ('${ORG}', '${ORG_B}');
      delete from public.stores
      where organization_id in ('${ORG}', '${ORG_B}');
      delete from public.organizations
      where id in ('${ORG}', '${ORG_B}');
    `);
  });

  it("resolves, ignores, and supersedes open issues without rewriting identity", async () => {
    const resolvedId = await createOpenIssue("RESOLVE_CASE");
    const beforeResolve = await identity(resolvedId);

    const resolved = await psql(
      transitionSql(resolvedId, "resolve"),
    );

    expect(resolved.startsWith(`${resolvedId}|open|resolved|`)).toBe(
      true,
    );
    expect(
      await psql(`
        select (resolved_at = '${OCCURRED_AT}'::timestamptz)::text
        from public.data_quality_issues
        where id = '${resolvedId}';
      `),
    ).toBe("true");
    expect(await identity(resolvedId)).toBe(beforeResolve);

    const ignoredId = await createOpenIssue("IGNORE_CASE");
    const beforeIgnore = await identity(ignoredId);
    expect(await psql(transitionSql(ignoredId, "ignore"))).toBe(
      `${ignoredId}|open|ignored|null`,
    );
    expect(await identity(ignoredId)).toBe(beforeIgnore);

    const supersededId = await createOpenIssue("SUPERSEDE_CASE");
    const beforeSupersede = await identity(supersededId);
    expect(
      await psql(transitionSql(supersededId, "supersede")),
    ).toBe(`${supersededId}|open|superseded|null`);
    expect(await identity(supersededId)).toBe(beforeSupersede);
  });

  it("rejects an occurred_at earlier than detected_at", async () => {
    const equalId = await createOpenIssue("CHRONOLOGY_EQUAL");
    expect(
      await psql(transitionSql(equalId, "ignore", ORG, DETECTED_AT)),
    ).toBe(`${equalId}|open|ignored|null`);

    const afterId = await createOpenIssue("CHRONOLOGY_AFTER");
    expect(
      await psql(
        transitionSql(afterId, "supersede", ORG, OCCURRED_AT),
      ),
    ).toBe(`${afterId}|open|superseded|null`);

    const earlyId = await createOpenIssue("CHRONOLOGY_BEFORE");
    const before = await identity(earlyId);

    await expect(
      psql(
        transitionSql(
          earlyId,
          "resolve",
          ORG,
          "2026-09-30T00:00:00Z",
        ),
      ),
    ).rejects.toThrow(/SA007|lifecycle timestamp precedes/);

    expect(await identity(earlyId)).toBe(before);
    expect(
      await psql(`
        select status || '|' || (resolved_at is null)::text
        from public.data_quality_issues
        where id = '${earlyId}';
      `),
    ).toBe("open|true");
  });

  it("rejects terminal transitions and cross-org mutation", async () => {
    const resolvedId = await createOpenIssue("TERMINAL_RESOLVED");
    await psql(transitionSql(resolvedId, "resolve"));

    for (const transition of ["resolve", "ignore", "supersede"] as const) {
      await expect(
        psql(transitionSql(resolvedId, transition, ORG, "2026-10-14T00:00:00Z")),
      ).rejects.toThrow(/SA005|lifecycle transition is illegal/);
    }

    expect(
      await psql(`
        select status || '|' || (resolved_at = '${OCCURRED_AT}'::timestamptz)::text
        from public.data_quality_issues
        where id = '${resolvedId}';
      `),
    ).toBe("resolved|true");

    const ignoredId = await createOpenIssue("TERMINAL_IGNORED");
    await psql(transitionSql(ignoredId, "ignore"));
    await expect(
      psql(transitionSql(ignoredId, "resolve")),
    ).rejects.toThrow(/SA005|lifecycle transition is illegal/);
    expect(
      await psql(`
        select status || '|' || (resolved_at is null)::text
        from public.data_quality_issues
        where id = '${ignoredId}';
      `),
    ).toBe("ignored|true");

    const supersededId = await createOpenIssue("TERMINAL_SUPERSEDED");
    await psql(transitionSql(supersededId, "supersede"));
    await expect(
      psql(transitionSql(supersededId, "ignore")),
    ).rejects.toThrow(/SA005|lifecycle transition is illegal/);
    expect(
      await psql(`
        select status
        from public.data_quality_issues
        where id = '${supersededId}';
      `),
    ).toBe("superseded");

    const ownedId = await createOpenIssue("CROSS_ORG");
    const before = await identity(ownedId);
    await expect(
      psql(transitionSql(ownedId, "resolve", ORG_B)),
    ).rejects.toThrow(/SA006|not in the trusted organization/);
    expect(await identity(ownedId)).toBe(before);
  });

  it("keeps service-role execution and denies browser roles", async () => {
    const signature =
      "public.transition_data_quality_issue(uuid,uuid,text,timestamptz)";

    expect(
      await psql(
        `select has_function_privilege('anon', '${signature}', 'execute')::text;`,
      ),
    ).toBe("false");
    expect(
      await psql(
        `select has_function_privilege('authenticated', '${signature}', 'execute')::text;`,
      ),
    ).toBe("false");
    expect(
      await psql(
        `select has_function_privilege('service_role', '${signature}', 'execute')::text;`,
      ),
    ).toBe("true");
  });

  it("serializes concurrent resolves and preserves M4.5 recurrence", async () => {
    const issueId = await createOpenIssue("CONCURRENT_RESOLVE");
    const before = await identity(issueId);
    const calls = await Promise.allSettled(
      Array.from({ length: 12 }, () =>
        psql(transitionSql(issueId, "resolve")),
      ),
    );

    const fulfilled = calls.filter((call) => call.status === "fulfilled");
    const rejected = calls.filter((call) => call.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(11);
    expect(await identity(issueId)).toBe(before);
    expect(
      await psql(`
        select status || '|' || (resolved_at = '${OCCURRED_AT}'::timestamptz)::text
        from public.data_quality_issues
        where id = '${issueId}';
      `),
    ).toBe("resolved|true");

    const recurrenceKey = issueKey("CONCURRENT_RESOLVE");
    const recurrenceId = await psql(`
      select issue_id::text
      from public.persist_data_quality_issue(
        '${ORG}'::uuid,
        '${STORE}'::uuid,
        null,
        '${VARIANT}'::uuid,
        'CONCURRENT_RESOLVE',
        $issue_key$${recurrenceKey}$issue_key$,
        'high',
        'Observed inventory quantity is negative.',
        'Correct the observed inventory quantity before using it for recommendations.',
        '{"provenance":"negative_inventory_observation","quantityField":"on_hand","observedQuantity":-3}'::jsonb,
        '2026-10-20T00:00:00Z'::timestamptz,
        'variant',
        null,
        null,
        '${VARIANT}',
        null,
        null,
        null,
        null
      );
    `);

    expect(recurrenceId).not.toBe(issueId);
    expect(
      await psql(`
        select status
        from public.data_quality_issues
        where id = '${issueId}';
      `),
    ).toBe("resolved");
    expect(
      await psql(`
        select status || '|' || occurrence_count::text
        from public.data_quality_issues
        where id = '${recurrenceId}';
      `),
    ).toBe("open|1");
  });
});
