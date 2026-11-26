import fs from "node:fs";

import {
  expect,
  test,
} from "@playwright/test";

import {
  ARTIFACTS_DIR,
  AUTH_CONTEXT_PATH,
  AUTH_DIR,
  AUTH_STATE_PATH,
  resolveOptionalOrgId,
} from "./helpers/env";
import { classifyAuthenticatedOrgState } from "./helpers/org-contract";

/**
 * Manual headed capture — does not create users or change Auth DB.
 * Does not call GoTrue verify itself (operator pastes the link once).
 *
 * Default StoreAgent login remains magic-link at /login.
 *
 * Magic-link procedure (same Playwright Chromium context only):
 * 1. Request one new magic link on /login.
 * 2. Open Mailpit http://127.0.0.1:55324 — copy the verify URL; do not click it.
 * 3. Paste that URL once into this Chromium address bar (PKCE verifier stays here).
 * 4. Wait until authenticated /app is visible (org picker or workspace).
 * 5. Resume the Playwright inspector.
 *
 * Reuse of the same magic link → GoTrue otp_expired / access_denied.
 *
 * Run (prefer isolated auth outside the repo):
 *   export PLAYWRIGHT_AUTH_DIR="$HOME/Library/Application Support/StoreAgent/fe-accept-1-final/auth"
 *   export PLAYWRIGHT_ARTIFACTS_DIR="$HOME/Library/Application Support/StoreAgent/fe-accept-1-final/artifacts"
 *   MANUAL_AUTH_CAPTURE=1 npx playwright test --project=manual-auth --headed
 */
test(
  "manual browser session capture for Actions E2E",
  async ({
    page,
  }) => {
    if (
      process.env.MANUAL_AUTH_CAPTURE !== "1"
    ) {
      test.skip(
        true,
        "Set MANUAL_AUTH_CAPTURE=1 to run headed session capture.",
      );
    }

    fs.mkdirSync(AUTH_DIR, {
      recursive: true,
      mode: 0o700,
    });
    fs.mkdirSync(ARTIFACTS_DIR, {
      recursive: true,
    });
    try {
      fs.chmodSync(AUTH_DIR, 0o700);
    } catch {
      // Best-effort on platforms that ignore mode bits.
    }

    // Default magic-link surface (not password mode).
    await page.goto("/login?next=/app", {
      waitUntil: "domcontentloaded",
    });

    await expect(
      page.getByRole("heading", {
        name: /welcome to storeagent/i,
      }),
    ).toBeVisible();

    // Operator completes magic-link (or password) in THIS window, then resumes.
    await page.pause();

    const afterPauseUrl = page.url();
    if (
      /[?&]auth_error=/.test(afterPauseUrl)
    ) {
      throw new Error(
        "Manual capture failed: auth_error still present after resume. Request a fresh magic link and open it once in this Chromium only.",
      );
    }

    if (
      /\/login(?:\?|$)/.test(
        new URL(afterPauseUrl).pathname,
      )
    ) {
      throw new Error(
        "Manual capture failed: still on /login after resume. Finish magic-link (or password) sign-in in this window first.",
      );
    }

    const preferredOrgId =
      resolveOptionalOrgId();

    let organizationId: string | null =
      preferredOrgId;

    if (
      !organizationId
    ) {
      const fromUrl =
        afterPauseUrl.match(
          /\/app\/([0-9a-f-]{36})(?:\/|$)/i,
        );
      if (
        fromUrl?.[1]
      ) {
        organizationId = fromUrl[1];
      }
    }

    if (
      !organizationId
    ) {
      await page.goto("/app", {
        waitUntil: "domcontentloaded",
      });

      const contract =
        await classifyAuthenticatedOrgState(page);

      if (
        contract.code === "AUTH_FAIL"
      ) {
        throw new Error(
          `Manual capture AUTH_FAIL: ${contract.detail}`,
        );
      }
      if (
        contract.code ===
          "ORG_MEMBERSHIP_BLOCKED" ||
        !contract.organizationId
      ) {
        throw new Error(
          [
            "Manual capture ORG_MEMBERSHIP_BLOCKED (AUTH_PASS).",
            contract.detail,
            "Do not assume auth failure when /app/onboarding shows Set your organization context.",
          ].join(" "),
        );
      }
      if (
        contract.code === "ROUTING_FAIL"
      ) {
        throw new Error(
          `Manual capture ROUTING_FAIL: ${contract.detail}`,
        );
      }

      organizationId = contract.organizationId;

      if (
        /\/app\/?$/.test(
          new URL(page.url()).pathname,
        )
      ) {
        const orgLink = page.locator(
          `section[aria-label="Organizations"] a[href="/app/${organizationId}"]`,
        ).first();
        await expect(orgLink).toBeVisible({
          timeout: 20_000,
        });
        await orgLink.click();
        await page.waitForURL(
          new RegExp(`/app/${organizationId}`),
        );
      }
    } else if (
      preferredOrgId
    ) {
      await page.goto(
        `/app/${organizationId}`,
        {
          waitUntil: "domcontentloaded",
        },
      );
    }

    // Membership + synthetic Actions gate before persisting storage state.
    await page.goto(
      `/app/${organizationId}/actions`,
      {
        waitUntil: "domcontentloaded",
      },
    );

    await expect(
      page.locator(
        '[data-actions-synthetic-banner="true"]',
      ),
    ).toBeVisible({
      timeout: 20_000,
    });

    await expect(
      page.getByRole("heading", {
        name: /decision queue/i,
      }),
    ).toBeVisible();

    fs.writeFileSync(
      AUTH_CONTEXT_PATH,
      JSON.stringify(
        {
          organizationId,
          actionsPath: `/app/${organizationId}/actions`,
          capturedAt: new Date().toISOString(),
          source: "manual_browser_capture",
          loginSurface: "magic_link_default",
        },
        null,
        2,
      ),
      {
        encoding: "utf8",
        mode: 0o600,
      },
    );

    await page.context().storageState({
      path: AUTH_STATE_PATH,
    });
    try {
      fs.chmodSync(AUTH_STATE_PATH, 0o600);
    } catch {
      // Best-effort.
    }
  },
);
