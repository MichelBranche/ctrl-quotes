import { defineConfig, devices } from "@playwright/test";

const port = process.env.NAV_PILL_PORT ?? "3017";
const baseURL = `http://127.0.0.1:${port}`;

// Playwright merges webServer.env with the process env, so blank the
// inherited Vercel deployment flags instead of deleting them.
const webServerEnv = {
  ...process.env,
  ENABLE_COMPONENT_CATALOG: "1",
  EMAIL_DRIVER: "console",
  NODE_ENV: "production",
  VERCEL: "",
  VERCEL_ENV: "",
  VERCEL_URL: "",
  VERCEL_TARGET_ENV: "",
  VERCEL_REGION: "",
};

export default defineConfig({
  testDir: "./scripts",
  testMatch: /qa-nav-pill\.ts/,
  fullyParallel: false,
  timeout: 60_000,
  reporter: "list",
  use: {
    baseURL,
    locale: "it-IT",
    timezoneId: "Europe/Rome",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    // Production server: next dev skips useLayoutEffect on this PPR route
    // and React development needs eval(), which the app CSP forbids.
    command: `npx next start --port ${port}`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 180_000,
    env: webServerEnv,
  },
});
