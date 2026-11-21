import { defineConfig, devices } from "@playwright/test";

const port = process.env.PORT ?? "3000";
const baseURL = `http://127.0.0.1:${port}`;

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
    command: `rm -f data/e2e.db data/e2e-emails.jsonl && mkdir -p qa/screenshots data && npm run start -- --port ${port}`,
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
      EDITOR_VISUALE: "1",
      QUOTE_SENDING: "1",
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
      name: "testo-desktop",
      // After the app projects: they check the empty states of the shared account, which this project fills.
      dependencies: ["app-mobile"],
      testMatch: /testo\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        storageState: "e2e/.auth/state.json",
      },
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
      dependencies: ["app-desktop"],
      testMatch: /app\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 375, height: 812 },
        storageState: "e2e/.auth/state.json",
      },
    },
    {
      name: "fase2-desktop",
      // Same reason as testo-desktop: the empty states must be checked before quotes are created.
      dependencies: ["app-mobile"],
      testMatch: /fase2\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        storageState: "e2e/.auth/state.json",
      },
    },
    {
      name: "fase2-mobile",
      dependencies: ["fase2-desktop"],
      testMatch: /fase2\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 375, height: 812 },
        storageState: "e2e/.auth/state.json",
      },
    },
    {
      name: "fase3-desktop",
      dependencies: ["fase2-mobile"],
      testMatch: /fase3\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        storageState: "e2e/.auth/state.json",
      },
    },
    {
      name: "fase3-mobile",
      dependencies: ["fase3-desktop"],
      testMatch: /fase3\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 375, height: 812 },
        storageState: "e2e/.auth/state.json",
      },
    },
    {
      name: "visuale-desktop",
      dependencies: ["fase3-mobile"],
      testMatch: /visuale\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        storageState: "e2e/.auth/state.json",
      },
    },
    {
      name: "visuale-mobile",
      dependencies: ["visuale-desktop"],
      testMatch: /visuale\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 375, height: 812 },
        storageState: "e2e/.auth/state.json",
      },
    },
    {
      name: "struttura-desktop",
      dependencies: ["visuale-mobile"],
      testMatch: /struttura\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        storageState: "e2e/.auth/state.json",
      },
    },
    {
      name: "struttura-mobile",
      dependencies: ["struttura-desktop"],
      testMatch: /struttura\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 375, height: 812 },
        storageState: "e2e/.auth/state.json",
      },
    },
    {
      name: "pannello-desktop",
      dependencies: ["struttura-mobile"],
      testMatch: /pannello\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        storageState: "e2e/.auth/state.json",
      },
    },
    {
      name: "pannello-mobile",
      dependencies: ["pannello-desktop"],
      testMatch: /pannello\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 375, height: 812 },
        storageState: "e2e/.auth/state.json",
      },
    },
    {
      name: "invio-desktop",
      dependencies: ["pannello-mobile"],
      testMatch: /invio\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        storageState: "e2e/.auth/state.json",
      },
    },
    {
      name: "invio-mobile",
      dependencies: ["invio-desktop"],
      testMatch: /invio\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 375, height: 812 },
        storageState: "e2e/.auth/state.json",
      },
    },
  ],
});
