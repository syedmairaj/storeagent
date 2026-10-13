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

const ORG = "a4510000-0000-4000-8000-000000000001";
const ORG_B = "b4510000-0000-4000-8000-000000000001";
const STORE = "a4510000-0000-4000-8000-000000000002";
const STORE_B = "b4510000-0000-4000-8000-000000000002";
const LOCATION = "a4510000-0000-4000-8000-000000000003";
const PRODUCT = "a4510000-0000-4000-8000-000000000004";
const VARIANT = "a4510000-0000-4000-8000-000000000005";
const VARIANT_B = "a4510000-0000-4000-8000-000000000006";

const NEGATIVE_KEY = buildDataQualityIssueKey({
  issueCode: "NEGATIVE_INVENTORY",
  subject: {
    kind: "location_variant",
    locationId: LOCATION,
    variantId: VARIANT,
  },
});

const OTHER_KEY = buildDataQualityIssueKey({
  issueCode: "NEGATIVE_INVENTORY",
  subject: {
    kind: "location_variant",
    locationId: LOCATION,
    variantId: VARIANT_B,
  },
});

type PersistRow = {
  disposition: string;
  issueId: string;
  occurrenceCount: number;
  severity: string;
  detectedAt: string;
  lastDetectedAt: string;
};

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

function persistSql(options: {
  organizationId?: string;
  storeId?: string | null;
  locationId?: string | null;
  variantId?: string | null;
  issueCode?: string;
  issueKey?: string;
  severity?: string;
  message?: string;
  detectedAt?: string;
  subjectVariantId?: string;
  sourceContext?: string;
}): string {
  const organizationId = options.organizationId ?? ORG;
  const storeId = options.storeId === undefined ? STORE : options.storeId;
  const locationId =
    options.locationId === undefined ? LOCATION : options.locationId;
  const variantId =
    options.variantId === undefined ? VARIANT : options.variantId;
  const subjectVariantId = options.subjectVariantId ?? variantId;
  const issueCode = options.issueCode ?? "NEGATIVE_INVENTORY";
  const issueKey =
    options.issueKey ??
    buildDataQualityIssueKey({
      issueCode,
      subject: {
        kind: "location_variant",
        locationId: LOCATION,
        variantId: subjectVariantId ?? VARIANT,
      },
    });
  const sourceContext =
    options.sourceContext ??
    '{"provenance":"negative_inventory_observation","quantityField":"on_hand","observedQuantity":-2}';

  return `
    select
      disposition || '|' ||
      issue_id::text || '|' ||
      occurrence_count::text || '|' ||
      severity || '|' ||
      detected_at::text || '|' ||
      last_detected_at::text
    from public.persist_data_quality_issue(
      '${organizationId}'::uuid,
      ${storeId === null ? "null" : `'${storeId}'::uuid`},
      ${locationId === null ? "null" : `'${locationId}'::uuid`},
      ${variantId === null ? "null" : `'${variantId}'::uuid`},
      '${issueCode}',
      $issue_key$${issueKey}$issue_key$,
      '${options.severity ?? "high"}',
      $message$${options.message ?? "Observed inventory quantity is negative."}$message$,
      'Correct the observed inventory quantity before using it for recommendations.',
      '${sourceContext}'::jsonb,
      '${options.detectedAt ?? "2026-10-13T00:00:00Z"}'::timestamptz,
      'location_variant',
      null,
      '${LOCATION}',
      '${subjectVariantId}',
      null,
      null,
      null,
      null
    );
  `;
}

function parseRow(value: string): PersistRow {
  const [
    disposition,
    issueId,
    occurrenceCount,
    severity,
    detectedAt,
    lastDetectedAt,
  ] = value.split("|");

  return {
    disposition: disposition ?? "",
    issueId: issueId ?? "",
    occurrenceCount: Number(occurrenceCount),
    severity: severity ?? "",
    detectedAt: detectedAt ?? "",
    lastDetectedAt: lastDetectedAt ?? "",
  };
}

