import { expect, test } from "@playwright/test";

/**
 * Narrow FE-ACCEPT-1 regression: landing Sign In modal must open without
 * React hydration / console errors. Public surface — no auth credentials.
 */
test.describe("Landing auth modal hydration", () => {
  test("Sign In opens dialog without hydration console errors", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      consoleErrors.push(msg.text());
    });

    page.on("pageerror", (err) => {
      consoleErrors.push(String(err));
    });

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/", { waitUntil: "domcontentloaded" });

    await page.getByRole("button", { name: /^Sign In$/i }).first().click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("heading", { name: /welcome to storeagent/i }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: /send magic link/i }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("link", { name: /use password instead/i }),
    ).toHaveAttribute("href", "/login?mode=password");
    await expect(
      dialog.getByRole("button", { name: /continue with google/i }),
    ).toBeDisabled();

    const hydrationHits = consoleErrors.filter((text) =>
      /hydrat|server HTML|did not expect|minmax mismatch|Text content does not match/i.test(
        text,
      ),
    );

    expect(hydrationHits, hydrationHits.join("\n---\n")).toEqual([]);
  });
});
