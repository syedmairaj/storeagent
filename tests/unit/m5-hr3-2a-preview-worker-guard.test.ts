import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { NextRequest } from "next/server";

import { GET as getRecomputeCron } from "@/app/api/internal/cron/metric-recompute/route";
import { GET as getRolloverCron } from "@/app/api/internal/cron/metric-rollover/route";
import { POST as postRecompute } from "@/app/api/internal/metric-recompute/route";
import { POST as postRollover } from "@/app/api/internal/metric-rollover/route";
import {
  evaluateMetricRecomputeCronGate,
} from "@/lib/persistence/metric-cron-auth";
import {
  evaluateMetricRecomputeHttpGate,
  readMetricRecomputeWorkerConfig,
} from "@/lib/persistence/metric-recompute-queue";
import {
  evaluateMetricRolloverHttpGate,
  readMetricRolloverWorkerConfig,
} from "@/lib/persistence/metric-rollover";
import {
  isMetricWorkerEnvEnabled,
  isVercelPreviewRuntime,
  VERCEL_PREVIEW_ENV,
} from "@/lib/persistence/metric-worker-runtime-env";

const ORG = "57160000-0000-4000-8000-000000000001";
const WORKER_SECRET = "w".repeat(32);
const CRON_SECRET = "c".repeat(32);

const ORIGINAL_ENV = process.env;

function withEnv(
  patch: Record<string, string | undefined>,
  run: () => Promise<void>,
): Promise<void> {
  const next: Record<string, string | undefined> = {
    ...ORIGINAL_ENV,
  };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      delete next[key];
    } else {
      next[key] = value;
    }
  }
  process.env = next as NodeJS.ProcessEnv;
  return run().finally(() => {
    process.env = ORIGINAL_ENV;
  });
}

describe("M5-HR3.2a Preview runtime detection", () => {
  it("is true only for exact VERCEL_ENV=preview", () => {
    expect(isVercelPreviewRuntime({ VERCEL_ENV: "preview" })).toBe(true);
    expect(isVercelPreviewRuntime({ VERCEL_ENV: VERCEL_PREVIEW_ENV })).toBe(
      true,
    );

    expect(isVercelPreviewRuntime({})).toBe(false);
    expect(isVercelPreviewRuntime({ VERCEL_ENV: undefined })).toBe(false);
    expect(isVercelPreviewRuntime({ VERCEL_ENV: "" })).toBe(false);
    expect(isVercelPreviewRuntime({ VERCEL_ENV: "production" })).toBe(false);
    expect(isVercelPreviewRuntime({ VERCEL_ENV: "development" })).toBe(false);
    expect(isVercelPreviewRuntime({ VERCEL_ENV: "Preview" })).toBe(false);
    expect(isVercelPreviewRuntime({ VERCEL_ENV: "PREVIEW" })).toBe(false);
    expect(isVercelPreviewRuntime({ VERCEL_ENV: " preview " })).toBe(false);
  });

  it("ignores NODE_ENV and forged header-like env keys", () => {
    expect(
      isVercelPreviewRuntime({
        NODE_ENV: "production",
        VERCEL_ENV: "preview",
      }),
    ).toBe(true);

    expect(
      isMetricWorkerEnvEnabled(
        {
          NODE_ENV: "production",
          VERCEL_ENV: "preview",
          "x-vercel-env": "production",
          VERCEL_URL: "storeagent.vercel.app",
          NEXT_PUBLIC_SUPABASE_URL: "https://qlsqminsfdntpqdkhxjx.supabase.co",
        },
        "1",
      ),
    ).toBe(false);

    expect(
      isMetricWorkerEnvEnabled(
        {
          NODE_ENV: "development",
          VERCEL_ENV: undefined,
        },
        "1",
      ),
    ).toBe(true);
  });
});

