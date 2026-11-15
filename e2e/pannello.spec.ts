import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { FORM_EDITOR_ENABLED } from "../src/components/quote-editor/form-editor-flag";
import AxeBuilder from "@axe-core/playwright";

const shotsDir = process.env.QA_SHOTS_DIR ?? "qa/screenshots/pannello";

test.describe.configure({ mode: "serial" });

async function shot(page: Page, name: string, testInfo: TestInfo) {
  fs.mkdirSync(shotsDir, { recursive: true });
  const device = testInfo.project.name.includes("mobile") ? "mobile" : "desktop";
  await page.screenshot({ path: path.join(shotsDir, `${name}-${device}.png`) });
}

async function seriousA11y(page: Page) {
  // Fades still running would read as low contrast.
  await page.waitForTimeout(350);
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== "running"), null, { timeout: 3000 }).catch(() => undefined);
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations.filter((item) => item.impact === "serious" || item.impact === "critical").map((item) => `${item.id}: ${item.nodes.map((node) => node.html.slice(0, 160)).join(" | ")}`);
}

/** A fresh quote from the client and catalog item created by the phase 3 tests. */
async function newQuote(page: Page, title: string, suffix: string) {
  await page.goto("/app/quotes/new");
  await page.getByLabel("Cerca cliente").fill(`Atelier Nord ${suffix}`);
  await page.getByRole("option", { name: new RegExp(`Atelier Nord ${suffix}`) }).click();
  await page.getByRole("button", { name: "Continua" }).click();
  await page.getByRole("radio", { name: /Editorial Atelier/ }).click();
  await page.getByRole("button", { name: "Continua" }).click();
  await page.getByLabel("Titolo del preventivo").fill(title);
  await page.getByLabel("Introduzione (facoltativa)").fill("Un restyling completo, dal progetto alla messa online.");
  await page.getByLabel("Cerca nel catalogo").fill(`Sviluppo sito ${suffix}`);
  await page.getByRole("checkbox", { name: new RegExp(`Sviluppo sito ${suffix}`) }).check();
  await page.getByRole("button", { name: "Crea e apri l'editor" }).click();
  await expect(page).toHaveURL(/\/app\/quotes\/(?!new)[^/?]+$/);
}

const outlineIds = (page: Page) => page.locator(".branched-menu__row").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-value") ?? ""));
const outlineTitles = (page: Page) => page.locator(".branched-menu__label").allTextContents();
const row = (page: Page, title: string) => page.locator(".branched-menu__row").filter({ has: page.locator(".branched-menu__label", { hasText: title }) });

/** Top-level printed blocks, with their box on screen. */
const printed = async (page: Page) => {
  // Let a smooth scroll settle first.
  await page.waitForTimeout(500);
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>(".ve-content .qd-sheets [data-block-id]")]
      .filter((element) => !element.parentElement?.closest("[data-block-id]"))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return { id: element.dataset.blockId ?? "", x: rect.x, y: rect.y, w: rect.width, h: rect.height };
      }),
  );
};

async function rightClick(page: Page, x: number, y: number, shift = false) {
  if (shift) await page.keyboard.down("Shift");
  await page.mouse.click(x, y, { button: "right" });
  if (shift) await page.keyboard.up("Shift");
}

