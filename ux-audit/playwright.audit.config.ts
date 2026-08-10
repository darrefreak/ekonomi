import { defineConfig, devices } from "@playwright/test";

/**
 * A separate runner for the UX audit.
 *
 * Kept out of `e2e/` on purpose: the E2E suite is a gate that must stay fast and
 * deterministic, whereas this sweeps every route looking for problems and is
 * expected to report rather than to pass.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: ".",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  timeout: 240_000,
  use: { baseURL, screenshot: "off", trace: "off" },
  projects: [
    { name: "setup", testMatch: /audit\.setup\.ts/ },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, storageState: "ux-audit/.auth/demo.json" },
      dependencies: ["setup"],
      testIgnore: /audit\.setup\.ts/,
    },
    {
      name: "mobile",
      use: { ...devices["iPhone 12"], storageState: "ux-audit/.auth/demo.json" },
      dependencies: ["setup"],
      testIgnore: /audit\.setup\.ts/,
    },
    {
      name: "narrow",
      use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 812 }, isMobile: false, storageState: "ux-audit/.auth/demo.json" },
      dependencies: ["setup"],
      testMatch: /sweep\.spec\.ts/,
    },
  ],
});