describe("M5-HR3.2a config readers force enabled=false on Preview", () => {
  it("Preview + ENABLE=1 → enabled false for recompute and rollover", () => {
    const recompute = readMetricRecomputeWorkerConfig({
      VERCEL_ENV: "preview",
      METRIC_RECOMPUTE_WORKER_ENABLED: "1",
      METRIC_RECOMPUTE_WORKER_SECRET: WORKER_SECRET,
      METRIC_RECOMPUTE_ORGANIZATION_ID: ORG,
    });
    const rollover = readMetricRolloverWorkerConfig({
      VERCEL_ENV: "preview",
      METRIC_ROLLOVER_WORKER_ENABLED: "1",
      METRIC_ROLLOVER_WORKER_SECRET: WORKER_SECRET,
      METRIC_ROLLOVER_ORGANIZATION_ID: ORG,
    });

    expect(recompute.enabled).toBe(false);
    expect(rollover.enabled).toBe(false);
    // Secrets/org still parse; gates must fail on enabled before using them.
    expect(recompute.secret).toBe(WORKER_SECRET);
    expect(recompute.organizationId).toBe(ORG);
    expect(rollover.secret).toBe(WORKER_SECRET);
    expect(rollover.organizationId).toBe(ORG);
  });

  it("Production + ENABLE=1 remains enabled; Production default-OFF stays off", () => {
    expect(
      readMetricRecomputeWorkerConfig({
        VERCEL_ENV: "production",
        METRIC_RECOMPUTE_WORKER_ENABLED: "1",
        METRIC_RECOMPUTE_WORKER_SECRET: WORKER_SECRET,
        METRIC_RECOMPUTE_ORGANIZATION_ID: ORG,
      }).enabled,
    ).toBe(true);

    expect(
      readMetricRecomputeWorkerConfig({
        VERCEL_ENV: "production",
        METRIC_RECOMPUTE_WORKER_SECRET: WORKER_SECRET,
        METRIC_RECOMPUTE_ORGANIZATION_ID: ORG,
      }).enabled,
    ).toBe(false);

    expect(
      readMetricRolloverWorkerConfig({
        VERCEL_ENV: "production",
        METRIC_ROLLOVER_WORKER_ENABLED: "1",
        METRIC_ROLLOVER_WORKER_SECRET: WORKER_SECRET,
        METRIC_ROLLOVER_ORGANIZATION_ID: ORG,
      }).enabled,
    ).toBe(true);
  });

  it("local (VERCEL_ENV unset) default-OFF and intentional ENABLE=1 preserved", () => {
    expect(
      readMetricRecomputeWorkerConfig({
        METRIC_RECOMPUTE_WORKER_SECRET: WORKER_SECRET,
        METRIC_RECOMPUTE_ORGANIZATION_ID: ORG,
      }).enabled,
    ).toBe(false);

    expect(
      readMetricRecomputeWorkerConfig({
        METRIC_RECOMPUTE_WORKER_ENABLED: "1",
        METRIC_RECOMPUTE_WORKER_SECRET: WORKER_SECRET,
        METRIC_RECOMPUTE_ORGANIZATION_ID: ORG,
      }).enabled,
    ).toBe(true);

    expect(
      readMetricRolloverWorkerConfig({
        METRIC_ROLLOVER_WORKER_ENABLED: "1",
        METRIC_ROLLOVER_WORKER_SECRET: WORKER_SECRET,
        METRIC_ROLLOVER_ORGANIZATION_ID: ORG,
      }).enabled,
    ).toBe(true);
  });

  it("development VERCEL_ENV does not hard-disable (only preview)", () => {
    expect(
      readMetricRecomputeWorkerConfig({
        VERCEL_ENV: "development",
        METRIC_RECOMPUTE_WORKER_ENABLED: "1",
        METRIC_RECOMPUTE_WORKER_SECRET: WORKER_SECRET,
        METRIC_RECOMPUTE_ORGANIZATION_ID: ORG,
      }).enabled,
    ).toBe(true);
  });

  it("missing/unknown VERCEL_ENV is not verified Production (ENABLE still honored)", () => {
    // Documented limitation: only exact "preview" is hard-blocked.
    // Unset / empty / garbage must not be mistaken for Production attestation.
    for (const vercelEnv of [undefined, "", "staging", "prod", "PREVIEW"]) {
      expect(
        isVercelPreviewRuntime({
          VERCEL_ENV: vercelEnv,
        }),
      ).toBe(false);

      expect(
        readMetricRecomputeWorkerConfig({
          VERCEL_ENV: vercelEnv,
          METRIC_RECOMPUTE_WORKER_ENABLED: "1",
          METRIC_RECOMPUTE_WORKER_SECRET: WORKER_SECRET,
          METRIC_RECOMPUTE_ORGANIZATION_ID: ORG,
        }).enabled,
      ).toBe(true);

      expect(
        readMetricRolloverWorkerConfig({
          VERCEL_ENV: vercelEnv,
          METRIC_ROLLOVER_WORKER_ENABLED: "1",
          METRIC_ROLLOVER_WORKER_SECRET: WORKER_SECRET,
          METRIC_ROLLOVER_ORGANIZATION_ID: ORG,
        }).enabled,
      ).toBe(true);
    }
  });
});

describe("M5-HR3.2a HTTP/cron gates on Preview → 404, zero work", () => {
  it("POST HTTP gates return not_found when Preview forces enabled false", () => {
    const recompute = readMetricRecomputeWorkerConfig({
      VERCEL_ENV: "preview",
      METRIC_RECOMPUTE_WORKER_ENABLED: "1",
      METRIC_RECOMPUTE_WORKER_SECRET: WORKER_SECRET,
      METRIC_RECOMPUTE_ORGANIZATION_ID: ORG,
    });
    const rollover = readMetricRolloverWorkerConfig({
      VERCEL_ENV: "preview",
      METRIC_ROLLOVER_WORKER_ENABLED: "1",
      METRIC_ROLLOVER_WORKER_SECRET: WORKER_SECRET,
      METRIC_ROLLOVER_ORGANIZATION_ID: ORG,
    });

    expect(
      evaluateMetricRecomputeHttpGate(
        recompute,
        `Bearer ${WORKER_SECRET}`,
      ),
    ).toEqual({
      ok: false,
      status: 404,
      error: "not_found",
    });

    expect(
      evaluateMetricRolloverHttpGate(
        rollover,
        `Bearer ${WORKER_SECRET}`,
      ),
    ).toEqual({
      ok: false,
      status: 404,
      error: "not_found",
    });
  });

  it("cron GET gate returns not_found on Preview even with valid CRON_SECRET", () => {
    const recompute = readMetricRecomputeWorkerConfig({
      VERCEL_ENV: "preview",
      METRIC_RECOMPUTE_WORKER_ENABLED: "1",
      METRIC_RECOMPUTE_ORGANIZATION_ID: ORG,
    });

    expect(
      evaluateMetricRecomputeCronGate(
        CRON_SECRET,
        recompute,
        `Bearer ${CRON_SECRET}`,
      ),
    ).toEqual({
      ok: false,
      status: 404,
      error: "not_found",
    });
  });
});