test("pannello e menu contestuale: azioni sui blocchi, inserisci qui, tastiera, annulla", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const mobile = testInfo.project.name.includes("mobile");
  await newQuote(page, mobile ? "Pannello mobile" : "Pannello visuale", mobile ? "M" : "D");

  if (mobile && !FORM_EDITOR_ENABLED) {
    // Modulo paused: Visuale on small screens too, without the mode toggle.
    await expect(page.getByTestId("editor-visuale")).toBeVisible();
    await expect(page.getByRole("group", { name: "Modalità dell'editor" })).toHaveCount(0);
    return;
  }
  if (mobile) {
    // Small screens keep Modulo: no Visuale toggle and the browser's own right click menu.
    await expect(page.locator(".editor-grid")).toBeVisible();
    await expect(page.getByRole("group", { name: "Modalità dell'editor" })).toBeHidden();
    await page.locator(".editor-grid").click({ button: "right", position: { x: 20, y: 20 } });
    await expect(page.getByRole("menu")).toHaveCount(0);
    return;
  }

  if (FORM_EDITOR_ENABLED) await page.getByRole("group", { name: "Modalità dell'editor" }).getByRole("button", { name: "Visuale" }).click();
  const visuale = page.getByTestId("editor-visuale");
  await expect(visuale).toBeVisible();
  await page.waitForLoadState("networkidle");
  const live = page.getByTestId("ve-live");

  // The side panel: closed by default at this width, opens from the bar, Contenuto and Stile.
  const panel = page.getByTestId("ve-panel");
  await expect(panel).toHaveCount(0);
  await page.getByRole("button", { name: "Apri il pannello delle proprietà" }).click();
  await expect(panel).toBeVisible();
  await page.locator(".ve-canvas").click({ position: { x: 12, y: 12 } });
  await page.keyboard.press("Escape");
  await expect(panel.getByRole("heading", { name: "Documento" })).toBeVisible();
  await expect(panel.getByLabel("Cliente")).toBeVisible();
  await expect(panel.getByLabel("Valido fino al")).toBeVisible();
  await shot(page, "pannello-documento", testInfo);
  await panel.getByRole("tab", { name: "Stile" }).click();
  await expect(panel.getByRole("heading", { name: "Tutto il documento" })).toBeVisible();
  // The template is not a Stile choice: it lives in Contenuto.
  await expect(panel.getByRole("radiogroup", { name: "Template" })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Cambia in Contenuto" })).toBeVisible();
  await expect(panel.getByText("Questo blocco")).toHaveCount(0);
  // Tabs work with the arrows.
  await panel.getByRole("tab", { name: "Stile" }).press("ArrowLeft");
  await expect(panel.getByRole("tab", { name: "Contenuto" })).toHaveAttribute("aria-selected", "true");
  expect(await seriousA11y(page)).toEqual([]);

  // Right click on a block: its own menu, with the actions the model allows.
  const ids = await outlineIds(page);
  const titles = await outlineTitles(page);
  const introIndex = titles.indexOf("Il progetto");
  expect(introIndex).toBeGreaterThan(0);
  const introId = ids[introIndex] ?? "";
  await row(page, "Il progetto").locator(".branched-menu__item").click();
  await expect(visuale.locator(`.qd-sheets [data-block-id="${introId}"]`).first()).toBeInViewport();
  await page.waitForTimeout(600);
  const blocks = await printed(page);
  const intro = blocks.find((block) => block.id === introId);
  if (!intro) throw new Error("intro not printed");
  await rightClick(page, intro.x + intro.w / 2, intro.y + Math.min(60, intro.h / 2));
  const menu = page.getByRole("menu", { name: /Azioni su Il progetto/ });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: /Modifica il testo/ })).toBeFocused();
  await expect(menu.getByRole("menuitem", { name: /Sposta su/ })).toHaveAttribute("aria-disabled", "true");
  await expect(menu.getByRole("menuitem", { name: /Aggiungi sotto/ })).toHaveAttribute("aria-haspopup", "menu");
  await expect(page.getByText("Maiusc + clic destro: menu del browser")).toBeVisible();
  await shot(page, "menu-blocco", testInfo);
  expect(await seriousA11y(page)).toEqual([]);

  // Submenu from the keyboard: unique blocks already in the quote are switched off.
  await menu.getByRole("menuitem", { name: /Aggiungi sotto/ }).focus();
  await page.keyboard.press("ArrowRight");
  const types = page.getByRole("menu", { name: "Aggiungi sotto" });
  await expect(types).toBeVisible();
  await expect(types.getByRole("menuitem", { name: /Riepilogo/ })).toHaveAttribute("aria-disabled", "true");
  await expect(types.getByRole("menuitem", { name: /Riepilogo/ })).toContainText("Già presente");
  await shot(page, "menu-aggiungi-sotto", testInfo);
  await page.keyboard.press("ArrowLeft");
  await expect(types).toHaveCount(0);
  await expect(menu.getByRole("menuitem", { name: /Aggiungi sotto/ })).toBeFocused();

  // Type-ahead and Enter: Duplica.
  await page.keyboard.press("d");
  await expect(menu.getByRole("menuitem", { name: /Duplica/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(menu).toHaveCount(0);
  await expect.poll(async () => (await outlineIds(page)).length).toBe(ids.length + 1);
  await expect(live).toContainText("Duplicato: Il progetto");

  // Undo: the copy goes, a violet veil shows what changed, and it is read out.
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await outlineIds(page)).length).toBe(ids.length);
  await expect(live).toContainText("Modifica annullata");
  await page.keyboard.press("Control+Shift+z");
  await expect(visuale.locator(".ve-veil").first()).toBeAttached();
  await expect.poll(async () => (await outlineIds(page)).length).toBe(ids.length + 1);
  await page.keyboard.press("Control+z");
  await expect.poll(async () => (await outlineIds(page)).length).toBe(ids.length);

  // Right click between two blocks: "Inserisci qui", and the block lands exactly there.
  const now = await printed(page);
  const at = now.findIndex((block) => block.id === introId);
  const above = now[at];
  const below = now[at + 1];
  if (!above || !below) throw new Error("no gap after the intro");
  const gapY = above.y + above.h + Math.max(1, (below.y - above.y - above.h) / 2);
  await page.mouse.move(above.x - 30, gapY);
  await rightClick(page, above.x + above.w / 2, gapY);
  const here = page.getByRole("menu", { name: "Aggiungi qui" });
  await expect(here).toBeVisible();
  await expect(here).toContainText("Tra «Il progetto» e");
  await expect(visuale.locator(".ve-insert.is-here")).toBeVisible();
  await page.keyboard.press("ArrowRight");
  const hereTypes = page.getByRole("menu", { name: "Aggiungi un blocco" });
  await expect(hereTypes).toBeVisible();
  await shot(page, "menu-inserisci-qui", testInfo);
  await page.keyboard.press("v");
  await expect(hereTypes.getByRole("menuitem", { name: /Vantaggi/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(here).toHaveCount(0);
  await expect.poll(async () => (await outlineIds(page)).length).toBe(ids.length + 1);
  const after = await outlineTitles(page);
  expect(after[introIndex + 1]).toBe("Vantaggi");
  await expect(live).toContainText("Aggiunto: Vantaggi");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  // Shift + right click keeps the browser menu: ours does not open.
  const intro2 = (await printed(page)).find((block) => block.id === introId);
  if (!intro2) throw new Error("intro not printed");
  await rightClick(page, intro2.x + intro2.w / 2, intro2.y + 20, true);
  await expect(page.getByRole("menu")).toHaveCount(0);

  // Inside a text being edited, the browser menu too (spelling, copy, paste).
  await row(page, "Il progetto").locator(".branched-menu__item").click();
  await page.keyboard.press("Shift+F10");
  await menu.getByRole("menuitem", { name: /Modifica il testo/ }).click();
  const field = visuale.locator(".ve-session-field");
  await expect(field).toBeVisible();
  await field.click({ button: "right" });
  await expect(page.getByRole("menu")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(field).toHaveCount(0);

  // Shift+F10 opens the selected block's menu from the keyboard; Esc closes it.
  await row(page, "Il progetto").locator(".branched-menu__item").click();
  await page.keyboard.press("Shift+F10");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem").first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);

  // "Tutti i campi" from the menu opens the panel on Contenuto, with the block's fields.
  await page.keyboard.press("Shift+F10");
  await menu.getByRole("menuitem", { name: /Tutti i campi/ }).click();
  await expect(panel.getByRole("tab", { name: "Contenuto" })).toHaveAttribute("aria-selected", "true");
  await expect(panel.locator(".ve-panel-title h2")).toHaveText("Il progetto");
  await panel.getByRole("tab", { name: "Stile" }).click();
  await expect(panel.getByText("Questo blocco")).toBeVisible();
  await expect(panel.getByRole("switch", { name: /Visibile nel documento/ })).toBeChecked();
  await shot(page, "pannello-stile-blocco", testInfo);
  expect(await seriousA11y(page)).toEqual([]);

  // Elimina from the menu: gone, with the usual toast to bring it back.
  const vantaggiId = (await outlineIds(page))[introIndex + 1] ?? "";
  const vantaggi = (await printed(page)).find((block) => block.id === vantaggiId);
  if (!vantaggi) throw new Error("vantaggi not printed");
  await rightClick(page, vantaggi.x + vantaggi.w / 2, vantaggi.y + Math.min(40, vantaggi.h / 2));
  await page.getByRole("menu", { name: /Azioni su Vantaggi/ }).getByRole("menuitem", { name: /Elimina/ }).click();
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Blocco eliminato: Vantaggi" })).toBeVisible();
  await expect(live).toContainText("Blocco eliminato: Vantaggi");
  await expect.poll(async () => (await outlineIds(page)).length).toBe(ids.length);

  // The panel can be closed again, and the choice sticks.
  await panel.getByRole("button", { name: "Chiudi il pannello" }).click();
  await expect(panel).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("editor-visuale")).toBeVisible();
  await expect(page.getByTestId("ve-panel")).toHaveCount(0);
});
