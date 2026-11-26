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
  resolveE2EAuthMode,
  resolveE2ECredentials,
  resolveE2EEmail,
} from "./helpers/env";
import { assertLocalAcceptanceStack } from "./helpers/local-stack";
import { authenticateWithMagicLink } from "./helpers/magic-link-auth";
import {
  classifyAuthenticatedOrgState,
  openAuthorizedOrganization,
} from "./helpers/org-contract";

setup(
  "authenticate via application login",
  async ({
    page,
  }) => {
    assertLocalAcceptanceStack();

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
      // Best-effort.
    }

    const mode = resolveE2EAuthMode();

    if (
      mode === "password"
    ) {
      await authenticateWithPassword(page);
    } else {
      await authenticateWithConfiguredMagicLink(
        page,
      );
    }

    await page.goto("/app", {
      waitUntil: "domcontentloaded",
    });

    const contract =
      await classifyAuthenticatedOrgState(page);

    if (
      contract.code === "AUTH_FAIL"
    ) {
      throw new Error(
        `E2E auth BLOCKED: ${contract.detail}`,
      );
    }

    if (
      contract.code === "ROUTING_FAIL"
    ) {
      throw new Error(
        `E2E ROUTING_FAIL: ${contract.detail}`,
      );
    }

    if (
      contract.code ===
        "ORG_MEMBERSHIP_BLOCKED" ||
      !contract.organizationId
    ) {
      throw new Error(
        [
          "E2E ORG_MEMBERSHIP_BLOCKED (AUTH_PASS).",
          contract.detail,
          "Configure E2E_EMAIL to an existing local Auth user that already has snapstore (or PLAYWRIGHT_ORG_ID) membership under RLS.",
          "Harness will not create users, insert membership, or complete onboarding.",
        ].join(" "),
      );
    }

    const organizationId =
      contract.organizationId;

    if (
      new URL(page.url()).pathname ===
        "/app" ||
      new URL(page.url()).pathname ===
        "/app/"
    ) {
      const orgLink = page.locator(
        `section[aria-label="Organizations"] a[href="/app/${organizationId}"], section[aria-label="Organizations"] a[href^="/app/${organizationId}/"]`,
      ).first();
      if (
        (await orgLink.count()) > 0
      ) {
        await orgLink.click();
        await page.waitForURL(
          new RegExp(
            `/app/${organizationId}`,
          ),
          {
            timeout: 20_000,
          },
        );
      } else {
        await openAuthorizedOrganization(
          page,
          organizationId,
        );
      }
    } else {
      await openAuthorizedOrganization(
        page,
        organizationId,
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
          capturedAt:
            new Date().toISOString(),
          source:
            mode === "password"
              ? "password_setup"
              : "magic_link_mailpit",
          orgContract: contract.code,
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

async function authenticateWithConfiguredMagicLink(
  page: import("@playwright/test").Page,
): Promise<void> {
  const email = resolveE2EEmail();
  if (
    !email
  ) {
    throw new Error(
      [
        "E2E auth BLOCKED: missing E2E_EMAIL (or M14_TEST_EMAIL) for magic-link setup.",
        "Set a gitignored owner-authorized existing local Auth identity.",
        "No password required. Harness will not create users.",
        "Optional fallback: E2E_AUTH_MODE=password with E2E_EMAIL/E2E_PASSWORD.",
      ].join(" "),
    );
  }

  const result = await authenticateWithMagicLink({
    page,
    email,
  });

  if (
    /[?&]auth_error=/.test(page.url()) ||
    new URL(page.url()).pathname.startsWith(
      "/login",
    )
  ) {
    throw new Error(
      [
        "E2E auth BLOCKED: magic-link verify did not establish an app session.",
        `landed=${result.landedPath}`,
        "OTP is single-use — do not retry the same Mailpit message.",
      ].join(" "),
    );
  }
}

async function authenticateWithPassword(
  page: import("@playwright/test").Page,
): Promise<void> {
  const credentials =
    resolveE2ECredentials();

  if (
    !credentials
  ) {
    throw new Error(
      [
        "E2E auth BLOCKED: E2E_AUTH_MODE=password requires E2E_EMAIL/E2E_PASSWORD (or M14_*).",
        "Prefer default magic-link setup (E2E_EMAIL only) against local Mailpit :55324.",
      ].join(" "),
    );
  }

  await page.goto(
    "/login?mode=password&next=/app",
    {
      waitUntil: "domcontentloaded",
    },
  );

  await expect(
    page.getByRole("heading", {
      name: /sign in with password/i,
    }),
  ).toBeVisible();

  const emailField = page.locator("#email");
  const passwordField = page.locator(
    "#password",
  );

  await emailField.fill(credentials.email);
  await passwordField.fill(
    credentials.password,
  );

  await page
    .getByRole("button", {
      name: /^sign in/i,
    })
    .click();

  const alert = page.getByRole("alert");
  const leftLogin = page.waitForURL(
    (url) =>
      !url.pathname.startsWith("/login"),
    {
      timeout: 30_000,
    },
  );

  const outcome = await Promise.race([
    leftLogin.then(
      () => "navigated" as const,
    ),
    alert
      .waitFor({
        state: "visible",
        timeout: 30_000,
      })
      .then(() => "alert" as const),
  ]).catch(() => "timeout" as const);

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
        "E2E auth BLOCKED: password login did not succeed.",
        `UI outcome: ${alertText}.`,
        "Credentials were not logged.",
      ].join(" "),
    );
  }
}
