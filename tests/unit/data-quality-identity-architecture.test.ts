import fs from "node:fs";
import path from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return fs.readFileSync(
    path.join(ROOT, relativePath),
    "utf8",
  );
}

const FILES = [
  "lib/data-quality/identity.ts",
  "lib/data-quality/types.ts",
] as const;

describe(
  "data quality identity architecture",
  () => {
    it(
      "keeps issue identity free of persistence and product SDKs",
      () => {
        const forbidden = [
          "supabase",
          "@supabase",
          "next/",
          "react",
          "stripe",
          "openai",
          "@anthropic",
          "@shopify",
          "shopify-api",
          "randomUUID",
          "Math.random",
          "node:crypto",
        ];

        for (const file of FILES) {
          const source = read(file);

          for (const dependency of forbidden) {
            expect(
              source.includes(dependency),
              `${file} must not depend on ${dependency}`,
            ).toBe(false);
          }
        }
      },
    );

    it(
      "builds keys only from the versioned identity contract",
      () => {
        const identity = read(
          "lib/data-quality/identity.ts",
        );
        const types = read(
          "lib/data-quality/types.ts",
        );

        expect(types).toContain(
          'export const DATA_QUALITY_IDENTITY_VERSION =\n  "dq-v1" as const;',
        );

        expect(identity).toContain(
          "export function buildDataQualityIssueIdentity(",
        );

        expect(identity).toContain(
          "export function buildDataQualityIssueKey(",
        );

        expect(identity).toContain(
          "return JSON.stringify(",
        );

        for (const kind of [
          "organization",
          "store",
          "location",
          "variant",
          "location_variant",
          "provider",
        ]) {
          expect(types).toContain(
            `"${kind}"`,
          );
        }

        expect(types).toContain(
          "ProviderType",
        );

        expect(types).toContain(
          "ProviderResourceType",
        );
      },
    );

    it(
      "does not accept lifecycle, upload, or sync-run identity",
      () => {
        const source = FILES.map(
          (file) => read(file),
        ).join("\n");

        for (const field of [
          "message",
          "remediationHint",
          "severity",
          "status",
          "sourceContext",
          "detectedAt",
          "lastDetectedAt",
          "resolvedAt",
          "occurrenceCount",
          "createdAt",
          "updatedAt",
          "rowNumber",
          "fileName",
          "filename",
          "uploadTime",
          "syncRunId",
          "organizationId",
          "externalParentId",
        ]) {
          expect(
            source.includes(field),
            `${field} must stay outside issue identity`,
          ).toBe(false);
        }
      },
    );

    it(
      "requires integration id only on the provider subject",
      () => {
        const types = read(
          "lib/data-quality/types.ts",
        );
        const identity = read(
          "lib/data-quality/identity.ts",
        );
        const providerSubject =
          types.slice(
            types.indexOf(
              "export type DataQualityProviderSubject",
            ),
            types.indexOf(
              "export type DataQualityIssueSubject",
            ),
          );

        expect(providerSubject).toContain(
          "readonly integrationId: string;",
        );

        for (const subject of [
          "export type DataQualityOrganizationSubject",
          "export type DataQualityStoreSubject",
          "export type DataQualityLocationSubject",
          "export type DataQualityVariantSubject",
          "export type DataQualityLocationVariantSubject",
        ]) {
          const start = types.indexOf(subject);
          const block = types.slice(
            start,
            types.indexOf(
              "};",
              start,
            ),
          );

          expect(block).not.toContain(
            "integrationId",
          );
        }

        const providerCase =
          identity.slice(
            identity.indexOf(
              'case "provider":',
            ),
          );

        expect(providerCase).toContain(
          '"integrationId"',
        );

        expect(
          identity.slice(
            0,
            identity.indexOf(
              'case "provider":',
            ),
          ),
        ).not.toContain(
          "integrationId",
        );
      },
    );
  },
);
