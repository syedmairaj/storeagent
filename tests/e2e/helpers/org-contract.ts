import {
  expect,
  type Page,
} from "@playwright/test";

import { resolveOptionalOrgId } from "./env";

export type OrgContractCode =
  | "AUTH_PASS"
  | "ORG_READY"
  | "ORG_MEMBERSHIP_BLOCKED"
  | "ROUTING_FAIL"
  | "AUTH_FAIL";

export type OrgContractResult = {
  code: OrgContractCode;
  organizationId: string | null;
  pathname: string;
  detail: string;
};

/**
 * Classify post-login /app routing without mutating onboarding or membership.
 */
export async function classifyAuthenticatedOrgState(
  page: Page,
): Promise<OrgContractResult> {
  const url = new URL(page.url());
  const pathname = url.pathname;

  if (
    /[?&]auth_error=/.test(url.search)
  ) {
    return {
      code: "AUTH_FAIL",
      organizationId: null,
      pathname,
      detail: `auth_error present on ${pathname}`,
    };
  }

  if (
    pathname.startsWith("/login")
  ) {
    return {
      code: "AUTH_FAIL",
      organizationId: null,
      pathname,
      detail: "still on /login after verify",
    };
  }

  const preferredOrgId =
    resolveOptionalOrgId();

  if (
    pathname.startsWith("/app/onboarding")
  ) {
    const heading = page.getByRole(
      "heading",
      {
        name: /set your organization context/i,
      },
    );
    const signedOut = page.getByRole(
      "button",
      {
        name: /sign out/i,
      },
    );
    const authLooking =
      (await signedOut
        .count()
        .catch(() => 0)) > 0 ||
      (await heading
        .count()
        .catch(() => 0)) > 0;

    if (
      !authLooking
    ) {
      return {
        code: "ROUTING_FAIL",
        organizationId: null,
        pathname,
        detail:
          "onboarding URL without authenticated chrome",
      };
    }

    return {
      code: "ORG_MEMBERSHIP_BLOCKED",
      organizationId: null,
      pathname,
      detail:
        "AUTH_PASS: session reached /app/onboarding (single incomplete org profile). Not snapstore-ready; harness will not auto-complete onboarding.",
    };
  }

  if (
    pathname === "/app" ||
    pathname === "/app/"
  ) {
    const noAccess = page.getByRole(
      "heading",
      {
        name: /no organization access/i,
      },
    );
    if (
      await noAccess
        .isVisible()
        .catch(() => false)
    ) {
      return {
        code: "ORG_MEMBERSHIP_BLOCKED",
        organizationId: null,
        pathname,
        detail:
          "AUTH_PASS: authenticated with zero RLS-visible organization memberships.",
      };
    }

    const picker = page.getByRole(
      "heading",
      {
        name: /choose where you want to work/i,
      },
    );
    if (
      !(await picker
        .isVisible()
        .catch(() => false))
    ) {
      return {
        code: "ROUTING_FAIL",
        organizationId: null,
        pathname,
        detail:
          "AUTH_PASS uncertain: /app without org picker or denial heading",
      };
    }

    if (
      preferredOrgId
    ) {
      const preferred = page.locator(
        `section[aria-label="Organizations"] a[href="/app/${preferredOrgId}"], section[aria-label="Organizations"] a[href^="/app/${preferredOrgId}?"]`,
      );
      const incompletePreferred = page.locator(
        `section[aria-label="Organizations"] a[href="/app/onboarding?organizationId=${preferredOrgId}"]`,
      );
      if (
        (await preferred.count()) > 0
      ) {
        return {
          code: "ORG_READY",
          organizationId: preferredOrgId,
          pathname,
          detail:
            "AUTH_PASS: preferred org visible on picker (complete profile).",
        };
      }
      if (
        (await incompletePreferred.count()) >
        0
      ) {
        return {
          code: "ORG_MEMBERSHIP_BLOCKED",
          organizationId: preferredOrgId,
          pathname,
          detail:
            "AUTH_PASS: preferred org visible but profile incomplete (onboarding link).",
        };
      }
      return {
        code: "ORG_MEMBERSHIP_BLOCKED",
        organizationId: null,
        pathname,
        detail:
          "AUTH_PASS: preferred org id not visible under RLS on org picker.",
      };
    }

    const snap = page
      .locator(
        'section[aria-label="Organizations"] a[href^="/app/"]',
      )
      .filter({
        hasText: /snapstore/i,
      })
      .first();

    if (
      (await snap.count()) > 0
    ) {
      const href =
        await snap.getAttribute("href");
      if (
        href?.startsWith("/app/onboarding")
      ) {
        return {
          code: "ORG_MEMBERSHIP_BLOCKED",
          organizationId: null,
          pathname,
          detail:
            "AUTH_PASS: snapstore membership visible but incomplete profile.",
        };
      }
      const match = href?.match(
        /^\/app\/([^/?#]+)/,
      );
      return {
        code: "ORG_READY",
        organizationId: match?.[1] ?? null,
        pathname,
        detail:
          "AUTH_PASS: snapstore membership visible on picker.",
      };
    }

    // Prefer any complete workspace link (not onboarding).
    const completeLink = page
      .locator(
        'section[aria-label="Organizations"] a[href^="/app/"]:not([href*="onboarding"])',
      )
      .first();

    if (
      (await completeLink.count()) > 0
    ) {
      const href =
        await completeLink.getAttribute(
          "href",
        );
      const match = href?.match(
        /^\/app\/([^/?#]+)/,
      );
      return {
        code: "ORG_READY",
        organizationId: match?.[1] ?? null,
        pathname,
        detail:
          "AUTH_PASS: complete organization membership available on picker.",
      };
    }

    return {
      code: "ORG_MEMBERSHIP_BLOCKED",
      organizationId: null,
      pathname,
      detail:
        "AUTH_PASS: org picker has no complete workspace membership (snapstore absent or incomplete only).",
    };
  }

  const orgMatch = pathname.match(
    /^\/app\/([0-9a-f-]{36})(?:\/|$)/i,
  );
  if (
    orgMatch?.[1]
  ) {
    if (
      preferredOrgId &&
      preferredOrgId !== orgMatch[1]
    ) {
      return {
        code: "ROUTING_FAIL",
        organizationId: orgMatch[1],
        pathname,
        detail:
          "landed on unexpected org id vs PLAYWRIGHT_ORG_ID/E2E_ORG_ID",
      };
    }
    return {
      code: "ORG_READY",
      organizationId: orgMatch[1],
      pathname,
      detail:
        "AUTH_PASS: org-scoped destination.",
    };
  }

  return {
    code: "ROUTING_FAIL",
    organizationId: null,
    pathname,
    detail: `unexpected authenticated path ${pathname}`,
  };
}

export async function openAuthorizedOrganization(
  page: Page,
  organizationId: string,
): Promise<void> {
  await page.goto(`/app/${organizationId}`, {
    waitUntil: "domcontentloaded",
  });

  await expect(page).not.toHaveURL(
    /tenant_error=organization_access_denied/,
  );
  await expect(page).not.toHaveURL(
    /\/app\/onboarding/,
  );
}

export async function assertWrongOrgDenied(
  page: Page,
  foreignOrgId = "00000000-0000-4000-8000-000000000099",
): Promise<void> {
  await page.goto(`/app/${foreignOrgId}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page).toHaveURL(
    /\/app(?:\?|$)/,
  );
  await expect(page).toHaveURL(
    /tenant_error=organization_access_denied/,
  );
}
