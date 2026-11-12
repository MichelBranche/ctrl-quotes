import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const pages = [
  { path: "/app/overview", name: "overview" },
  { path: "/app/quotes", name: "quotes" },
  { path: "/app/clients", name: "clients" },
  { path: "/app/catalog", name: "catalog" },
  { path: "/app/templates", name: "templates" },
  { path: "/app/settings", name: "settings" },
  { path: "/dev/components", name: "components" },
];

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

for (const entry of pages) {
  test(`shell ${entry.name}`, async ({ page }, testInfo) => {
    const mobile = testInfo.project.name.includes("mobile");
    await page.setViewportSize(mobile ? { width: 375, height: 812 } : { width: 1440, height: 900 });
    await page.goto(entry.path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    if (mobile) {
      await page.setViewportSize({ width: 320, height: 700 });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
      await page.setViewportSize({ width: 375, height: 812 });
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }
    const shot = mobile ? "mobile" : "desktop";
    await page.screenshot({ path: `qa/screenshots/${entry.name}-${shot}.png`, fullPage: true });
    if (entry.name === "overview") {
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter((item) => item.impact === "serious" || item.impact === "critical");
      expect(serious).toEqual([]);
    }
  });
}

test("il catalogo mostra gli stati disabilitato, loading ed errore", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"));
  await page.goto("/dev/components");
  await expect(page.getByRole("button", { name: "Disabilitato" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Caricamento" })).toBeDisabled();
  await expect(page.getByText("Controlla questo campo.")).toBeVisible();
});
