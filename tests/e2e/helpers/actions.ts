import fs from "node:fs";
import path from "node:path";

import {
  expect,
  type Locator,
  type Page,
  type TestInfo,
} from "@playwright/test";

import {
  ARTIFACTS_DIR,
  AUTH_CONTEXT_PATH,
} from "./env";

import {
  assertMinTouchTarget,
  boxesOverlap,
  documentHasHorizontalOverflow,
  getBox,
  isNextJsDevToolsOverlay,
} from "./geometry";

export type AuthContext = {
  organizationId: string;
  actionsPath: string;
};

export function readAuthContext(): AuthContext {
  if (
    !fs.existsSync(AUTH_CONTEXT_PATH)
  ) {
    throw new Error(
      `Missing ${AUTH_CONTEXT_PATH}. Run auth setup first.`,
    );
  }

  const raw = JSON.parse(
    fs.readFileSync(AUTH_CONTEXT_PATH, "utf8"),
  ) as AuthContext;

  if (
    !raw.organizationId ||
    !raw.actionsPath
  ) {
    throw new Error(
      "Auth context incomplete — organization membership not captured.",
    );
  }

  return raw;
}

export async function openActionsPage(
  page: Page,
): Promise<AuthContext> {
  const ctx = readAuthContext();
  await page.goto(ctx.actionsPath, {
    waitUntil: "domcontentloaded",
  });

  await expect(
    page.locator(
      '[data-actions-synthetic-banner="true"]',
    ),
  ).toBeVisible();

  await expect(
    page.getByRole("heading", {
      name: /decision queue/i,
    }),
  ).toBeVisible();

  await expect(
    page.locator(
      '[data-actions-decision-queue="true"]',
    ),
  ).toBeVisible();

  return ctx;
}

export function queueRows(
  page: Page,
): Locator {
  return page.locator(
    '[data-actions-queue-row="true"]',
  );
}

export function filterChip(
  page: Page,
  label: string,
): Locator {
  return page
    .getByRole("toolbar", {
      name: /filter decisions by type/i,
    })
    .getByRole("button", {
      name: new RegExp(label, "i"),
    });
}

export async function captureViewportShot(
  page: Page,
  testInfo: TestInfo,
  name: string,
): Promise<string> {
  const project =
    testInfo.project.name.replace(
      /[^\w.-]+/g,
      "_",
    );
  const dir = path.join(
    ARTIFACTS_DIR,
    project,
  );
  fs.mkdirSync(dir, {
    recursive: true,
  });
  const file = path.join(
    dir,
    `${name}.png`,
  );
  await page.screenshot({
    path: file,
    fullPage: false,
  });
  await testInfo.attach(
    `${project}-${name}`,
    {
      path: file,
      contentType: "image/png",
    },
  );
  return file;
}

export function layoutMode(
  width: number,
): "mobile" | "tablet" | "desktop" {
  if (
    width < 768
  ) {
    return "mobile";
  }
  if (
    width < 1280
  ) {
    return "tablet";
  }
  return "desktop";
}

export async function assertNoAppHorizontalOverflow(
  page: Page,
): Promise<void> {
  expect(
    await documentHasHorizontalOverflow(page),
  ).toBe(false);
}

export async function assertBannerDoesNotCover(
  page: Page,
  target: Locator,
): Promise<void> {
  const banner = page.locator(
    '[data-actions-synthetic-banner="true"]',
  );
  const bannerBox = await getBox(banner);
  const targetBox = await getBox(target);

  if (
    !bannerBox ||
    !targetBox
  ) {
    return;
  }

  // Only assert when both are in the viewport and target is near the top.
  if (
    targetBox.y > bannerBox.y + bannerBox.height + 8
  ) {
    return;
  }

  expect(
    boxesOverlap(bannerBox, targetBox),
  ).toBe(false);
}

export async function assertNoMeaningfulAppOverlap(
  page: Page,
  a: Locator,
  b: Locator,
): Promise<void> {
  const boxA = await getBox(a);
  const boxB = await getBox(b);
  if (
    !boxA ||
    !boxB
  ) {
    return;
  }

  if (
    !boxesOverlap(boxA, boxB)
  ) {
    return;
  }

  const toolingA =
    await isNextJsDevToolsOverlay(page, boxA);
  const toolingB =
    await isNextJsDevToolsOverlay(page, boxB);

  if (
    toolingA ||
    toolingB
  ) {
    return;
  }

  throw new Error(
    "Meaningful application element overlap detected (excluding Next.js Dev Tools).",
  );
}

export async function assertFilterTouchTargets(
  page: Page,
): Promise<void> {
  const chips = page
    .getByRole("toolbar", {
      name: /filter decisions by type/i,
    })
    .getByRole("button");

  const count = await chips.count();
  expect(count).toBeGreaterThan(0);

  // Sample first visible chip — horizontal scroller may clip others.
  for (
    let i = 0;
    i < Math.min(count, 3);
    i += 1
  ) {
    const chip = chips.nth(i);
    if (
      await chip.isVisible()
    ) {
      await assertMinTouchTarget(chip, 44);
    }
  }
}

export async function selectQueueRowByType(
  page: Page,
  actionType: "REORDER" | "WATCH",
  index = 0,
): Promise<Locator> {
  const typedRow = page
    .locator(
      `[data-actions-queue-row="true"][data-action-type="${actionType}"]`,
    )
    .nth(index);

  await expect(typedRow).toBeVisible();
  await typedRow.click();
  await expect(typedRow).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  return typedRow;
}

export async function scrollBriefToBottom(
  page: Page,
  mode: "mobile" | "tablet" | "desktop",
): Promise<void> {
  if (
    mode === "desktop"
  ) {
    const scroller = page.locator(
      '[data-actions-brief-scroll="true"]',
    );
    await expect(scroller).toBeVisible();
    await scroller.evaluate(
      (el) => {
        el.scrollTop = el.scrollHeight;
      },
    );
    return;
  }

  if (
    mode === "mobile"
  ) {
    const scroller = page.locator(
      '[data-actions-sheet-scroll="true"]',
    );
    await expect(scroller).toBeVisible();
    await scroller.evaluate(
      (el) => {
        el.scrollTop = el.scrollHeight;
      },
    );
    return;
  }

  // Tablet: page owns scroll; ensure technical details in view.
  await page
    .getByText("Technical details")
    .first()
    .scrollIntoViewIfNeeded();
}
