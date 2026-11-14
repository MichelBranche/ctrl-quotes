import { expect, test, type Page } from "@playwright/test";

/**
 * Going back to the Overview from any section: first the current view tears down (URL unchanged), then the
 * Overview builds up. Covers sidebar links, the logo and the in-page links, and the views with and without their
 * own card choreography.
 */

async function leavesThenArrives(page: Page, from: string, leavingSelector: string, click: () => Promise<void>) {
  await page.goto(from);
  await page.waitForTimeout(1200); // entrance done
  await click();
  // Exit first: the current view is leaving and the URL has not changed yet.
  await expect(page.locator(leavingSelector).first()).toBeAttached({ timeout: 400 });
  expect(new URL(page.url()).pathname).toBe(from);
  // Then the Overview, whose cards build up.
  await expect(page).toHaveURL(/\/app\/overview$/);
  await expect(page.locator(".ov")).toBeVisible();
  await expect.poll(async () => page.locator(".ov-kpi").first().evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
}

const sidebarOverview = (page: Page) => () => page.locator(".sidebar-desktop a.nav-link[href='/app/overview']").click();

test.describe("ritorno all'Overview con transizione", () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name.includes("mobile"), "la sidebar desktop serve per il clic");
  });

  for (const from of ["/app/quotes", "/app/clients", "/app/catalog", "/app/templates", "/app/help"]) {
    test(`da ${from}`, async ({ page }) => {
      await leavesThenArrives(page, from, ".pt-leaving", sidebarOverview(page));
    });
  }

  test("da Impostazioni e da una sottopagina", async ({ page }) => {
    await leavesThenArrives(page, "/app/settings", ".st-grid.is-leaving", sidebarOverview(page));
    await leavesThenArrives(page, "/app/settings/fiscal", ".ss-grid.is-leaving", sidebarOverview(page));
  });

  test("da Abbonamenti, con il logo", async ({ page }) => {
    await leavesThenArrives(page, "/app/settings/billing", ".bl-grid.is-leaving", () => page.locator(".sidebar-desktop a.sb-logo").click());
  });

  test("a riposo le ombre non sono tagliate (overflow visibile)", async ({ page }) => {
    await page.goto("/app/overview");
    await page.waitForTimeout(1500);
    expect(await page.locator(".ov-stage").evaluate((el) => getComputedStyle(el).overflow)).toBe("visible");
    await page.goto("/app/settings");
    await page.waitForTimeout(1500);
    expect(await page.locator(".st-grid").evaluate((el) => getComputedStyle(el).overflow)).toBe("visible");
  });

  test("con reduced motion si cambia pagina subito", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/app/clients");
    await sidebarOverview(page)();
    await expect(page).toHaveURL(/\/app\/overview$/);
    await expect(page.locator(".pt-leaving")).toHaveCount(0);
  });
});
