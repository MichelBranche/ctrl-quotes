import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL,
    locale: "it-IT",
    timezoneId: "Europe/Rome",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "rm -f data/e2e.db data/e2e-emails.jsonl && mkdir -p qa/screenshots data && npm run start",
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      BETTER_AUTH_SECRET: "e2e-secret-must-be-at-least-32-characters",
      BETTER_AUTH_URL: baseURL,
      NEXT_PUBLIC_APP_URL: baseURL,
      DATABASE_URL: "file:./data/e2e.db",
      EMAIL_DRIVER: "file",
      EMAIL_FILE_PATH: "data/e2e-emails.jsonl",
      ENABLE_COMPONENT_CATALOG: "1",
      ENABLE_DEV_MAILBOX: "1",
    },
  },
  projects: [
    { name: "setup", testMatch: /setup\.ts/ },
    {
      name: "public-desktop",
      testMatch: /public\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "public-mobile",
      testMatch: /public\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 812 } },
    },
    {
      name: "app-desktop",
      dependencies: ["setup"],
      testMatch: /app\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        storageState: "e2e/.auth/state.json",
      },
    },
    {
      name: "app-mobile",
      dependencies: ["setup"],
      testMatch: /app\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 375, height: 812 },
        storageState: "e2e/.auth/state.json",
      },
    },
  ],
});
