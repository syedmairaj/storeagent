import { expect, test } from "@playwright/test";

import { STORY_STAGE_DURATION_MS } from "@/components/marketing/decision-story-playback";

/**
 * Landing V1.2.2 closeout — no auth. Run with:
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:3011 \
 *   npx playwright test tests/e2e/marketing-landing-v122.spec.ts --project=marketing-landing
 */

async function settle(page: import("@playwright/test").Page) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))));
}

test.describe("Landing V1.2.2 decision story", () => {
  test("two-cycle autoplay, hold Review, Replay restarts", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.clock.install();
    await page.goto("/");
    await page.mouse.move(2, 2);

    const story = page.locator("#demo [data-story-stage]");
    await expect(story).toHaveAttribute("data-story-stage", "0");
    await expect(story).toHaveAttribute("data-story-cycle", "0");
    await expect(story).toHaveAttribute("data-story-mode", "auto");

    // Advance one dwell at a time so React can reschedule the next timeout
    // after each commit (bulk fastForward misses chained setTimeouts).
    const advanceStage = async (from: string, to: string) => {
      const idx = Number(from);
      await page.clock.fastForward(STORY_STAGE_DURATION_MS[idx]!);
      await expect(story).toHaveAttribute("data-story-stage", to);
    };

    // Cycle 0 → through Review then restart
    await advanceStage("0", "1");
    await advanceStage("1", "2");
    await advanceStage("2", "3");
    await advanceStage("3", "0");
    await expect(story).toHaveAttribute("data-story-cycle", "1");

    // Cycle 1 → complete on Review (last advance holds)
    await advanceStage("0", "1");
    await advanceStage("1", "2");
    await advanceStage("2", "3");
    await page.clock.fastForward(STORY_STAGE_DURATION_MS[3]!);
    await expect(story).toHaveAttribute("data-story-mode", "complete");
    await expect(story).toHaveAttribute("data-story-stage", "3");
    await expect(story).toHaveAttribute("data-story-playing", "0");

    // Further time must not advance
    await page.clock.fastForward(20_000);
    await expect(story).toHaveAttribute("data-story-stage", "3");
    await expect(story).toHaveAttribute("data-story-mode", "complete");

    await page
      .getByRole("group", { name: "Hero decision story playback" })
      .getByRole("button", { name: "Replay story", exact: true })
      .click();
    await expect(story).toHaveAttribute("data-story-stage", "0");
    await expect(story).toHaveAttribute("data-story-cycle", "0");
    await expect(story).toHaveAttribute("data-story-mode", "auto");
  });

  test("manual next cancels autoplay until Play", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.clock.install();
    await page.goto("/");
    await page.mouse.move(2, 2);

    const story = page.locator("#demo [data-story-stage]");
    await page
      .getByRole("group", { name: "Hero decision story playback" })
      .getByRole("button", { name: "Next stage", exact: true })
      .click();
    await expect(story).toHaveAttribute("data-story-stage", "1");
    await expect(story).toHaveAttribute("data-story-mode", "manual");

    await page.clock.fastForward(20_000);
    await expect(story).toHaveAttribute("data-story-stage", "1");

    await page
      .getByRole("group", { name: "Hero decision story playback" })
      .getByRole("button", { name: "Play story", exact: true })
      .click();
    await settle(page);
    await page.clock.fastForward(STORY_STAGE_DURATION_MS[1]);
    await expect(story).toHaveAttribute("data-story-stage", "2");
  });

  test("hover pauses autoplay", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.clock.install();
    await page.goto("/");
    await page.mouse.move(2, 2);

    const story = page.locator("#demo [data-story-stage]");
    const canvas = page.locator("#demo [aria-live='polite']");
    await canvas.hover();
    await expect(story).toHaveAttribute("data-story-playing", "0");
    await page.clock.fastForward(STORY_STAGE_DURATION_MS[0] + 1000);
    await expect(story).toHaveAttribute("data-story-stage", "0");
  });

  test("focus on canvas pauses autoplay", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.clock.install();
    await page.goto("/");
    await page.mouse.move(2, 2);

    const story = page.locator("#demo [data-story-stage]");
    await page.locator("#demo [aria-live='polite']").evaluate((el) => {
      (el as HTMLElement).tabIndex = -1;
      (el as HTMLElement).focus();
    });
    await expect(story).toHaveAttribute("data-story-playing", "0");
    await page.clock.fastForward(STORY_STAGE_DURATION_MS[0] + 1000);
    await expect(story).toHaveAttribute("data-story-stage", "0");
  });

  test("hidden tab pauses autoplay", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.clock.install();
    await page.goto("/");
    await page.mouse.move(2, 2);

    const story = page.locator("#demo [data-story-stage]");
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "hidden",
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(story).toHaveAttribute("data-story-playing", "0");
    await page.clock.fastForward(STORY_STAGE_DURATION_MS[0] + 1000);
    await expect(story).toHaveAttribute("data-story-stage", "0");
  });

  test("offscreen pauses autoplay", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.clock.install();
    await page.goto("/");
    await page.mouse.move(2, 2);

    const story = page.locator("#demo [data-story-stage]");
    await page.locator("#control").scrollIntoViewIfNeeded();
    await expect(story).toHaveAttribute("data-story-playing", "0");
    await page.clock.fastForward(STORY_STAGE_DURATION_MS[0] + 1000);
    await expect(story).toHaveAttribute("data-story-stage", "0");
  });

  test("mobile never autoplays", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.clock.install();
    await page.goto("/");

    const story = page.locator("#demo [data-story-stage]");
    await page.clock.fastForward(30_000);
    await expect(story).toHaveAttribute("data-story-stage", "0");
    await expect(
      page.getByRole("button", {
        name: "Autoplay unavailable — use next and previous",
      }),
    ).toBeDisabled();
  });

  test("reduced-motion never autoplays", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.clock.install();
    await page.goto("/");

    const story = page.locator("#demo [data-story-stage]");
    await page.clock.fastForward(30_000);
    await expect(story).toHaveAttribute("data-story-stage", "0");
  });

  test("Four Decisions explorer is scoped and manual", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    const explorer = page.locator("#four-decisions-explorer");
    await explorer.scrollIntoViewIfNeeded();
    await explorer.getByRole("tab", { name: /^Reduce/ }).click();
    await expect(explorer.locator("#decision-panel h3")).toHaveText(
      /Harbor Trail Mix/,
    );

    await page.waitForTimeout(2500);
    await expect(explorer.locator("#decision-panel h3")).toHaveText(
      /Harbor Trail Mix/,
    );

    await expect(page.locator('#demo [role="tablist"]')).toHaveAttribute(
      "aria-label",
      "Hero decision story scenarios",
    );
    await expect(explorer.locator('[role="tablist"]')).toHaveAttribute(
      "aria-label",
      "Compare inventory decisions",
    );
  });

  test("hero and explorer keyboard groups are distinguishable", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    await expect(
      page.getByRole("group", { name: "Hero decision story playback" }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Four decisions comparison explorer" }),
    ).toBeVisible();

    const explorer = page.locator("#four-decisions-explorer");
    await explorer.scrollIntoViewIfNeeded();
    await explorer.getByRole("tab", { name: /^Reorder/ }).focus();
    await page.keyboard.press("ArrowDown");
    await expect(
      explorer.getByRole("tab", { name: /^Reduce/ }),
    ).toHaveAttribute("aria-selected", "true");
  });

  test("five section anchors and CTAs resolve", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    for (const id of ["demo", "problem", "decisions", "impact", "control"]) {
      await expect(page.locator(`#${id}`)).toBeVisible();
    }

    await expect(
      page.getByRole("button", { name: "Sign In" }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Password sign-in" }).first(),
    ).toBeVisible();
    await expect(page.locator('a[href="#demo"]').first()).toBeVisible();

    await page.getByRole("button", { name: "Sign In" }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Continue with Google" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Send magic link" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Continue with Google" }),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    const resLogin = await page.request.get("/login");
    expect(resLogin.ok()).toBeTruthy();
  });

  test("Problem↔Solution stays put without auto-rotation", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.clock.install();
    await page.goto("/#problem");

    const panel = page.locator("#problem");
    await panel.getByRole("button", { name: /Missing information/ }).click();
    await expect(panel.getByText("Clear action: Watch")).toBeVisible();
    await page.clock.fastForward(15_000);
    await expect(panel.getByText("Clear action: Watch")).toBeVisible();
  });
});
