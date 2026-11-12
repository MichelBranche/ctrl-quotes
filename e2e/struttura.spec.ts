import fs from "node:fs";
import path from "node:path";
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const shotsDir = process.env.QA_SHOTS_DIR ?? "qa/screenshots/struttura";

test.describe.configure({ mode: "serial" });

async function shot(page: Page, name: string, testInfo: TestInfo) {
  fs.mkdirSync(shotsDir, { recursive: true });
  const device = testInfo.project.name.includes("mobile") ? "mobile" : "desktop";
  await page.screenshot({ path: path.join(shotsDir, `${name}-${device}.png`) });
}

async function seriousA11y(page: Page, exclude: string[] = []) {
  let builder = new AxeBuilder({ page });
  for (const selector of exclude) builder = builder.exclude(selector);
  const results = await builder.analyze();
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
  return page.url();
}

async function saved(page: Page) {
  await expect(page.getByText(/Salvato alle/)).toBeVisible({ timeout: 15_000 });
}

/** Outline rows as "title" in order, read from the DOM. */
const outlineTitles = (page: Page) => page.locator(".ve-outline-select span").allTextContents();

/** Each outline row with the page group it sits in, e.g. "Pagina 3 · dal Riepilogo". */
const outlinePages = (page: Page) =>
  page.locator(".ve-outline-row").evaluateAll((rows) => {
    let group = "";
    return rows.map((row) => {
      group = row.querySelector(".ve-outline-page")?.textContent ?? group;
      return `${group} > ${row.querySelector(".ve-outline-select span")?.textContent ?? ""}`;
    });
  });

/** Block ids printed on the sheet, in order, and the outline's visible ones. */
const sheetOrder = (page: Page) => page.locator(".ve-content [data-block-id]").evaluateAll((items) => [...new Set(items.map((item) => item.getAttribute("data-block-id")))]);
/** Outline order of the blocks that print (an empty block, e.g. Tempistiche with no steps, prints nothing). */
const outlinePrintedOrder = async (page: Page) => {
  const printed = new Set(await sheetOrder(page));
  const ids = await page.locator(".ve-outline-row:not(:has(.is-hidden))").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-block-id")));
  return ids.filter((id) => printed.has(id));
};

const row = (page: Page, title: string | RegExp) => page.locator(".ve-outline-row").filter({ has: page.locator(".ve-outline-select span", { hasText: title }) });

/** Drags an outline row by its grip, in small steps like a person would. */
async function dragRow(page: Page, from: Locator, to: Locator, onTheWay?: () => Promise<void>) {
  await from.hover();
  const grip = await from.locator(".ve-outline-grip").boundingBox();
  const target = await to.boundingBox();
  if (!grip || !target) throw new Error("row not visible");
  const x = grip.x + grip.width / 2;
  const y = grip.y + grip.height / 2;
  const endY = target.y + target.height / 2 + (target.y > grip.y ? 6 : -6);
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let step = 1; step <= 20; step += 1) {
    await page.mouse.move(x, y + ((endY - y) * step) / 20);
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(250);
  await onTheWay?.();
  await page.mouse.up();
  await page.waitForTimeout(400);
}

