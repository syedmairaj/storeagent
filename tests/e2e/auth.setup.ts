import fs from "node:fs";

import {
  expect,
  test as setup,
} from "@playwright/test";

import {
  ARTIFACTS_DIR,
  AUTH_CONTEXT_PATH,
  AUTH_DIR,
  AUTH_STATE_PATH,
  resolveE2ECredentials,
  resolveOptionalOrgId,
} from "./helpers/env";

setup(
  "authenticate via application login",
  async ({
    page,
  }) => {
    fs.mkdirSync(AUTH_DIR, {
      recursive: true,
    });
    fs.mkdirSync(ARTIFACTS_DIR, {
      recursive: true,
    });

    const credentials =
      resolveE2ECredentials();

    if (
      !credentials
    ) {
      throw new Error(
        [
          "E2E auth BLOCKED: missing credentials.",
          "Set E2E_EMAIL/E2E_PASSWORD to an existing local Auth user (password login).",
          "Studio UI is http://127.0.0.1:55323 — API used by the app is http://127.0.0.1:55321.",
          "Or capture a session: MANUAL_AUTH_CAPTURE=1 npx playwright test --project=manual-auth --headed",
        ].join(" "),
      );
    }

    await page.goto("/login?next=/app", {
      waitUntil: "domcontentloaded",
    });

    await expect(
      page.getByRole("heading", {
        name: /sign in to storeagent/i,
      }),
    ).toBeVisible();

    const emailField = page.locator("#email");
    const passwordField = page.locator(
      "#password",
    );

    await emailField.fill(
      credentials.email,
    );
    await passwordField.fill(
      credentials.password,
    );

    await page.getByRole("button", {
      name: /^sign in/i,
    }).click();

    const alert = page.getByRole("alert");
    const leftLogin = page.waitForURL(
      (url) =>
        !url.pathname.startsWith("/login"),
      {
        timeout: 30_000,
      },
    );

    const outcome = await Promise.race([
      leftLogin.then(() => "navigated" as const),
      alert
        .waitFor({
          state: "visible",
          timeout: 30_000,
        })
        .then(() => "alert" as const),
    ]).catch(() => "timeout" as const);

    // Never leave secrets in failure artifacts.
    await passwordField.fill("");

    if (
      outcome !== "navigated"
    ) {
      const alertText =
        outcome === "alert"
          ? (
              await alert.textContent()
            )?.trim() || "sign-in rejected"
          : "no navigation and no alert";

      throw new Error(
        [
          "E2E auth BLOCKED: application login did not succeed.",
          `UI outcome: ${alertText}.`,
          "Credentials were not logged.",
          "Confirmed local layout: Studio :55323, API/Auth :55321, password grant enabled.",
          "Configured E2E/M14 email must already exist in local auth.users with that password.",
          "auth.admin.listUsers is separately broken (NULL confirmation_token scan) and is not required for password login.",
          "Safe unblock options: (1) put valid existing-user E2E_EMAIL/E2E_PASSWORD in gitignored env, or",
          "(2) MANUAL_AUTH_CAPTURE=1 npx playwright test --project=manual-auth --headed then PLAYWRIGHT_REUSE_AUTH=1 npm run test:e2e:actions.",
          "Creating/resetting users requires explicit approval (persistent Auth mutation).",
        ].join(" "),
      );
    }

    await page.goto("/app", {
      waitUntil: "domcontentloaded",
    });

    await expect(
      page.getByRole("heading", {
        name: /choose where you want to work/i,
      }),
    ).toBeVisible({
      timeout: 20_000,
    });

    const preferredOrgId =
      resolveOptionalOrgId();

    let organizationId: string | null =
      null;

    if (
      preferredOrgId
    ) {
      await page.goto(
        `/app/${preferredOrgId}`,
        {
          waitUntil: "domcontentloaded",
        },
      );
      organizationId = preferredOrgId;
    } else {
      const orgLink = page
        .locator('section[aria-label="Organizations"] a[href^="/app/"]')
        .first();

      await expect(orgLink).toBeVisible({
        timeout: 15_000,
      });

      const href =
        await orgLink.getAttribute("href");
      const match =
        href?.match(
          /^\/app\/([^/?#]+)/,
        );

      if (
        !match?.[1]
      ) {
        throw new Error(
          "E2E auth BLOCKED: authenticated user has no organization membership.",
        );
      }

      organizationId = match[1];
      await orgLink.click();
      await page.waitForURL(
        new RegExp(
          `/app/${organizationId}`,
        ),
        {
          timeout: 20_000,
        },
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
