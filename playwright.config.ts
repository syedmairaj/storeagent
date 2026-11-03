import fs from "node:fs";
import path from "node:path";

import {
  defineConfig,
  devices,
  type Project,
} from "@playwright/test";

/**
 * Actions E2E acceptance — Chromium only, six viewport projects.
 * Auth state is produced by setup or manual-auth into a gitignored path.
 *
 * PLAYWRIGHT_REUSE_AUTH=1 skips password setup and uses existing
 * playwright/.auth/user.json (from a prior login or manual capture).
 */
const AUTH_FILE = path.join(
  __dirname,
  "playwright/.auth/user.json",
);

const reuseAuth =
  process.env.PLAYWRIGHT_REUSE_AUTH === "1";

if (
  reuseAuth &&
  !fs.existsSync(AUTH_FILE)
) {
  throw new Error(
    "PLAYWRIGHT_REUSE_AUTH=1 but playwright/.auth/user.json is missing. Run manual-auth capture or a successful setup first.",
  );
}

/**
 * Chromium-only suite. Do not spread devices["iPhone *"] wholesale —
 * those presets set defaultBrowserType=webkit and require a WebKit install.
 * Keep mobile viewport / touch / UA emulation under Chromium.
 */
const iphoneSe = devices["iPhone SE"];
const iphone12 = devices["iPhone 12"];

const viewportProjects: Project[] = [
  {
    name: "actions-320",
    testMatch: /actions-acceptance\.spec\.ts/,
    use: {
      browserName: "chromium",
      viewport: {
        width: 320,
        height: 568,
      },
      userAgent: iphoneSe.userAgent,
      deviceScaleFactor: iphoneSe.deviceScaleFactor,
      storageState: AUTH_FILE,
      isMobile: true,
      hasTouch: true,
    },
  },
  {
    name: "actions-390",
    testMatch: /actions-acceptance\.spec\.ts/,
    use: {
      browserName: "chromium",
      viewport: {
        width: 390,
        height: 844,
      },
      userAgent: iphone12.userAgent,
      deviceScaleFactor: iphone12.deviceScaleFactor,
      storageState: AUTH_FILE,
      isMobile: true,
      hasTouch: true,
    },
  },
  {
    name: "actions-768",
    testMatch: /actions-acceptance\.spec\.ts/,
    use: {
      browserName: "chromium",
      viewport: {
        width: 768,
        height: 800,
      },
      storageState: AUTH_FILE,
      isMobile: false,
      hasTouch: true,
    },
  },
  {
    name: "actions-1024",
    testMatch: /actions-acceptance\.spec\.ts/,
    use: {
      browserName: "chromium",
      viewport: {
        width: 1024,
        height: 768,
      },
      storageState: AUTH_FILE,
      isMobile: false,
      hasTouch: false,
    },
  },
  {
    name: "actions-1280",
    testMatch: /actions-acceptance\.spec\.ts/,
    use: {
      browserName: "chromium",
      viewport: {
        width: 1280,
        height: 800,
      },
      storageState: AUTH_FILE,
      isMobile: false,
      hasTouch: false,
    },
  },
  {
    name: "actions-1440",
    testMatch: /actions-acceptance\.spec\.ts/,
    use: {
      browserName: "chromium",
      viewport: {
        width: 1440,
        height: 900,
      },
      storageState: AUTH_FILE,
      isMobile: false,
      hasTouch: false,
    },
  },
];

const projects: Project[] = [
  {
    name: "manual-auth",
    testMatch: /capture-auth\.manual\.ts/,
  },
];

if (
  !reuseAuth
) {
  projects.unshift({
    name: "setup",
    testMatch: /auth\.setup\.ts/,
  });

  for (const project of viewportProjects) {
    projects.push({
      ...project,
      dependencies: ["setup"],
    });
  }
} else {
  for (const project of viewportProjects) {
    projects.push(project);
  }
}

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ["list"],
    [
      "html",
      {
        open: "never",
        outputFolder: "playwright-report",
      },
    ],
  ],
  outputDir: "test-results",
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    browserName: "chromium",
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    locale: "en-US",
  },
  projects,
});
