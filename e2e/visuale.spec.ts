import fs from "node:fs";
import path from "node:path";
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { FORM_EDITOR_ENABLED } from "../src/components/quote-editor/form-editor-flag";
import AxeBuilder from "@axe-core/playwright";

const shotsDir = process.env.QA_SHOTS_DIR ?? "qa/screenshots/visuale";

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

const outlineTitles = (page: Page) => page.locator(".ve-outline-select span").allTextContents();

async function saved(page: Page) {
  await expect(page.getByText(/Salvato alle/)).toBeVisible({ timeout: 15_000 });
}

/** Drags a block by its handle with the mouse, in small steps like a person would. */
async function dragBlock(page: Page, block: Locator, to: Locator, onTheWay?: () => Promise<void>) {
  // Both blocks in view, away from the edges where the canvas scrolls by itself.
  await to.evaluate((element) => {
    const canvas = element.closest<HTMLElement>(".ve-canvas");
    if (canvas) canvas.scrollTop += element.getBoundingClientRect().top - canvas.getBoundingClientRect().top - 120;
  });
  await page.waitForTimeout(100);
  const from = await block.boundingBox();
  if (!from) throw new Error("block not visible");
  await page.mouse.move(from.x + from.width / 2, from.y + Math.min(40, from.height / 2));
  const handle = page.locator(".ve-hover .ve-handle, .ve-frame .ve-handle").filter({ visible: true }).last();
  await expect(handle).toBeVisible();
  const grip = await handle.boundingBox();
  const target = await to.boundingBox();
  if (!grip || !target) throw new Error("handle or target not visible");
  const startX = grip.x + grip.width / 2;
  const startY = grip.y + grip.height / 2;
  const endY = target.y + target.height * 0.3;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  for (let step = 1; step <= 20; step += 1) {
    await page.mouse.move(startX + step * 3, startY + ((endY - startY) * step) / 20);
    await page.waitForTimeout(16);
  }
  await expect(page.locator(".ve-drop-slot")).toBeVisible();
  await page.waitForTimeout(350);
  await onTheWay?.();
  await page.mouse.up();
  await expect(page.locator(".ve-ghost")).toHaveCount(0);
}