async function openCount(issueKey: string): Promise<number> {
  const count = await psql(`
    select count(*)
    from public.data_quality_issues
    where organization_id = '${ORG}'
      and issue_key = $issue_key$${issueKey}$issue_key$
      and status = 'open';
  `);

  return Number(count);
}

describeLive("M4.5 data quality issue persistence", () => {
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
        ('${ORG}', 'M4.5 Org A', 'USD', 'UTC'),
        ('${ORG_B}', 'M4.5 Org B', 'USD', 'UTC');

      insert into public.stores (
        id, organization_id, name, status, currency, timezone
      ) values
        ('${STORE}', '${ORG}', 'Store A', 'active', 'USD', 'UTC'),
        ('${STORE_B}', '${ORG_B}', 'Store B', 'active', 'USD', 'UTC');

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
      ) values
        (
          '${VARIANT}', '${ORG}', '${STORE}', '${PRODUCT}', 'SKU-A', 'active'
        ),
        (
          '${VARIANT_B}', '${ORG}', '${STORE}', '${PRODUCT}', 'SKU-B', 'active'
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

  it("creates, reconciles, and isolates durable issues", async () => {
    const created = parseRow(
      await psql(
        persistSql({
          detectedAt: "2026-10-13T00:00:00Z",
          severity: "high",
        }),
      ),
    );

    expect(created.disposition).toBe("created");
    expect(created.occurrenceCount).toBe(1);
    expect(created.severity).toBe("high");

    const reconciled = parseRow(
      await psql(
        persistSql({
          detectedAt: "2026-10-14T00:00:00Z",
          severity: "info",
          message: "Observed inventory quantity is still negative.",
        }),
      ),
    );

    expect(reconciled).toMatchObject({
      disposition: "reconciled",
      issueId: created.issueId,
      occurrenceCount: 2,
      severity: "high",
    });
    expect(reconciled.detectedAt).toBe(created.detectedAt);
    expect(
      Date.parse(reconciled.lastDetectedAt),
    ).toBeGreaterThan(Date.parse(created.lastDetectedAt));

    const upgraded = parseRow(
      await psql(
        persistSql({
          detectedAt: "2026-10-12T00:00:00Z",
          severity: "critical",
        }),
      ),
    );

    expect(upgraded.severity).toBe("critical");
    expect(upgraded.occurrenceCount).toBe(3);
    expect(upgraded.detectedAt).toBe(created.detectedAt);
    expect(upgraded.lastDetectedAt).toBe(reconciled.lastDetectedAt);

    const otherOrgKey = buildDataQualityIssueKey({
      issueCode: "ORG_SETUP",
      subject: { kind: "organization" },
    });
    const otherOrg = parseRow(
      await psql(`
        select
          disposition || '|' || issue_id::text || '|' ||
          occurrence_count::text || '|' || severity || '|' ||
          detected_at::text || '|' || last_detected_at::text
        from public.persist_data_quality_issue(
          '${ORG_B}'::uuid,
          null,
          null,
          null,
          'ORG_SETUP',
          $issue_key$${otherOrgKey}$issue_key$,
          'info',
          'Organization setup is incomplete.',
          null,
          '{"provenance":"negative_inventory_observation","quantityField":"available","observedQuantity":-1}'::jsonb,
          '2026-10-13T00:00:00Z'::timestamptz,
          'organization',
          null,
          null,
          null,
          null,
          null,
          null,
          null
        );
      `),
    );

    expect(otherOrg.disposition).toBe("created");
    expect(otherOrg.issueId).not.toBe(created.issueId);

    const otherKey = parseRow(
      await psql(
        persistSql({
          variantId: VARIANT_B,
          subjectVariantId: VARIANT_B,
          issueKey: OTHER_KEY,
        }),
      ),
    );

    expect(otherKey.issueId).not.toBe(created.issueId);
    expect(await openCount(NEGATIVE_KEY)).toBe(1);
    expect(await openCount(OTHER_KEY)).toBe(1);
  });

  it("keeps resolved history immutable and blocks ignored or superseded recurrence", async () => {
    const resolvedKey = buildDataQualityIssueKey({
      issueCode: "RESOLVED_CASE",
      subject: {
        kind: "variant",
        variantId: VARIANT,
      },
    });

    const created = parseRow(
      await psql(`
        select
          disposition || '|' || issue_id::text || '|' ||
          occurrence_count::text || '|' || severity || '|' ||
          detected_at::text || '|' || last_detected_at::text
        from public.persist_data_quality_issue(
          '${ORG}'::uuid,
          '${STORE}'::uuid,
          null,
          '${VARIANT}'::uuid,
          'RESOLVED_CASE',
          $issue_key$${resolvedKey}$issue_key$,
          'low',
          'Observed inventory quantity is negative.',
          null,
          '{"provenance":"negative_inventory_observation","quantityField":"committed","observedQuantity":-4}'::jsonb,
          '2026-10-01T00:00:00Z'::timestamptz,
          'variant',
          null,
          null,
          '${VARIANT}',
          null,
          null,
          null,
          null
        );
      `),
    );

    await psql(`
      update public.data_quality_issues
      set status = 'resolved', resolved_at = '2026-10-02T00:00:00Z'
      where id = '${created.issueId}';
    `);

    const recurrence = parseRow(
      await psql(`
        select
          disposition || '|' || issue_id::text || '|' ||
          occurrence_count::text || '|' || severity || '|' ||
          detected_at::text || '|' || last_detected_at::text
        from public.persist_data_quality_issue(
          '${ORG}'::uuid,
          '${STORE}'::uuid,
          null,
          '${VARIANT}'::uuid,
          'RESOLVED_CASE',
          $issue_key$${resolvedKey}$issue_key$,
          'medium',
          'Observed inventory quantity is negative.',
          null,
          '{"provenance":"negative_inventory_observation","quantityField":"committed","observedQuantity":-4}'::jsonb,
          '2026-10-03T00:00:00Z'::timestamptz,
          'variant',
          null,
          null,
          '${VARIANT}',
          null,
          null,
          null,
          null
        );
      `),
    );

    expect(recurrence.disposition).toBe("created");
    expect(recurrence.issueId).not.toBe(created.issueId);

    const resolvedStatus = await psql(`
      select status || '|' || (resolved_at is not null)::text
      from public.data_quality_issues
      where id = '${created.issueId}';
    `);

    expect(resolvedStatus).toBe("resolved|true");

    await psql(`
      update public.data_quality_issues
      set status = 'ignored', resolved_at = null
      where id = '${recurrence.issueId}';
    `);

    await expect(
      psql(`
        select issue_id
        from public.persist_data_quality_issue(
          '${ORG}'::uuid,
          '${STORE}'::uuid,
          null,
          '${VARIANT}'::uuid,
          'RESOLVED_CASE',
          $issue_key$${resolvedKey}$issue_key$,
          'high',
          'Observed inventory quantity is negative.',
          null,
          '{"provenance":"negative_inventory_observation","quantityField":"committed","observedQuantity":-4}'::jsonb,
          '2026-10-04T00:00:00Z'::timestamptz,
          'variant',
          null,
          null,
          '${VARIANT}',
          null,
          null,
          null,
          null
        );
      `),
    ).rejects.toThrow(/SA003|ignored history/);

    const ignoredStatus = await psql(`
      select status
      from public.data_quality_issues
      where id = '${recurrence.issueId}';
    `);

    expect(ignoredStatus).toBe("ignored");
    expect(
      await psql(`
        select count(*)
        from public.data_quality_issues
        where organization_id = '${ORG}'
          and issue_key = $issue_key$${resolvedKey}$issue_key$
          and status = 'open';
      `),
    ).toBe("0");

    await psql(`
      update public.data_quality_issues
      set status = 'superseded'
      where id = '${recurrence.issueId}';
    `);

    await expect(
      psql(`
        select issue_id
        from public.persist_data_quality_issue(
          '${ORG}'::uuid,
          '${STORE}'::uuid,
          null,
          '${VARIANT}'::uuid,
          'RESOLVED_CASE',
          $issue_key$${resolvedKey}$issue_key$,
          'high',
          'Observed inventory quantity is negative.',
          null,
          '{"provenance":"negative_inventory_observation","quantityField":"committed","observedQuantity":-4}'::jsonb,
          '2026-10-05T00:00:00Z'::timestamptz,
          'variant',
          null,
          null,
          '${VARIANT}',
          null,
          null,
          null,
          null
        );
      `),
    ).rejects.toThrow(/SA004|superseded history/);

    expect(
      await psql(`
        select status
        from public.data_quality_issues
        where id = '${recurrence.issueId}';
      `),
    ).toBe("superseded");
  });

  it("fails closed on cross-org ownership and subject mismatch", async () => {
    await expect(
      psql(
        persistSql({
          storeId: STORE_B,
        }),
      ),
    ).rejects.toThrow(/canonical ownership is invalid/);

    await expect(
      psql(
        persistSql({
          variantId: VARIANT_B,
          subjectVariantId: VARIANT,
        }),
      ),
    ).rejects.toThrow(/canonical scope is invalid/);
  });

  it("converges concurrent detections and keeps unrelated keys independent", async () => {
    const concurrentKey = buildDataQualityIssueKey({
      issueCode: "CONCURRENT_CASE",
      subject: {
        kind: "variant",
        variantId: VARIANT,
      },
    });
    const unrelatedKey = buildDataQualityIssueKey({
      issueCode: "CONCURRENT_OTHER",
      subject: {
        kind: "variant",
        variantId: VARIANT_B,
      },
    });

    const concurrentSql = `
      select disposition
      from public.persist_data_quality_issue(
        '${ORG}'::uuid,
        '${STORE}'::uuid,
        null,
        '${VARIANT}'::uuid,
        'CONCURRENT_CASE',
        $issue_key$${concurrentKey}$issue_key$,
        'medium',
        'Observed inventory quantity is negative.',
        null,
        '{"provenance":"negative_inventory_observation","quantityField":"incoming","observedQuantity":-7}'::jsonb,
        '2026-10-13T01:00:00Z'::timestamptz,
        'variant',
        null,
        null,
        '${VARIANT}',
        null,
        null,
        null,
        null
      );
    `;
    const unrelatedSql = `
      select disposition
      from public.persist_data_quality_issue(
        '${ORG}'::uuid,
        '${STORE}'::uuid,
        null,
        '${VARIANT_B}'::uuid,
        'CONCURRENT_OTHER',
        $issue_key$${unrelatedKey}$issue_key$,
        'medium',
        'Observed inventory quantity is negative.',
        null,
        '{"provenance":"negative_inventory_observation","quantityField":"incoming","observedQuantity":-7}'::jsonb,
        '2026-10-13T01:00:00Z'::timestamptz,
        'variant',
        null,
        null,
        '${VARIANT_B}',
        null,
        null,
        null,
        null
      );
    `;

    const [sameKey, otherKey] = await Promise.all([
      Promise.all(
        Array.from({ length: 20 }, () => psql(concurrentSql)),
      ),
      Promise.all(
        Array.from({ length: 8 }, () => psql(unrelatedSql)),
      ),
    ]);

    expect(sameKey.filter((value) => value === "created")).toHaveLength(1);
    expect(sameKey.filter((value) => value === "reconciled")).toHaveLength(19);
    expect(otherKey.filter((value) => value === "created")).toHaveLength(1);
    expect(otherKey.filter((value) => value === "reconciled")).toHaveLength(7);

    expect(
      await psql(`
        select count(*)::text || '|' || max(occurrence_count)::text
        from public.data_quality_issues
        where organization_id = '${ORG}'
          and issue_key = $issue_key$${concurrentKey}$issue_key$
          and status = 'open';
      `),
    ).toBe("1|20");

    expect(
      await psql(`
        select count(*)::text || '|' || max(occurrence_count)::text
        from public.data_quality_issues
        where organization_id = '${ORG}'
          and issue_key = $issue_key$${unrelatedKey}$issue_key$
          and status = 'open';
      `),
    ).toBe("1|8");
  });
});
