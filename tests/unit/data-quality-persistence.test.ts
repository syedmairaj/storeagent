import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("server-only", () => ({}));

import { buildDataQualityIssueKey } from "@/lib/data-quality/identity";

import {
  assertDataQualityCanonicalScope,
  persistDataQualityIssue,
  reconcileOpenIssueSeverity,
} from "@/lib/data-quality/persistence";

import type { PersistDataQualityIssueInput } from "@/lib/data-quality/persistence";

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const STORE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const OTHER_STORE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
const LOCATION = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
const VARIANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4";

function input(
  overrides: Partial<PersistDataQualityIssueInput> = {},
): PersistDataQualityIssueInput {
  return {
    organizationId: ORG,
    storeId: STORE,
    locationId: LOCATION,
    variantId: VARIANT,
    detectedAt: "2026-10-13T00:00:00.000Z",
    candidate: {
      disposition: "durable_issue",
      issueCode: "NEGATIVE_INVENTORY",
      severity: "high",
      subject: {
        kind: "location_variant",
        locationId: LOCATION,
        variantId: VARIANT,
      },
      message: "Observed inventory quantity is negative.",
      remediationHint:
        "Correct the observed inventory quantity before using it for recommendations.",
      sourceContext: {
        provenance: "negative_inventory_observation",
        quantityField: "on_hand",
        observedQuantity: -2,
      },
    },
    ...overrides,
  };
}

describe("data quality issue persistence policy", () => {
  it("never downgrades an open issue and can upgrade it", () => {
    expect(
      reconcileOpenIssueSeverity("critical", "low"),
    ).toBe("critical");

    expect(
      reconcileOpenIssueSeverity("low", "critical"),
    ).toBe("critical");

    expect(
      reconcileOpenIssueSeverity("high", "high"),
    ).toBe("high");

    expect(
      reconcileOpenIssueSeverity("info", "medium"),
    ).toBe("medium");
  });

  it("rejects subject and canonical scope mismatches before persistence", () => {
    expect(() =>
      assertDataQualityCanonicalScope(
        input({
          variantId: OTHER_STORE,
        }),
      ),
    ).toThrow(
      "data quality issue canonical scope is invalid",
    );

    expect(() =>
      assertDataQualityCanonicalScope(
        input({
          locationId: null,
        }),
      ),
    ).toThrow(
      "data quality issue canonical scope is invalid",
    );

    expect(() =>
      assertDataQualityCanonicalScope(
        input({
          storeId: null,
          locationId: null,
          variantId: null,
          candidate: {
            ...input().candidate,
            issueCode: "ORG_SETUP",
            subject: { kind: "organization" },
          },
        }),
      ),
    ).not.toThrow();

    expect(() =>
      assertDataQualityCanonicalScope(
        input({
          candidate: {
            ...input().candidate,
            issueCode: "ORG_SETUP",
            subject: { kind: "organization" },
          },
        }),
      ),
    ).toThrow(
      "data quality issue canonical scope is invalid",
    );
  });

  it("derives the issue key from M4.3 identity and does not read tenant ownership from source context", async () => {
    const calls: Record<string, unknown>[] = [];
    const persisted = input();

    const result = await persistDataQualityIssue(
      persisted,
      {
        rpc: async (_fn, args) => {
          calls.push(args);

          return {
            data: [
              {
                disposition: "created",
                issue_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9",
                issue_key: args.p_issue_key,
                occurrence_count: 1,
                severity: "high",
                detected_at: persisted.detectedAt,
                last_detected_at: persisted.detectedAt,
              },
            ],
            error: null,
          };
        },
      },
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.p_organization_id).toBe(ORG);
    expect(calls[0]?.p_issue_key).toBe(
      buildDataQualityIssueKey({
        issueCode: "NEGATIVE_INVENTORY",
        subject: persisted.candidate.subject,
      }),
    );
    expect(calls[0]?.p_source_context).toEqual(
      persisted.candidate.sourceContext,
    );
    expect(result).toMatchObject({
      disposition: "created",
      occurrenceCount: 1,
      severity: "high",
    });
  });
});