test("editor visuale: scrivere sul foglio, prezzi, inserire e spostare blocchi", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const mobile = testInfo.project.name.includes("mobile");
  const quoteUrl = await newQuote(page, mobile ? "Restyling mobile" : "Restyling visuale", mobile ? "M" : "D");

  if (mobile && !FORM_EDITOR_ENABLED) {
    // Modulo paused: Visuale on small screens too, even if "modulo" was the stored choice.
    await page.evaluate(() => localStorage.setItem("cq.editor.mode", "modulo"));
    await page.reload();
    await expect(page.getByTestId("editor-visuale")).toBeVisible();
    await expect(page.getByRole("group", { name: "Modalità dell'editor" })).toHaveCount(0);
    return;
  }
  if (mobile) {
    // Small screens keep the form editor: no toggle, even if Visuale was chosen on a computer.
    await page.evaluate(() => localStorage.setItem("cq.editor.mode", "visuale"));
    await page.reload();
    await expect(page.locator(".editor-grid")).toBeVisible();
    await expect(page.getByRole("group", { name: "Modalità dell'editor" })).toHaveCount(0);
    await expect(page.getByTestId("editor-visuale")).toHaveCount(0);
    await shot(page, "visuale-mobile-modulo", testInfo);
    return;
  }

  // First time: Modulo. Visuale is one click away and is remembered.
  const modes = page.getByRole("group", { name: "Modalità dell'editor" });
  if (FORM_EDITOR_ENABLED) {
    await expect(modes.getByRole("button", { name: "Modulo" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".editor-grid")).toBeVisible();
    await modes.getByRole("button", { name: "Visuale" }).click();
  } else {
    // Modulo paused: Visuale from the first open, no toggle.
    await expect(modes).toHaveCount(0);
  }
  const visuale = page.getByTestId("editor-visuale");
  await expect(visuale).toBeVisible();
  await page.reload();
  await expect(visuale).toBeVisible();
  if (FORM_EDITOR_ENABLED) await expect(modes.getByRole("button", { name: "Visuale" })).toHaveAttribute("aria-pressed", "true");
  const sheet = visuale.locator(".qd-sheets");
  await expect(sheet).toContainText("Restyling visuale");
  await expect(visuale.locator(".ve-total")).toContainText("2.928,00");
  await page.waitForLoadState("networkidle");
  await shot(page, "visuale-panoramica", testInfo);
  expect(await seriousA11y(page, [".qd"])).toEqual([]);

  // Writing on the sheet: the cover title, in place.
  const title = sheet.locator('[data-edit-field="title"]').first();
  await title.click();
  const field = visuale.getByRole("textbox", { name: /Titolo/ });
  await expect(field).toBeFocused();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("Restyling del sito");
  await expect(visuale.locator(".ve-session-meta")).toBeVisible();
  await shot(page, "visuale-scrittura", testInfo);
  await page.keyboard.press("Enter");
  await expect(field).toHaveCount(0);
  await expect(title).toContainText("Restyling del sito");
  await saved(page);

  // Esc puts the text back as it was.
  await title.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("Testo da scartare");
  await page.keyboard.press("Escape");
  await expect(title).toContainText("Restyling del sito");

  // Price on the sheet: the line card, and the total from the server.
  await sheet.locator('[data-edit-kind="money"]').first().click();
  const card = visuale.getByRole("dialog", { name: /Importi della voce/ });
  await expect(card).toBeVisible();
  await card.getByLabel("Prezzo unitario").fill("3000");
  await card.getByLabel("Sconto").fill("10");
  await expect(card).toContainText("2.700,00");
  await shot(page, "visuale-prezzo", testInfo);
  await page.keyboard.press("Enter");
  await expect(card).toHaveCount(0);
  await saved(page);
  await expect(visuale.locator(".ve-total")).toContainText("3.294,00");
  await expect(visuale.locator(".ve-total")).toContainText("Calcolato dal server");

  // Insert between two blocks with "+": the picker, then a text block that opens selected.
  const before = await outlineTitles(page);
  const zone = visuale.locator(".ve-insert").nth(1);
  await zone.hover();
  await zone.getByRole("button", { name: "Aggiungi blocco" }).click();
  const picker = visuale.getByRole("dialog", { name: "Aggiungi blocco" });
  await expect(picker).toBeVisible();
  await expect(picker.getByRole("button", { name: /Copertina/ })).toBeDisabled();
  await page.waitForTimeout(400);
  await shot(page, "visuale-inserisci", testInfo);
  await picker.getByRole("searchbox").fill("testo");
  await page.keyboard.press("Enter");
  await expect(picker).toHaveCount(0);
  await expect.poll(() => outlineTitles(page)).toHaveLength(before.length + 1);
  const newTitle = visuale.getByRole("textbox", { name: /Titolo/ });
  await expect(newTitle).toBeFocused();
  await page.keyboard.type("Metodo di lavoro");
  await page.keyboard.press("Enter");
  await expect(sheet).toContainText("Metodo di lavoro");
  await saved(page);
  const inserted = await outlineTitles(page);
  const textIndex = inserted.indexOf("Metodo di lavoro");
  expect(textIndex).toBeGreaterThan(0);

  // Drag: the text block goes back above the block before it.
  const textBlock = sheet.locator("[data-block-id]").filter({ hasText: "Metodo di lavoro" }).first();
  const previousTitle = inserted[textIndex - 1] ?? "";
  const previous = sheet.locator("[data-block-id]").filter({ hasText: previousTitle }).first();
  await dragBlock(page, textBlock, previous, async () => {
    await expect(visuale.locator(".ve-drop-label")).toContainText(/Diventa la sezione/);
    await shot(page, "visuale-trascinamento", testInfo);
  });
  const position = async () => (await outlineTitles(page)).indexOf("Metodo di lavoro");
  await expect.poll(position).toBe(textIndex - 1);

  // Ctrl+Z undoes the move, Ctrl+Maiusc+Z does it again.
  await page.locator(".ve-bar").click({ position: { x: 4, y: 4 } });
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(position).toBe(textIndex);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect.poll(position).toBe(textIndex - 1);
  await saved(page);

  // The new order is saved.
  await page.reload();
  await expect(visuale).toBeVisible();
  await expect.poll(position).toBe(textIndex - 1);

  // Back to Modulo, remembered too (only while the Modulo view is enabled).
  if (!FORM_EDITOR_ENABLED) return;
  await modes.getByRole("button", { name: "Modulo" }).click();
  await expect(page.locator(".editor-grid")).toBeVisible();
  await expect(visuale).toHaveCount(0);
  await page.goto(quoteUrl);
  await expect(page.locator(".editor-grid")).toBeVisible();
  await expect(page.locator(".preview-panel .qd")).toContainText("Metodo di lavoro");
});