test("struttura: trascinare, aggiungere, nascondere, bloccare ed eliminare blocchi", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const mobile = testInfo.project.name.includes("mobile");
  const quoteUrl = await newQuote(page, mobile ? "Struttura mobile" : "Struttura visuale", mobile ? "M" : "D");
  const preview = page.locator(".preview-panel .qd");

  if (mobile) {
    // Small screens keep Modulo: lock and quick delete work there too.
    await expect(page.locator(".editor-grid")).toBeVisible();
    await lockInModulo(page, testInfo, false, true);
    await addInModulo(page, preview, testInfo, true);
    return;
  }

  await page.getByRole("group", { name: "Modalità dell'editor" }).getByRole("button", { name: "Visuale" }).click();
  const visuale = page.getByTestId("editor-visuale");
  await expect(visuale).toBeVisible();
  await page.waitForLoadState("networkidle");
  const sheet = visuale.locator(".qd-sheets");
  const titles = await outlineTitles(page);
  expect(titles.length).toBeGreaterThan(4);

  // Every row shows hide, lock and delete on hover; the cover has a fixed-position pin, not a grip.
  for (const title of titles) {
    const item = row(page, title);
    await item.hover();
    await expect(item.getByRole("button", { name: new RegExp(`^Nascondi ${escape(title)}`) })).toBeVisible();
    await expect(item.getByRole("button", { name: new RegExp(`^Blocca ${escape(title)}`) })).toBeVisible();
    await expect(item.getByRole("button", { name: new RegExp(`^Elimina ${escape(title)}`) })).toBeVisible();
  }
  const cover = page.locator(".ve-outline-row").first();
  await expect(cover.locator(".ve-outline-pin")).toBeVisible();
  await expect(cover.locator(".ve-outline-grip")).toHaveCount(0);
  await row(page, "Il progetto").hover();
  await shot(page, "struttura-azioni", testInfo);

  // Hiding a block keeps it on its page, and showing it again puts it back exactly.
  const pagesBefore = await outlinePages(page);
  const late = titles[titles.length - 1] ?? "";
  expect(pagesBefore.at(-1)).toContain("dal Riepilogo");
  await row(page, late).hover();
  await row(page, late).getByRole("button", { name: /^Nascondi/ }).click();
  await expect(row(page, late).locator(".ve-outline-item")).toHaveClass(/is-hidden/);
  expect(await outlinePages(page)).toEqual(pagesBefore);
  await shot(page, "struttura-nascosto", testInfo);
  await row(page, late).getByRole("button", { name: /^Mostra/ }).click();
  await expect(row(page, late).locator(".ve-outline-item")).not.toHaveClass(/is-hidden/);
  expect(await outlinePages(page)).toEqual(pagesBefore);
  expect(await outlineTitles(page)).toEqual(titles);

  // Every block in the menu appears on the sheet at once, selected and in view.
  await page.locator(".ve-outline-add").click();
  const picker = visuale.getByRole("dialog", { name: "Aggiungi blocco" });
  const offered = await picker.locator(".ve-picker-item:not(:disabled) strong").allTextContents();
  await page.keyboard.press("Escape");
  expect(offered).toEqual(expect.arrayContaining(["Introduzione", "Testo", "Immagine", "Servizi", "Opzioni", "Vantaggi", "Condizioni"]));
  for (const label of offered) {
    // With the signature (Contatti) selected, a new block still lands before the Riepilogo.
    if (label === "Vantaggi") await row(page, "Contatti e accettazione").locator(".ve-outline-select").click();
    await page.locator(".ve-outline-add").click();
    await expect(picker).toBeVisible();
    await picker.locator(".ve-picker-item").filter({ hasText: label }).first().click();
    await expect(picker).toHaveCount(0);
    const selectedRow = page.locator(".ve-outline-row").filter({ has: page.locator(".ve-outline-item.is-selected") });
    const id = await selectedRow.getAttribute("data-block-id");
    const block = sheet.locator(`[data-block-id="${id}"]`).first();
    await expect(block, `${label} sul foglio`).toBeVisible();
    await expect(block, `${label} in vista`).toBeInViewport();
    await expect(visuale.locator(".ve-frame.is-new")).toBeVisible();
    if (label === "Vantaggi") {
      const order = await page.locator(".ve-outline-row").evaluateAll((rows) => rows.map((entry) => entry.getAttribute("data-block-id")));
      const summaryId = await row(page, "Riepilogo economico").getAttribute("data-block-id");
      expect(order.indexOf(id)).toBe(order.indexOf(summaryId) - 1);
      await expect(block).toContainText("Punto di forza 1");
      await shot(page, "struttura-vantaggi", testInfo);
    }
    if (label === "Immagine") await expect(block.locator("img")).toBeVisible();
    // Close what opened (text session or fields drawer) and take the block away again.
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    const addedRow = page.locator(`.ve-outline-row[data-block-id="${id}"]`);
    await addedRow.hover();
    await addedRow.getByRole("button", { name: /^Elimina/ }).click();
    await expect(addedRow).toHaveCount(0);
  }
  await expect.poll(() => outlineTitles(page)).toEqual(titles);

  // Quick delete, then "Annulla" in the toast puts it back in place.
  await row(page, "Il progetto").hover();
  await row(page, "Il progetto").getByRole("button", { name: /^Elimina/ }).click();
  const toast = page.locator("[data-sonner-toast]").filter({ hasText: "Blocco eliminato: Il progetto" });
  await expect(toast).toBeVisible();
  await expect.poll(() => outlineTitles(page)).not.toContain("Il progetto");
  await shot(page, "struttura-eliminato", testInfo);
  await toast.getByRole("button", { name: "Annulla" }).click();
  await expect.poll(() => outlineTitles(page)).toEqual(titles);
  await saved(page);

  // Drag in the outline: the sheet follows, the cover never moves.
  const moving = titles[titles.length - 1] ?? "";
  const target = titles[1] ?? "";
  await dragRow(page, row(page, moving), row(page, target), async () => {
    await expect(page.locator(".ve-outline-item.is-dragging")).toBeVisible();
    await shot(page, "struttura-trascinamento", testInfo);
  });
  await expect.poll(async () => (await outlineTitles(page)).indexOf(moving)).toBe(1);
  await expect.poll(async () => (await sheetOrder(page)).join()).toBe((await outlinePrintedOrder(page)).join());
  const coverTitle = titles[0] ?? "";
  await dragRow(page, row(page, moving), page.locator(".ve-outline-row").first());
  expect((await outlineTitles(page))[0]).toBe(coverTitle);

  // Keyboard on the grip: arrow down moves one place.
  await row(page, moving).hover();
  await row(page, moving).locator(".ve-outline-grip").focus();
  await page.keyboard.press("ArrowDown");
  await expect.poll(async () => (await outlineTitles(page)).indexOf(moving)).toBe(2);
  await saved(page);
  await page.reload();
  await expect(visuale).toBeVisible();
  await expect.poll(async () => (await outlineTitles(page)).indexOf(moving)).toBe(2);
  await expect.poll(async () => (await sheetOrder(page)).join()).toBe((await outlinePrintedOrder(page)).join());

  // Lock: the content stops taking edits, the cover's pin is a different thing.
  const intro = row(page, "Il progetto");
  await intro.hover();
  await intro.getByRole("button", { name: /^Blocca/ }).click();
  await expect(intro.getByRole("button", { name: /^Sblocca/ })).toHaveAttribute("aria-pressed", "true");
  await expect(intro.getByRole("button", { name: /^Elimina/ })).toBeDisabled();
  const introId = await intro.getAttribute("data-block-id");
  const introText = sheet.locator(`[data-edit-block="${introId}"]`).first();
  await introText.click();
  await expect(visuale.getByRole("textbox")).toHaveCount(0);
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Il blocco è bloccato" })).toBeVisible();
  await expect(visuale.locator(".ve-frame.is-locked")).toBeVisible();
  await expect(visuale.locator(".ve-frame-label")).toContainText("Bloccato");
  await page.waitForTimeout(500);
  await shot(page, "struttura-bloccato", testInfo);
  expect(await seriousA11y(page, [".qd"])).toEqual([]);
  await saved(page);

  // The PDF is not affected by the lock.
  const quoteId = new URL(quoteUrl).pathname.split("/").pop();
  const pdf = await page.request.get(`/api/quotes/${quoteId}/pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toContain("pdf");

  // Modulo respects the same lock, and adds blocks that show in the preview.
  await page.getByRole("group", { name: "Modalità dell'editor" }).getByRole("button", { name: "Modulo" }).click();
  await expect(page.locator(".editor-grid")).toBeVisible();
  await lockInModulo(page, testInfo, true);
  await addInModulo(page, preview, testInfo);
});

function escape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Adds Vantaggi from the Modulo list: it shows in the preview at once, then goes away with undo available. */
async function addInModulo(page: Page, preview: Locator, testInfo: TestInfo, mobile = false) {
  const panes = page.getByRole("group", { name: "Pannello" });
  const list = page.locator(".block-list");
  if (mobile) await panes.getByRole("button", { name: "Struttura" }).click();
  const before = await list.locator(".block-item").count();
  await page.getByRole("button", { name: "Aggiungi blocco" }).first().click();
  await page.locator(".add-block").filter({ hasText: "Vantaggi" }).click();
  await expect(page.getByLabel("Titolo", { exact: true }).first()).toHaveValue("Punto di forza 1");
  if (mobile) await panes.getByRole("button", { name: "Anteprima" }).click();
  const added = preview.getByText("Punto di forza 1");
  await expect(added).toBeVisible();
  if (mobile) await added.scrollIntoViewIfNeeded();
  await expect(added).toBeInViewport();
  // Revealed, not left transparent by the entrance animation.
  await expect.poll(() => added.evaluate((element) => Number(getComputedStyle(element.closest("[data-a]") ?? element).opacity))).toBe(1);
  await shot(page, "struttura-modulo-vantaggi", testInfo);
  if (mobile) await panes.getByRole("button", { name: "Struttura" }).click();
  await expect(list.locator(".block-item")).toHaveCount(before + 1);
  const item = list.locator(".block-item.is-selected");
  await item.hover();
  await item.getByRole("button", { name: /^Elimina/ }).click();
  const toast = page.locator("[data-sonner-toast]").filter({ hasText: "Blocco eliminato: Vantaggi" });
  await expect(toast).toBeVisible();
  await expect(list.locator(".block-item")).toHaveCount(before);
  await toast.getByRole("button", { name: "Annulla" }).click();
  await expect(list.locator(".block-item")).toHaveCount(before + 1);
  await list.locator(".block-item").filter({ hasText: "Vantaggi" }).hover();
  await list.locator(".block-item").filter({ hasText: "Vantaggi" }).getByRole("button", { name: /^Elimina/ }).click();
  await expect(list.locator(".block-item")).toHaveCount(before);
  await saved(page);
}

/** Locks (or finds locked) "Il progetto" in Modulo: the form turns read-only until "Sblocca". */
async function lockInModulo(page: Page, testInfo: TestInfo, alreadyLocked = false, mobile = false) {
  if (mobile) await page.getByRole("group", { name: "Pannello" }).getByRole("button", { name: "Struttura" }).click();
  const item = page.locator(".block-item").filter({ hasText: "Il progetto" });
  if (!alreadyLocked) {
    await item.hover();
    await item.getByRole("button", { name: /^Blocca/ }).click();
  }
  await expect(item.getByRole("button", { name: /^Sblocca/ })).toBeVisible();
  await item.locator(".block-select").click();
  const note = page.locator(".lock-note");
  await expect(note).toContainText("Contenuto bloccato");
  const heading = page.getByLabel("Titolo della sezione");
  await expect(heading).toBeDisabled();
  await shot(page, "struttura-modulo-bloccato", testInfo);
  if (mobile) await page.getByRole("group", { name: "Pannello" }).getByRole("button", { name: "Struttura" }).click();
  await item.hover();
  await expect(item.getByRole("button", { name: /^Elimina/ })).toBeDisabled();
  if (mobile) await item.locator(".block-select").click();
  await note.getByRole("button", { name: "Sblocca" }).click();
  await expect(heading).toBeEnabled();
  await expect(note).toHaveCount(0);
  await saved(page);
}