describe("M5-HR3.2a POST/GET routes inherit Preview hard-disable", () => {
  it("Preview + ENABLE=1 + valid secrets → 404 on all four entry points", async () => {
    await withEnv(
      {
        VERCEL_ENV: "preview",
        CRON_SECRET: CRON_SECRET,
        METRIC_RECOMPUTE_WORKER_ENABLED: "1",
        METRIC_RECOMPUTE_WORKER_SECRET: WORKER_SECRET,
        METRIC_RECOMPUTE_ORGANIZATION_ID: ORG,
        METRIC_ROLLOVER_WORKER_ENABLED: "1",
        METRIC_ROLLOVER_WORKER_SECRET: WORKER_SECRET,
        METRIC_ROLLOVER_ORGANIZATION_ID: ORG,
        // Forged / irrelevant signals must not reopen workers.
        NODE_ENV: "production",
        NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-should-not-be-used",
      },
      async () => {
        const postRecomputeRes = await postRecompute(
          new NextRequest(
            "http://localhost/api/internal/metric-recompute",
            {
              method: "POST",
              headers: {
                authorization: `Bearer ${WORKER_SECRET}`,
                "x-vercel-env": "production",
                "x-organization-id": ORG,
              },
            },
          ),
        );
        expect(postRecomputeRes.status).toBe(404);
        await expect(postRecomputeRes.json()).resolves.toMatchObject({
          error: "not_found",
        });

        const postRolloverRes = await postRollover(
          new NextRequest(
            "http://localhost/api/internal/metric-rollover",
            {
              method: "POST",
              headers: {
                authorization: `Bearer ${WORKER_SECRET}`,
                "x-vercel-env": "production",
              },
            },
          ),
        );
        expect(postRolloverRes.status).toBe(404);

        const getRecomputeRes = await getRecomputeCron(
          new NextRequest(
            "http://localhost/api/internal/cron/metric-recompute",
            {
              headers: {
                authorization: `Bearer ${CRON_SECRET}`,
                "x-vercel-env": "production",
              },
            },
          ),
        );
        expect(getRecomputeRes.status).toBe(404);

        const getRolloverRes = await getRolloverCron(
          new NextRequest(
            "http://localhost/api/internal/cron/metric-rollover",
            {
              headers: {
                authorization: `Bearer ${CRON_SECRET}`,
                "user-agent": "vercel-cron/1.0",
              },
            },
          ),
        );
        expect(getRolloverRes.status).toBe(404);
      },
    );
  });

  it("Production default-OFF still 404; local ENABLE path not broken by guard when unset", async () => {
    await withEnv(
      {
        VERCEL_ENV: "production",
        CRON_SECRET: CRON_SECRET,
        METRIC_RECOMPUTE_WORKER_ENABLED: undefined,
        METRIC_ROLLOVER_WORKER_ENABLED: undefined,
        METRIC_RECOMPUTE_WORKER_SECRET: WORKER_SECRET,
        METRIC_ROLLOVER_WORKER_SECRET: WORKER_SECRET,
        METRIC_RECOMPUTE_ORGANIZATION_ID: ORG,
        METRIC_ROLLOVER_ORGANIZATION_ID: ORG,
      },
      async () => {
        const post = await postRecompute(
          new NextRequest(
            "http://localhost/api/internal/metric-recompute",
            {
              method: "POST",
              headers: {
                authorization: `Bearer ${WORKER_SECRET}`,
              },
            },
          ),
        );
        expect(post.status).toBe(404);

        const cron = await getRecomputeCron(
          new NextRequest(
            "http://localhost/api/internal/cron/metric-recompute",
            {
              headers: {
                authorization: `Bearer ${CRON_SECRET}`,
              },
            },
          ),
        );
        expect(cron.status).toBe(404);
      },
    );

    await withEnv(
      {
        VERCEL_ENV: undefined,
        METRIC_RECOMPUTE_WORKER_ENABLED: undefined,
        METRIC_RECOMPUTE_WORKER_SECRET: WORKER_SECRET,
        METRIC_RECOMPUTE_ORGANIZATION_ID: ORG,
      },
      async () => {
        const post = await postRecompute(
          new NextRequest(
            "http://localhost/api/internal/metric-recompute",
            {
              method: "POST",
              headers: {
                authorization: `Bearer ${WORKER_SECRET}`,
              },
            },
          ),
        );
        expect(post.status).toBe(404);
      },
    );
  });
});
