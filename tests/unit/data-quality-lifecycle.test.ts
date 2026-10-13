import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

vi.mock("server-only", () => ({}));

import {
  DataQualityIllegalLifecycleTransitionError,
  DataQualityIssueNotInOrganizationError,
  DataQualityLifecycleBeforeDetectionError,
  dataQualityLifecycleTarget,
  transitionDataQualityIssue,
} from "@/lib/data-quality/lifecycle";

import type { DataQualityIssueStatus } from "@/lib/commerce-domain/types";

const ORG = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const ISSUE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9";
const OCCURRED_AT = "2026-10-13T12:00:00.000Z";

describe("data quality issue lifecycle", () => {
  it("allows only open issues to resolve, ignore, or supersede", () => {
    expect(dataQualityLifecycleTarget("open", "resolve")).toBe(
      "resolved",
    );
    expect(dataQualityLifecycleTarget("open", "ignore")).toBe(
      "ignored",
    );
    expect(dataQualityLifecycleTarget("open", "supersede")).toBe(
      "superseded",
    );

    const terminal: DataQualityIssueStatus[] = [
      "resolved",
      "ignored",
      "superseded",
    ];

    for (const current of terminal) {
      expect(() =>
        dataQualityLifecycleTarget(current, "resolve"),
      ).toThrow(DataQualityIllegalLifecycleTransitionError);
      expect(() =>
        dataQualityLifecycleTarget(current, "ignore"),
      ).toThrow(DataQualityIllegalLifecycleTransitionError);
      expect(() =>
        dataQualityLifecycleTarget(current, "supersede"),
      ).toThrow(DataQualityIllegalLifecycleTransitionError);
    }
  });

  it("sends trusted organization and issue ids to the lifecycle RPC", async () => {
    const calls: Record<string, unknown>[] = [];

    const result = await transitionDataQualityIssue(
      {
        organizationId: ORG,
        issueId: ISSUE,
        transition: "resolve",
        occurredAt: OCCURRED_AT,
      },
      {
        rpc: async (_fn, args) => {
          calls.push(args);

          return {
            data: [
              {
                issue_id: ISSUE,
                previous_status: "open",
                status: "resolved",
                resolved_at: OCCURRED_AT,
              },
            ],
            error: null,
          };
        },
      },
    );

    expect(calls).toEqual([
      {
        p_organization_id: ORG,
        p_issue_id: ISSUE,
        p_transition: "resolve",
        p_occurred_at: OCCURRED_AT,
      },
    ]);
    expect(result).toEqual({
      issueId: ISSUE,
      previousStatus: "open",
      status: "resolved",
      resolvedAt: OCCURRED_AT,
    });
  });

  it("maps illegal transition and cross-org SQLSTATEs without reading error text", async () => {
    await expect(
      transitionDataQualityIssue(
        {
          organizationId: ORG,
          issueId: ISSUE,
          transition: "ignore",
          occurredAt: OCCURRED_AT,
        },
        {
          rpc: async () => ({
            data: null,
            error: {
              code: "SA005",
              message: "unparsed database text",
            },
          }),
        },
      ),
    ).rejects.toBeInstanceOf(
      DataQualityIllegalLifecycleTransitionError,
    );

    await expect(
      transitionDataQualityIssue(
        {
          organizationId: ORG,
          issueId: ISSUE,
          transition: "supersede",
          occurredAt: OCCURRED_AT,
        },
        {
          rpc: async () => ({
            data: null,
            error: {
              code: "SA006",
              message: "unparsed database text",
            },
          }),
        },
      ),
    ).rejects.toBeInstanceOf(
      DataQualityIssueNotInOrganizationError,
    );

    await expect(
      transitionDataQualityIssue(
        {
          organizationId: ORG,
          issueId: ISSUE,
          transition: "resolve",
          occurredAt: OCCURRED_AT,
        },
        {
          rpc: async () => ({
            data: null,
            error: {
              code: "SA007",
              message: "unparsed database text",
            },
          }),
        },
      ),
    ).rejects.toBeInstanceOf(
      DataQualityLifecycleBeforeDetectionError,
    );
  });
});
