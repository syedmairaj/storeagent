import {
  expect,
  type Page,
} from "@playwright/test";

import {
  assertExistingLocalAuthUser,
} from "./local-auth-preflight";
import {
  assertLocalAcceptanceStack,
  redactAuthUrl,
} from "./local-stack";
import {
  waitForMagicLinkEmail,
} from "./mailpit";

/**
 * Drive StoreAgent's real magic-link UI once, retrieve the matching Mailpit
 * message, and navigate ONCE in this Playwright context (PKCE).
 *
 * Never GETs/HEADs the verify URL outside Playwright.
 * Does not retry consumed OTPs.
 */
export async function authenticateWithMagicLink(input: {
  page: Page;
  email: string;
}): Promise<{
  messageId: string;
  landedPath: string;
}> {
  assertLocalAcceptanceStack();

  const email = input.email.trim().toLowerCase();
  if (
    !email ||
    !email.includes("@")
  ) {
    throw new Error(
      "E2E auth BLOCKED: E2E_EMAIL/M14_TEST_EMAIL missing or invalid.",
    );
  }

  // Fail closed before OTP issuance when identity is absent (avoids local signup create).
  assertExistingLocalAuthUser(email);

  const { page } = input;

  await page.goto("/login?next=/app", {
    waitUntil: "domcontentloaded",
  });

  await expect(
    page.getByRole("heading", {
      name: /welcome to storeagent/i,
    }),
  ).toBeVisible();

  const emailField = page.locator(
    'input[name="email"]',
  );
  await emailField.fill(email);

  const requestStartedAt = Date.now();
  await page
    .getByRole("button", {
      name: /^send magic link$/i,
    })
    .click();

  await expect(
    page.getByText(
      /check your email for a secure sign-in link/i,
    ),
  ).toBeVisible({
    timeout: 30_000,
  });

  const captured = await waitForMagicLinkEmail({
    recipientEmail: email,
    afterMs: requestStartedAt,
  });

  // Single navigation in the same browser context that requested the OTP.
  let verifyConsumed = false;
  try {
    await page.goto(captured.verifyUrl, {
      waitUntil: "domcontentloaded",
      timeout: 45_000,
    });
    verifyConsumed = true;
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "verify navigation failed";
    throw new Error(
      `E2E auth BLOCKED: Playwright verify navigation failed (${redactAuthUrl(message)}). Do not retry the same OTP.`,
    );
  }

  if (
    !verifyConsumed
  ) {
    throw new Error(
      "E2E auth BLOCKED: verify URL was not consumed exactly once.",
    );
  }

  await page
    .waitForURL(
      (url) => {
        const path = url.pathname;
        return (
          path.startsWith("/app") ||
          /auth_error=/.test(url.search) ||
          path === "/" ||
          path.startsWith("/login")
        );
      },
      {
        timeout: 45_000,
      },
    )
    .catch(() => {
      // Classification happens by caller.
    });

  return {
    messageId: captured.messageId,
    landedPath: new URL(page.url()).pathname,
  };
}
