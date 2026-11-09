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
