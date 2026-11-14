import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const pages = [
  { path: "/app/overview", name: "overview" },
  { path: "/app/quotes", name: "quotes" },
  { path: "/app/clients", name: "clients" },
  { path: "/app/catalog", name: "catalog" },
  { path: "/app/templates", name: "templates" },
  { path: "/app/settings", name: "settings" },
  { path: "/app/settings/billing", name: "billing" },
  { path: "/app/settings/billing/compare", name: "billing-compare" },
  { path: "/app/settings/billing/pro", name: "billing-pro" },
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
        () => Math.max(...[document.documentElement, document.querySelector(".main-col > .page")].map((el) => (el ? el.scrollWidth - el.clientWidth : 0))),
      );
      expect(overflow).toBeLessThanOrEqual(1);
      await page.setViewportSize({ width: 375, height: 812 });
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }
    const shot = mobile ? "mobile" : "desktop";
    await page.screenshot({ path: `qa/screenshots/${entry.name}-${shot}.png`, fullPage: true });
    if (entry.name === "overview" || entry.name.startsWith("billing")) {
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

test("stati vuoti e pannello cliente illustrato", async ({ page }, testInfo) => {
  const mobile = testInfo.project.name.includes("mobile");
  await page.goto("/app/overview");
  await expect(page.getByRole("heading", { name: "Crea il tuo primo preventivo" })).toBeVisible();
  await page.locator(".empty-illustration img").waitFor();
  await page.waitForFunction(() => {
    const image = document.querySelector(".empty-illustration img") as HTMLImageElement | null;
    return Boolean(image && image.naturalWidth > 16);
  });
  await page.screenshot({
    path: `qa/screenshots/overview-empty-${mobile ? "mobile" : "desktop"}.png`,
    fullPage: true,
  });

  await page.goto("/app/quotes");
  await expect(page.getByRole("heading", { name: "Crea il tuo primo preventivo" })).toBeVisible();
  const newQuote = page.getByRole("link", { name: "Nuovo preventivo" });
  if (mobile) {
    await expect(newQuote).toHaveCount(1);
  } else {
    await expect(newQuote).toHaveCount(3);
  }
  await page.screenshot({
    path: `qa/screenshots/quotes-empty-${mobile ? "mobile" : "desktop"}.png`,
    fullPage: true,
  });

});

test("il menu account si apre sotto l'avatar", async ({ page }, testInfo) => {
  const mobile = testInfo.project.name.includes("mobile");
  await page.setViewportSize(mobile ? { width: 375, height: 812 } : { width: 1440, height: 900 });
  await page.goto("/app/overview");
  const avatar = page.getByRole("button", { name: /Account$/ });
  await expect(avatar).toBeVisible();
  await avatar.click();
  const menu = page.locator("#account-menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("button", { name: "Esci" })).toBeVisible();
  const avatarBox = await avatar.boundingBox();
  const menuBox = await menu.boundingBox();
  expect(avatarBox).toBeTruthy();
  expect(menuBox).toBeTruthy();
  expect(menuBox!.y).toBeGreaterThanOrEqual(avatarBox!.y);
  expect(menuBox!.y).toBeLessThan(avatarBox!.y + avatarBox!.height + 28);
  const avatarRight = avatarBox!.x + avatarBox!.width;
  const menuRight = menuBox!.x + menuBox!.width;
  expect(Math.abs(menuRight - avatarRight)).toBeLessThan(24);
  expect(menuBox!.x).toBeGreaterThan(avatarBox!.x + avatarBox!.width - menuBox!.width - 24);
  await page.screenshot({ path: `qa/screenshots/account-menu-${mobile ? "mobile" : "desktop"}.png` });

  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  const bell = page.getByRole("button", { name: "Notifiche" });
  await bell.click();
  const notes = page.locator("#notifications");
  await expect(notes).toBeVisible();
  const bellBox = await bell.boundingBox();
  const notesBox = await notes.boundingBox();
  expect(bellBox).toBeTruthy();
  expect(notesBox).toBeTruthy();
  expect(notesBox!.y).toBeGreaterThanOrEqual(bellBox!.y);
  expect(notesBox!.y).toBeLessThan(bellBox!.y + bellBox!.height + 28);
  const bellRight = bellBox!.x + bellBox!.width;
  const notesRight = notesBox!.x + notesBox!.width;
  expect(Math.abs(notesRight - bellRight)).toBeLessThan(24);
});

test("abbonamento: piani, confronto e attivazione senza checkout", async ({ page }, testInfo) => {
  const mobile = testInfo.project.name.includes("mobile");
  await page.setViewportSize(mobile ? { width: 375, height: 812 } : { width: 1440, height: 900 });
  await page.goto("/app/overview");
  if (mobile) {
    await page.goto("/app/settings/billing");
  } else {
    await page.getByRole("link", { name: /Gestisci piano/ }).click();
    await expect(page).toHaveURL(/\/app\/settings\/billing$/);
  }
  await expect(page.getByRole("heading", { level: 1, name: "Scegli il piano perfetto per le tue esigenze" })).toBeVisible();
  await expect(page.getByText("Piano di prova", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Confronta i piani" }).click();
  await expect(page).toHaveURL(/\/app\/settings\/billing\/compare$/);
  await expect(page.getByRole("table")).toContainText("Collaborazione team");
  await page.getByRole("navigation", { name: "Sezioni dell'abbonamento" }).getByRole("link", { name: "Business" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "La soluzione completa per il tuo team" })).toBeVisible();
  await expect(page.getByText("In arrivo").first()).toBeVisible();
  await page.getByRole("button", { name: "Attiva il Piano Business" }).click();
  const dialog = page.getByRole("dialog", { name: "Pagamenti in arrivo" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Ho capito" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Piano di prova", { exact: true })).toBeVisible();
});
