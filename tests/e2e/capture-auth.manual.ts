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

/**
 * Manual headed capture — does not create users or change Auth DB.
 *
 * Run:
 *   MANUAL_AUTH_CAPTURE=1 npx playwright test tests/e2e/capture-auth.manual.ts --project=manual-auth --headed
 *
 * In the opened browser: sign in with a real local user, open an org, then resume the inspector.
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
    });
    fs.mkdirSync(ARTIFACTS_DIR, {
      recursive: true,
    });

    await page.goto("/login?next=/app", {
      waitUntil: "domcontentloaded",
    });

    // Operator signs in with a known-good local password user, then resumes.
    await page.pause();

    await page.goto("/app", {
      waitUntil: "domcontentloaded",
    });

    await expect(
      page.getByRole("heading", {
        name: /choose where you want to work/i,
      }),
    ).toBeVisible({
      timeout: 30_000,
    });

    const preferredOrgId =
      resolveOptionalOrgId();

    let organizationId: string | null =
      null;

    if (
      preferredOrgId
    ) {
      organizationId = preferredOrgId;
      await page.goto(
        `/app/${organizationId}`,
        {
          waitUntil: "domcontentloaded",
        },
      );
    } else {
      const orgLink = page
        .locator(
          'section[aria-label="Organizations"] a[href^="/app/"]',
        )
        .first();
      await expect(orgLink).toBeVisible({
        timeout: 20_000,
      });
      const href =
        await orgLink.getAttribute("href");
      const match =
        href?.match(/^\/app\/([^/?#]+)/);
      if (
        !match?.[1]
      ) {
        throw new Error(
          "Manual capture failed: no organization membership visible after login.",
        );
      }
      organizationId = match[1];
      await orgLink.click();
      await page.waitForURL(
        new RegExp(`/app/${organizationId}`),
      );
    }

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

    fs.writeFileSync(
      AUTH_CONTEXT_PATH,
      JSON.stringify(
        {
          organizationId,
          actionsPath: `/app/${organizationId}/actions`,
          capturedAt: new Date().toISOString(),
          source: "manual_browser_capture",
        },
        null,
        2,
      ),
      "utf8",
    );

    await page.context().storageState({
      path: AUTH_STATE_PATH,
    });
  },
);
