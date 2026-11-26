import {
  expect,
  test,
  type Page,
} from "@playwright/test";

import {
  captureViewportShot,
  openActionsPage,
  readAuthContext,
} from "./helpers/actions";
import {
  assertWrongOrgDenied,
} from "./helpers/org-contract";

/**
 * Merchant FE acceptance — requires auth.setup magic-link (or password) state.
 * Does not mutate Auth DB, membership, onboarding, CSV imports, OAuth, or SyncRun.
 */
test.describe(
  "Merchant FE-ACCEPT-1C acceptance",
  () => {
    test(
      "session, org isolation, overview, inventory, actions honesty",
      async ({
        page,
      }, testInfo) => {
        const ctx = readAuthContext();
        const consoleErrors: string[] = [];
        page.on("console", (msg) => {
          if (
            msg.type() === "error"
          ) {
            const text = msg.text();
            if (
              /Failed to load resource|net::ERR_/i.test(
                text,
              )
            ) {
              return;
            }
            consoleErrors.push(text.slice(0, 200));
          }
        });

        // Authenticated session via storageState
        await page.goto("/app", {
          waitUntil: "domcontentloaded",
        });
        await expect(page).not.toHaveURL(
          /\/login/,
        );
        await expect(page).not.toHaveURL(
          /auth_error=/,
        );

        // Authorized org overview
        await page.goto(
          `/app/${ctx.organizationId}`,
          {
            waitUntil: "domcontentloaded",
          },
        );
        await expect(page).not.toHaveURL(
          /tenant_error=organization_access_denied/,
        );
        await expect(page).not.toHaveURL(
          /\/app\/onboarding/,
        );

        // Overview landmark — avoid hidden responsive nav "Overview" link.
        const overview = page.locator(
          '[data-merchant-overview="true"]',
        );
        await expect(overview).toBeVisible({
          timeout: 20_000,
        });
        await expect(
          overview.locator(
            '[data-overview-headline="true"]',
          ),
        ).toBeVisible();
        await expect(
          overview.getByRole("region", {
            name: /inventory attention and data health/i,
          }),
        ).toBeVisible();
        await expect(
          overview.locator(
            '[data-overview-evidence-honesty="true"]',
          ),
        ).toBeVisible();

        await expect(
          overview.locator(
            '[data-synthetic-actions="true"]',
          ),
        ).toBeVisible();
        await expect(
          overview.locator(
            '[data-synthetic-actions-note="true"]',
          ),
        ).toBeVisible();
        await expect(
          overview.locator(
            '[data-synthetic-actions="true"]',
          ),
        ).toContainText(
          /synthetic actions demo/i,
        );

        await captureViewportShot(
          page,
          testInfo,
          "merchant-overview",
        );

        // Session persistence across refresh
        await page.reload({
          waitUntil: "domcontentloaded",
        });
        await expect(page).not.toHaveURL(
          /\/login/,
        );
        await expect(
          page.locator(
            '[data-merchant-overview="true"]',
          ),
        ).toBeVisible();

        // Wrong-org denial, then return
        await assertWrongOrgDenied(page);
        await page.goto(
          `/app/${ctx.organizationId}`,
          {
            waitUntil: "domcontentloaded",
          },
        );
        await expect(
          page.locator(
            '[data-merchant-overview="true"]',
          ),
        ).toBeVisible();

        // Inventory workspace
        await page.goto(
          `/app/${ctx.organizationId}/inventory`,
          {
            waitUntil: "domcontentloaded",
          },
        );
        await expect(page).not.toHaveURL(
          /\/app\/onboarding/,
        );

        await expect(
          page.getByRole("heading", {
            level: 1,
            name: /^Inventory$/,
          }),
        ).toBeVisible({
          timeout: 20_000,
        });

        const evidence = page.locator(
          '[data-inventory-evidence="true"]',
        );
        await expect(evidence).toBeVisible();

        await assertInventoryEvidenceState(
          page,
        );

        // Replenishment 7/5/7 policy fields (lead / safety / review)
        const replenishment = page.locator(
          '[data-replenishment-settings="true"]',
        );
        await expect(replenishment).toBeVisible({
          timeout: 15_000,
        });
        await expect(
          replenishment.locator(
            "#lead-time-days",
          ),
        ).toHaveValue("7");
        await expect(
          replenishment.locator(
            "#safety-stock-days",
          ),
        ).toHaveValue("5");
        await expect(
          replenishment.locator(
            "#review-period-days",
          ),
        ).toHaveValue("7");

        // Incoming evidence — unknown must not be treated as zero quantity
        const incoming = page.locator(
          '[data-incoming-evidence="true"]',
        );
        await expect(incoming).toBeVisible();
        const incomingKind =
          await incoming.getAttribute(
            "data-incoming-org-kind",
          );
        expect(
          incomingKind,
          "incoming org attestation kind missing",
        ).toMatch(
          /^(unknown|incomplete|verified_zero|recorded_incoming)$/,
        );
        if (
          incomingKind === "unknown" ||
          incomingKind === "incomplete"
        ) {
          await expect(
            incoming.locator(
              '[data-incoming-org-status="true"]',
            ),
          ).toBeVisible();
          await expect(
            incoming.locator(
              '[data-incoming-org-status-label="true"]',
            ),
          ).toContainText(/unknown|incomplete|not confirmed/i);
        }

        await captureViewportShot(
          page,
          testInfo,
          "merchant-inventory",
        );

        // Synthetic Actions + disabled production writes
        await openActionsPage(page);
        const actionsBanner = page.locator(
          '[data-actions-synthetic-banner="true"]',
        );
        await expect(actionsBanner).toContainText(
          /synthetic demonstration data/i,
        );
        await expect(actionsBanner).toContainText(
          /not live inventory/i,
        );
        await captureViewportShot(
          page,
          testInfo,
          "merchant-actions",
        );

        // Gated surfaces must remain absent from this suite
        await expect(page).not.toHaveURL(
          /oauth|sync-run|\/ai\//i,
        );

        await expect(
          page.locator("main"),
        ).toBeVisible();

        const hydrationHits =
          consoleErrors.filter((line) =>
            /hydration|Minified React error/i.test(
              line,
            ),
          );
        expect(
          hydrationHits,
          hydrationHits.join(" | "),
        ).toHaveLength(0);
      },
    );
  },
);

