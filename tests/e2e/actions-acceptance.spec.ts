import {
  expect,
  test,
} from "@playwright/test";

import {
  assertBannerDoesNotCover,
  assertFilterTouchTargets,
  assertNoAppHorizontalOverflow,
  assertNoMeaningfulAppOverlap,
  captureViewportShot,
  filterChip,
  layoutMode,
  openActionsPage,
  queueRows,
  scrollBriefToBottom,
  selectQueueRowByType,
} from "./helpers/actions";

import {
  assertMinTouchTarget,
} from "./helpers/geometry";

test.describe(
  "Actions R1/R2.a acceptance",
  () => {
    test(
      "responsive queue, filters, brief/sheet behaviors",
      async ({
        page,
      }, testInfo) => {
        const viewport =
          page.viewportSize();
        expect(viewport).toBeTruthy();
        const width =
          viewport!.width;
        const mode =
          layoutMode(width);

        await openActionsPage(page);

        // Banner + layout
        const banner = page.locator(
          '[data-actions-synthetic-banner="true"]',
        );
        await expect(banner).toContainText(
          /synthetic demonstration data/i,
        );
        await expect(banner).toContainText(
          /not live inventory/i,
        );

        await assertNoAppHorizontalOverflow(
          page,
        );
        await captureViewportShot(
          page,
          testInfo,
          "01-queue-overview",
        );

        // Queue rows readable/interactable
        const rows = queueRows(page);
        await expect(rows).toHaveCount(5);
        await expect(
          page.locator(
            '[data-actions-queue-row="true"][data-action-type="REORDER"] [data-actions-queue-qty="true"]',
          ),
        ).toBeVisible();
        await expect(
          page.locator(
            '[data-actions-queue-row="true"][data-action-type="WATCH"] [data-actions-queue-watch="true"]',
          ).first(),
        ).toContainText(
          /incomplete evidence — watch only/i,
        );

        // Filter membership / counts / selected state
        const allChip = filterChip(
          page,
          "All actions",
        );
        await expect(allChip).toContainText(
          "5",
        );
        await expect(
          filterChip(page, "Reorder"),
        ).toContainText("1");
        await expect(
          filterChip(page, "Reduce"),
        ).toContainText("1");
        await expect(
          filterChip(page, "Promote"),
        ).toContainText("1");
        await expect(
          filterChip(page, "Watch"),
        ).toContainText("2");
        await expect(
          filterChip(page, "Healthy"),
        ).toContainText("1");

        await assertFilterTouchTargets(page);

        await filterChip(
          page,
          "Reorder",
        ).click();
        await expect(
          queueRows(page),
        ).toHaveCount(1);
        await expect(
          filterChip(page, "Reorder"),
        ).toHaveAttribute(
          "aria-pressed",
          "true",
        );

        await filterChip(
          page,
          "Healthy",
        ).click();
        await expect(
          page.locator(
            '[data-actions-healthy-skim="true"]',
          ),
        ).toBeVisible();
        await expect(
          queueRows(page),
        ).toHaveCount(0);
        await expect(
          page.getByText(
            /healthy — no intervention/i,
          ),
        ).toBeVisible();

        await filterChip(
          page,
          "All actions",
        ).click();
        await expect(
          queueRows(page),
        ).toHaveCount(5);

        // Select REORDER
        const reorderRow =
          await selectQueueRowByType(
            page,
            "REORDER",
          );
        await assertMinTouchTarget(
          reorderRow,
          44,
        );
        await assertBannerDoesNotCover(
          page,
          reorderRow,
        );

        if (
          mode === "mobile"
        ) {
          const sheet = page.getByRole(
            "dialog",
            {
              name: /decision brief/i,
            },
          );
          await expect(sheet).toBeVisible();
          await expect(
            page.locator(
              '[data-actions-sheet-scroll="true"]',
            ),
          ).toBeVisible();

          const closeBtn = sheet
            .getByRole("button", {
              name: /close decision detail/i,
            })
            .last();
          await assertMinTouchTarget(
            closeBtn,
            44,
          );

          await expect(
            sheet.getByText(
              /recommended quantity/i,
            ),
          ).toBeVisible();

          await captureViewportShot(
            page,
            testInfo,
            "02-reorder-detail",
          );

          await scrollBriefToBottom(
            page,
            "mobile",
          );
          await expect(
            sheet.getByText(
              "Technical details",
            ),
          ).toBeVisible();
          await expect(
            sheet.getByText(
              /local demo controls/i,
            ),
          ).toBeVisible();
          await captureViewportShot(
            page,
            testInfo,
            "03-reorder-brief-bottom",
          );

          // Focus restoration: close via Esc
          await page.keyboard.press(
            "Escape",
          );
          await expect(sheet).toHaveCount(0);
          await expect(
            reorderRow,
          ).toBeFocused();

          // Reopen and close via close control
          await reorderRow.click();
          await expect(
            page.getByRole("dialog"),
          ).toBeVisible();
          await page
            .getByRole("dialog")
            .getByRole("button", {
              name: /close decision detail/i,
            })
            .last()
            .click();
          await expect(
            page.getByRole("dialog"),
          ).toHaveCount(0);
          await expect(
            reorderRow,
          ).toBeFocused();

          // Backdrop close — click the dimmed area above the bottom sheet
          // (the full-screen backdrop button is mostly covered by the sheet panel).
          await reorderRow.click();
          await expect(
            page.getByRole("dialog"),
          ).toBeVisible();
          const vp = page.viewportSize();
          expect(vp).toBeTruthy();
          await page.mouse.click(
            Math.floor(vp!.width / 2),
            16,
          );
          await expect(
            page.getByRole("dialog"),
          ).toHaveCount(0);

          // WATCH sheet
          const watchRow =
            await selectQueueRowByType(
              page,
              "WATCH",
            );
          await expect(
            page.getByRole("dialog"),
          ).toBeVisible();
          await expect(
            page.getByRole("dialog").getByText(
              /uncertainty|incomplete|watch/i,
            ).first(),
          ).toBeVisible();
          await captureViewportShot(
            page,
            testInfo,
            "04-watch-detail",
          );
          await page.keyboard.press(
            "Escape",
          );
          await expect(
            watchRow,
          ).toBeFocused();
        }

        if (
          mode === "tablet"
        ) {
          // Inline stacked brief — desktop shell + contained scroller may remain
          // in DOM under `hidden xl:block` (intentional CSS retention), but must
          // not be visible or layout-active. Active brief is flow (no visible
          // data-actions-brief-scroll).
          await expect(
            page.getByRole("dialog"),
          ).toHaveCount(0);

          const desktopShell = page.locator(
            '[data-actions-inspector-shell="true"]',
          );
          await expect(desktopShell).toBeHidden();
          await expect(
            page.locator(
              '[data-actions-brief-scroll="true"]',
            ),
          ).toBeHidden();
          await expect(
            page.locator(
              '[data-actions-brief-scroll="true"]:visible',
            ),
          ).toHaveCount(0);

          const brief = page
            .getByRole("article", {
              name: /decision brief/i,
            })
            .filter({
              visible: true,
            })
            .first();
          await expect(brief).toBeVisible();

          const shellBox =
            await desktopShell.boundingBox();
          const briefBox =
            await brief.boundingBox();
          expect(shellBox).toBeNull();
          expect(briefBox).not.toBeNull();
          // Stacked: brief sits in document flow under the queue, not a side split.
          expect(briefBox!.y).toBeGreaterThan(80);

          await expect(
            brief.getByText(
              /recommended quantity/i,
            ),
          ).toBeVisible();
          await captureViewportShot(
            page,
            testInfo,
            "02-reorder-detail",
          );

          await scrollBriefToBottom(
            page,
            "tablet",
          );
          await expect(
            brief.getByText(
              "Technical details",
            ),
          ).toBeVisible();
          await captureViewportShot(
            page,
            testInfo,
            "03-reorder-brief-bottom",
          );

          await selectQueueRowByType(
            page,
            "WATCH",
          );
          await expect(
            page
              .getByRole("article", {
                name: /decision brief/i,
              })
              .getByText(
                /uncertainty|incomplete|watch/i,
              )
              .first(),
          ).toBeVisible();
          await captureViewportShot(
            page,
            testInfo,
            "04-watch-detail",
          );
        }

        if (
          mode === "desktop"
        ) {
          const shell = page.locator(
            '[data-actions-inspector-shell="true"]',
          );
          const briefScroll = page.locator(
            '[data-actions-brief-scroll="true"]',
          );
          await expect(shell).toBeVisible();
          await expect(
            briefScroll,
          ).toBeVisible();
          await expect(
            page.getByRole("dialog"),
          ).toHaveCount(0);

          const brief = page.getByRole(
            "article",
            {
              name: /decision brief/i,
            },
          );
          await expect(
            brief.getByText(
              /recommended quantity/i,
            ),
          ).toBeVisible();

          await assertBannerDoesNotCover(
            page,
            brief,
          );
          await assertNoMeaningfulAppOverlap(
            page,
            banner,
            brief,
          );

          await captureViewportShot(
            page,
            testInfo,
            "02-reorder-detail",
          );

          // Scroll to bottom — qty editor, demo controls, technical details
          await scrollBriefToBottom(
            page,
            "desktop",
          );

          const decrease = brief.getByRole(
            "button",
            {
              name: /decrease quantity/i,
            },
          );
          await expect(decrease).toBeVisible();
          await decrease.scrollIntoViewIfNeeded();
          await expect(
            brief.locator(
              'input[inputmode="numeric"]',
            ),
          ).toBeVisible();
          await expect(
            brief.getByText(
              /local demo controls/i,
            ),
          ).toBeVisible();
          await expect(
            brief.getByText(
              "Technical details",
            ),
          ).toBeVisible();

          const scrollTopBefore =
            await briefScroll.evaluate(
              (el) => el.scrollTop,
            );
          expect(scrollTopBefore).toBeGreaterThan(
            0,
          );

          await captureViewportShot(
            page,
            testInfo,
            "03-reorder-brief-bottom",
          );

          // Selection change resets brief scroll
          await selectQueueRowByType(
            page,
            "WATCH",
          );
          await expect(
            briefScroll,
          ).toBeVisible();

          await expect
            .poll(async () =>
              briefScroll.evaluate(
                (el) => el.scrollTop,
              ),
            )
            .toBe(0);

          await expect(
            brief.getByText(
              /uncertainty|incomplete|watch|grounded signals/i,
            ).first(),
          ).toBeVisible();
          await captureViewportShot(
            page,
            testInfo,
            "04-watch-detail",
          );

          await scrollBriefToBottom(
            page,
            "desktop",
          );
          await expect(
            brief.getByText(
              "Technical details",
            ),
          ).toBeVisible();
        }
      },
    );
  },
);
