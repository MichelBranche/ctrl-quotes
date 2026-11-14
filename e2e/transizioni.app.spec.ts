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

  // Card choreography of their own (Preventivi, Clienti, Catalogo) or the generic page exit (Template, Aiuto).
  const leaving: Record<string, string> = {
    "/app/quotes": ".qv-page.is-leaving",
    "/app/clients": ".clients-page.is-leaving",
    "/app/catalog": ".ct-grid.is-leaving",
    "/app/templates": ".templates-page.is-leaving",
    "/app/quotes/new": ".wizard.is-leaving",
    "/app/help": ".pt-leaving",
  };
  for (const [from, selector] of Object.entries(leaving)) {
    test(`da ${from}`, async ({ page }) => {
      await leavesThenArrives(page, from, selector, sidebarOverview(page));
    });
  }

  test("verso Preventivi, Clienti e Catalogo le card arrivano e si fermano", async ({ page }) => {
    for (const [to, card] of [
      ["/app/quotes", ".qv-page > .toolbar"],
      ["/app/clients", ".cl-kpi"],
      ["/app/catalog", ".ct-hero"],
      ["/app/templates", ".template-card"],
    ] as const) {
      await page.goto("/app/overview");
      await page.waitForTimeout(1200);
      await page.locator(`.sidebar-desktop a.nav-link[href='${to}']`).click();
      await expect(page).toHaveURL(new RegExp(`${to}$`));
      await expect.poll(async () => page.locator(card).first().evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
      await page.goBack();
      await expect(page).toHaveURL(/\/app\/overview$/);
      await expect.poll(async () => page.locator(".ov-kpi").first().evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
    }
  });

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
    for (const [path, stage] of [
      ["/app/quotes", ".qv-page"],
      ["/app/clients", ".clients-page"],
      ["/app/catalog", ".ct-grid"],
      ["/app/templates", ".templates-page"],
      ["/app/quotes/new", ".wizard"],
    ] as const) {
      await page.goto(path);
      await page.waitForTimeout(1500);
      expect(await page.locator(stage).evaluate((el) => getComputedStyle(el).overflow)).toBe("visible");
    }
  });

  test("Nuovo preventivo: i passi entrano ed escono di lato", async ({ page }) => {
    await page.goto("/app/quotes/new");
    await page.waitForTimeout(1200);
    const card = page.locator(".wizard-card");
    await expect(card).toHaveCount(1);
    await page.getByRole("link", { name: "Gestisci rubrica" }).waitFor();
    // Leaving the wizard tears it down before the URL changes.
    await page.locator(".wizard-head .back-link").click();
    await expect(page.locator(".wizard.is-leaving")).toBeAttached({ timeout: 400 });
    await expect(page).toHaveURL(/\/app\/quotes$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/app\/quotes\/new$/);
    await expect.poll(async () => page.locator(".wizard-card").evaluate((el) => getComputedStyle(el).opacity)).toBe("1");
  });

  test("con reduced motion si cambia pagina subito", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/app/clients");
    await sidebarOverview(page)();
    await expect(page).toHaveURL(/\/app\/overview$/);
    await expect(page.locator(".pt-leaving")).toHaveCount(0);
  });
});