/**
 * Deterministic inventory evidence: populated | empty | error.
 * No ambiguous .or() unions across heading + table.
 */
async function assertInventoryEvidenceState(
  page: Page,
): Promise<"populated" | "empty" | "error"> {
  const evidence = page.locator(
    '[data-inventory-evidence="true"]',
  );
  const workspace = evidence.locator(
    '[data-inventory-sku-attention="true"]',
  );
  const emptyHeading = evidence.getByRole(
    "heading",
    {
      name: /no inventory observations yet/i,
    },
  );
  const errorBanner = evidence.locator(
    '[data-inventory-error="true"], [role="alert"]',
  );

  await expect
    .poll(
      async () => {
        if (
          await workspace.isVisible().catch(() => false)
        ) {
          return "populated";
        }
        if (
          await emptyHeading
            .isVisible()
            .catch(() => false)
        ) {
          return "empty";
        }
        if (
          await errorBanner
            .isVisible()
            .catch(() => false)
        ) {
          return "error";
        }
        return "pending";
      },
      {
        timeout: 20_000,
      },
    )
    .not.toBe("pending");

  if (
    await emptyHeading.isVisible().catch(() => false)
  ) {
    await expect(emptyHeading).toBeVisible();
    await expect(evidence).toContainText(
      /import a csv/i,
    );
    await expect(workspace).toHaveCount(0);
    return "empty";
  }

  if (
    await errorBanner.isVisible().catch(() => false) &&
    !(await workspace.isVisible().catch(() => false))
  ) {
    await expect(errorBanner.first()).toBeVisible();
    throw new Error(
      "Inventory evidence surfaced an error/alert without SKU workspace — treat as product defect if unexpected.",
    );
  }

  await expect(workspace).toBeVisible();
  await expect(
    evidence.getByRole("heading", {
      level: 2,
      name: /^SKU evidence$/,
    }),
  ).toBeVisible();

  await expect(
    workspace.getByRole("toolbar", {
      name: /stock review filters/i,
    }),
  ).toBeVisible();

  const viewport = page.viewportSize();
  const width = viewport?.width ?? 1280;
  // Product: cards below md, table at md+ (see inventory-intelligence-workspace).
  const useCards = width < 768;

  let positionCount = 0;
  if (
    useCards
  ) {
    const cards = workspace.locator(
      '[data-responsive-inventory-cards="true"]',
    );
    await expect(cards).toBeVisible();
    const cardItems = cards.locator(
      '[data-sku-attention-card="true"]',
    );
    await expect(cardItems.first()).toBeVisible();
    positionCount = await cardItems.count();
    expect(positionCount).toBeGreaterThan(0);
    // Table shell remains in DOM but intentionally hidden on narrow viewports.
    await expect(
      workspace.locator(
        '[data-responsive-inventory-table="true"]',
      ),
    ).toBeHidden();
  } else {
    const tableShell = workspace.locator(
      '[data-responsive-inventory-table="true"]',
    );
    await expect(tableShell).toBeVisible();
    const table = tableShell.locator("table");
    await expect(table).toBeVisible();
    await expect(
      table.getByRole("columnheader", {
        name: /SKU \/ product/i,
      }),
    ).toBeVisible();
    const dataRows = table.locator(
      "tbody tr",
    );
    await expect(dataRows.first()).toBeVisible();
    positionCount = await dataRows.count();
    expect(positionCount).toBeGreaterThan(0);
    await expect(
      workspace.locator(
        '[data-responsive-inventory-cards="true"]',
      ),
    ).toBeHidden();
  }

  await expect(
    workspace.locator(
      '[data-inventory-visible-count="true"]',
    ),
  ).toContainText(
    new RegExp(
      `${positionCount}\\s+of\\s+\\d+\\s+positions`,
    ),
  );

  // Stock evidence honesty for stale observations when banner present
  const stale = workspace.locator(
    '[data-inventory-stale-banner="true"]',
  );
  if (
    (await stale.count()) > 0
  ) {
    await expect(stale).toContainText(
      /not live/i,
    );
  }

  const limited = workspace.locator(
    '[data-inventory-limited-history-banner="true"]',
  );
  if (
    (await limited.count()) > 0
  ) {
    await expect(limited).toContainText(
      /limited sales history/i,
    );
  }

  // SKU inspector — open first visible Inspect control (card or table)
  const inspect = workspace
    .getByRole("button", {
      name: /inspect/i,
    })
    .first();
  await expect(inspect).toBeVisible();
  await inspect.click();
  const inspector = page.locator(
    '[data-sku-inspector="true"]',
  );
  await expect(inspector).toBeVisible({
    timeout: 10_000,
  });
  await expect(
    inspector.locator(
      '[data-sku-inspector-title="true"]',
    ),
  ).toBeVisible();
  const stockCondition = inspector.locator(
    '[data-inspector-stock-condition="true"]',
  );
  if (
    (await stockCondition.count()) > 0
  ) {
    await expect(stockCondition).toBeVisible();
  }
  await page
    .getByRole("button", {
      name: /close product inspector/i,
    })
    .click();
  await expect(inspector).toBeHidden({
    timeout: 10_000,
  });

  await expect(
    workspace.locator(
      '[data-decision-eligibility-fence="true"]',
    ),
  ).toContainText(
    /commercial actions stay unauthorized/i,
  );

  return "populated";
}
