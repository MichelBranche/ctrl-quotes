import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const pages = [
  { path: "/login", name: "login" },
  { path: "/register", name: "register" },
];

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

for (const entry of pages) {
  test(`${entry.name} non ha violazioni gravi e non scorre in orizzontale`, async ({ page }, testInfo) => {
    const mobile = testInfo.project.name.includes("mobile");
    await page.setViewportSize(mobile ? { width: 375, height: 812 } : { width: 1440, height: 900 });
    await page.goto(entry.path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.setViewportSize({ width: 320, height: 700 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await page.setViewportSize(mobile ? { width: 375, height: 812 } : { width: 1440, height: 900 });
    const shot = mobile ? "mobile" : "desktop";
    await page.screenshot({ path: `qa/screenshots/${entry.name}-${shot}.png`, fullPage: true });
    const results = await new AxeBuilder({ page }).analyze();
    const serious = results.violations.filter((item) => item.impact === "serious" || item.impact === "critical");
    expect(serious).toEqual([]);
  });
}

const loginViewports = [
  { width: 1440, height: 900, name: "1440" },
  { width: 1280, height: 800, name: "1280" },
  { width: 1024, height: 768, name: "1024" },
  { width: 390, height: 844, name: "390" },
] as const;

test("il login si legge a 1440, 1280, 1024 e 390 senza avviso Google", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("public-desktop"), "un solo giro di screenshot");
  for (const viewport of loginViewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto("/login");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("Accesso con Google non è ancora configurato")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Google/i })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Accedi" })).toHaveAttribute("aria-selected", "true");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `qa/screenshots/login-${viewport.name}.png`, fullPage: true });
  }
});

test("le schede Accedi e Registrati cambiano modulo e indirizzo", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("tab", { name: "Registrati" }).click();
  await expect(page).toHaveURL(/\/register$/);
  await expect(page.getByRole("heading", { level: 1, name: "Crea il tuo account" })).toBeVisible();
  await expect(page.getByLabel("Nome e cognome")).toBeVisible();
  await page.getByRole("tab", { name: "Accedi" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { level: 1, name: "Accedi a CTRL® Quotes" })).toBeVisible();
});
