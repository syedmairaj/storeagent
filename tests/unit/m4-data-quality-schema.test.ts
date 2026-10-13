import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

const ROOT = process.cwd();

const MIGRATION_DIRECTORY =
  path.join(
    ROOT,
    "supabase",
    "migrations",
  );

function migration():
string {
  const matches =
    fs.readdirSync(
      MIGRATION_DIRECTORY,
    ).filter(
      (file) =>
        file.endsWith(
          "_m4_2_data_quality_issues.sql",
        ),
    );

  expect(
    matches,
  ).toHaveLength(
    1,
  );

  return fs.readFileSync(
    path.join(
      MIGRATION_DIRECTORY,
      matches[0],
    ),
    "utf8",
  );
}

function normalized():
string {
  return migration()
    .replace(
      /\s+/g,
      " ",
    )
    .toLowerCase();
}

describe(
  "StoreAgent M4.2 data quality issue schema",
  () => {
    it(
      "creates the data quality issues table",
      () => {
        const tables = [
          ...migration().matchAll(
            /create table public\.([a-z_]+)/gi,
          ),
        ].map(
          (match) =>
            match[1],
        );

        expect(
          tables,
        ).toEqual([
          "data_quality_issues",
        ]);
      },
    );

    it(
      "persists required data quality fields",
      () => {
        const source =
          normalized();

        for (
          const field of [
            "id uuid primary key",
            "organization_id uuid not null",
            "store_id uuid null",
            "location_id uuid null",
            "variant_id uuid null",
            "issue_code text not null",
            "issue_key text not null",
            "severity text not null",
            "status text not null",
            "message text not null",
            "remediation_hint text null",
            "source_context jsonb null",
            "detected_at timestamptz not null",
            "last_detected_at timestamptz not null",
            "occurrence_count integer not null",
            "resolved_at timestamptz null",
            "created_at timestamptz not null",
            "updated_at timestamptz not null",
          ]
        ) {
          expect(
            source,
          ).toContain(
            field,
          );
        }
      },
    );

    it(
      "uses the frozen severity vocabulary",
      () => {
        const source =
          normalized();

        expect(
          source,
        ).toContain(
          "constraint data_quality_issues_severity_check",
        );

        for (
          const severity of [
            "'critical'",
            "'high'",
            "'medium'",
            "'low'",
            "'info'",
          ]
        ) {
          expect(
            source,
          ).toContain(
            severity,
          );
        }
      },
    );

    it(
      "uses the frozen status vocabulary",
      () => {
        const source =
          normalized();

        expect(
          source,
        ).toContain(
          "constraint data_quality_issues_status_check",
        );

        for (
          const status of [
            "'open'",
            "'resolved'",
            "'ignored'",
            "'superseded'",
          ]
        ) {
          expect(
            source,
          ).toContain(
            status,
          );
        }
      },
    );

    it(
      "rejects blank issue identity and message text",
      () => {
        const source =
          normalized();

        expect(
          source,
        ).toContain(
          "constraint data_quality_issues_issue_code_not_blank check ( pg_catalog.length( pg_catalog.btrim(issue_code) ) > 0 )",
        );

        expect(
          source,
        ).toContain(
          "constraint data_quality_issues_issue_key_not_blank check ( pg_catalog.length( pg_catalog.btrim(issue_key) ) > 0 )",
        );

        expect(
          source,
        ).toContain(
          "constraint data_quality_issues_message_not_blank check ( pg_catalog.length( pg_catalog.btrim(message) ) > 0 )",
        );

        expect(
          source,
        ).toContain(
          "constraint data_quality_issues_remediation_hint_not_blank check ( remediation_hint is null or pg_catalog.length( pg_catalog.btrim(remediation_hint) ) > 0 )",
        );
      },
    );

    it(
      "requires a positive occurrence count",
      () => {
        expect(
          normalized(),
        ).toContain(
          "constraint data_quality_issues_occurrence_count_positive check (occurrence_count >= 1)",
        );
      },
    );

    it(
      "keeps last detection at or after first detection",
      () => {
        expect(
          normalized(),
        ).toContain(
          "constraint data_quality_issues_detection_order check (last_detected_at >= detected_at)",
        );
      },
    );

    it(
      "ties resolved status to resolved_at",
      () => {
        expect(
          normalized(),
        ).toContain(
          "constraint data_quality_issues_resolved_status check ( (status = 'resolved') = (resolved_at is not null) )",
        );
      },
    );

    it(
      "enforces composite organization and store ownership",
      () => {
        const source =
          normalized();

        expect(
          source,
        ).toContain(
          "constraint data_quality_issues_organization_fk foreign key (organization_id) references public.organizations(id) on delete restrict",
        );

        expect(
          source,
        ).toContain(
          "constraint data_quality_issues_store_ownership_fk foreign key ( organization_id, store_id ) references public.stores ( organization_id, id ) on delete restrict",
        );
      },
    );

    it(
      "enforces location and variant tenant and store ownership",
      () => {
        const source =
          normalized();

        expect(
          source,
        ).toContain(
          "constraint data_quality_issues_location_ownership_fk foreign key ( organization_id, store_id, location_id ) references public.locations ( organization_id, store_id, id ) on delete restrict",
        );

        expect(
          source,
        ).toContain(
          "constraint data_quality_issues_variant_ownership_fk foreign key ( organization_id, store_id, variant_id ) references public.product_variants ( organization_id, store_id, id ) on delete restrict",
        );

        expect(
          source,
        ).toContain(
          "constraint data_quality_issues_location_requires_store check ( location_id is null or store_id is not null )",
        );

        expect(
          source,
        ).toContain(
          "constraint data_quality_issues_variant_requires_store check ( variant_id is null or store_id is not null )",
        );
      },
    );

    it(
      "uniquely identifies one open issue per organization and issue key",
      () => {
        expect(
          normalized(),
        ).toContain(
          "create unique index data_quality_issues_open_identity_unique on public.data_quality_issues ( organization_id, issue_key ) where status = 'open'",
        );
      },
    );

    it(
      "indexes organization and store status lookups",
      () => {
        const source =
          normalized();

        expect(
          source,
        ).toContain(
          "create index data_quality_issues_organization_status_idx on public.data_quality_issues ( organization_id, status )",
        );

        expect(
          source,
        ).toContain(
          "create index data_quality_issues_organization_store_status_idx on public.data_quality_issues ( organization_id, store_id, status )",
        );
      },
    );

    it(
      "maintains updated_at",
      () => {
        const source =
          normalized();

        expect(
          source,
        ).toContain(
          "create trigger data_quality_issues_set_updated_at",
        );

        expect(
          source.match(
            /execute function public\.set_updated_at\(\)/g,
          ),
        ).toHaveLength(
          1,
        );
      },
    );

    it(
      "rejects canonical identity reassignment",
      () => {
        const source =
          normalized();

        expect(
          source,
        ).toContain(
          "create trigger data_quality_issues_prevent_identity_reassignment",
        );

        expect(
          source,
        ).toContain(
          "execute function public.prevent_data_quality_issue_identity_reassignment()",
        );

        for (
          const column of [
            "organization_id",
            "store_id",
            "location_id",
            "variant_id",
            "issue_code",
            "issue_key",
            "detected_at",
          ]
        ) {
          expect(
            source,
          ).toContain(
            `new.${column} is distinct from old.${column}`,
          );
        }
      },
    );

    it(
      "enables row level security",
      () => {
        expect(
          normalized(),
        ).toContain(
          "alter table public.data_quality_issues enable row level security",
        );
      },
    );

    it(
      "revokes all table privileges from anon",
      () => {
        expect(
          normalized(),
        ).toContain(
          "revoke all on table public.data_quality_issues from anon",
        );
      },
    );

    it(
      "grants authenticated users select only",
      () => {
        const source =
          normalized();

        expect(
          source,
        ).toContain(
          "grant select on table public.data_quality_issues to authenticated",
        );

        expect(
          source,
        ).toContain(
          "revoke insert, update, delete, truncate, references, trigger on table public.data_quality_issues from authenticated",
        );
      },
    );

    it(
      "creates exactly one authenticated select membership policy",
      () => {
        const source =
          migration();

        const policies = [
          ...source.matchAll(
            /create policy\s+([a-z0-9_]+)/gi,
          ),
        ].map(
          (match) =>
            match[1],
        );

        expect(
          policies,
        ).toEqual([
          "data_quality_issues_select_member",
        ]);

        expect(
          normalized(),
        ).toContain(
          "create policy data_quality_issues_select_member on public.data_quality_issues for select to authenticated using ( exists ( select 1 from public.organization_members as membership where membership.organization_id = data_quality_issues.organization_id and membership.user_id = (select auth.uid()) ) )",
        );
      },
    );

    it(
      "creates no browser mutation policies",
      () => {
        const source =
          normalized();

        expect(
          source,
        ).not.toMatch(
          /create policy [^;]+ for insert/,
        );

        expect(
          source,
        ).not.toMatch(
          /create policy [^;]+ for update/,
        );

        expect(
          source,
        ).not.toMatch(
          /create policy [^;]+ for delete/,
        );

        expect(
          source,
        ).not.toMatch(
          /create policy [^;]+ for all/,
        );
      },
    );
  },
);
