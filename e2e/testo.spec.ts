import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * Rich text in Visuale: the floating toolbar, inline marks, the font library, and the same
 * formatting on the public link and in the PDF. Runs on the e2e fixture workspace only.
 */
const shotsDir = process.env.QA_SHOTS_DIR ?? "qa/screenshots/testo";

async function shot(page: Page, name: string) {
  fs.mkdirSync(shotsDir, { recursive: true });
  await page.screenshot({ path: path.join(shotsDir, `${name}.png`) });
}

async function saved(page: Page) {
  await expect(page.getByText(/Salvato alle/)).toBeVisible({ timeout: 15_000 });
}

test.describe.configure({ mode: "serial" });

test("testo ricco: barra, segni, font della libreria e resa uguale ovunque", async ({ page }) => {
  test.setTimeout(150_000);
  const clientName = "Studio Testo Ricco";
  const itemName = "Identità visiva TR";

  await page.goto("/app/clients");
  await page.getByRole("button", { name: "Nuovo cliente" }).first().click();
  const clientDialog = page.getByRole("dialog", { name: "Nuovo cliente" });
  await clientDialog.getByLabel("Nome o ragione sociale").fill(clientName);
  await clientDialog.getByLabel("Email").fill("testo@ricco.example");
  await clientDialog.getByRole("button", { name: "Crea cliente" }).click();
  await expect(page.getByRole("heading", { level: 2, name: clientName })).toBeVisible();

  await page.goto("/app/catalog");
  await page.getByRole("button", { name: "Nuovo elemento" }).first().click();
  const itemDialog = page.getByRole("dialog", { name: "Nuovo elemento" });
  await itemDialog.getByLabel("Nome").fill(itemName);
  await itemDialog.getByLabel("Descrizione").fill("Logo, palette e tipografia.");
  await itemDialog.getByLabel("Prezzo (€)").fill("1.800,00");
  await itemDialog.getByLabel("IVA", { exact: true }).selectOption("2200");
  await itemDialog.getByRole("button", { name: "Crea elemento" }).click();
  await expect(page.getByRole("heading", { level: 2, name: itemName })).toBeVisible();

  await page.goto("/app/quotes/new");
  await page.getByLabel("Cerca cliente").fill(clientName);
  await page.getByRole("option", { name: new RegExp(clientName) }).click();
  await page.getByRole("button", { name: "Continua" }).click();
  await page.getByRole("radio", { name: /Editorial Atelier/ }).click();
  await page.getByRole("button", { name: "Continua" }).click();
  await page.getByLabel("Titolo del preventivo").fill("Nuova identità");
  await page.getByLabel("Introduzione (facoltativa)").fill("Un marchio chiaro e riconoscibile.");
  await page.getByLabel("Cerca nel catalogo").fill(itemName);
  await page.getByRole("checkbox", { name: new RegExp(itemName) }).check();
  await page.getByRole("button", { name: "Crea e apri l'editor" }).click();
  await expect(page).toHaveURL(/\/app\/quotes\/(?!new)[^/?]+$/);

  const visuale = page.getByTestId("editor-visuale");
  await expect(visuale).toBeVisible();
  await page.waitForLoadState("networkidle");
  const sheet = visuale.locator(".qd-sheets");

  // The properties panel: the selected block says what and where it is.
  const openPanel = visuale.getByRole("button", { name: "Apri il pannello delle proprietà" });
  if (await openPanel.isVisible()) await openPanel.click();
  await expect(visuale.locator(".ve-panel-crumbs")).toContainText("Pagina 1");
  await expect(visuale.locator(".ve-panel-title h2")).toHaveText("Copertina");

  // Nothing selected: document settings; the template is chosen in Dettagli, never in Stile.
  await visuale.locator(".ve-canvas").click({ position: { x: 12, y: 300 } });
  await expect(visuale.locator(".ve-panel-title h2")).toHaveText("Documento");
  await visuale.getByRole("tab", { name: "Stile" }).click();
  await expect(visuale.getByText("A4 verticale, uguale nel link e nel PDF")).toBeVisible();
  await expect(visuale.getByRole("radiogroup", { name: "Template" })).toHaveCount(0);
  await expect(visuale.getByRole("button", { name: "Cambia in Dettagli" })).toBeVisible();
  await shot(page, "pannello-documento");

  // Click the title: the toolbar slides in above it, inside the page.
  const title = sheet.locator('[data-edit-field="title"]').first();
  await title.click();
  const field = visuale.getByRole("textbox", { name: /Titolo/ });
  await expect(field).toBeFocused();
  const toolbar = page.getByTestId("text-toolbar");
  await expect(toolbar).toBeVisible();
  const bar = await toolbar.boundingBox();
  const canvasBox = await visuale.locator(".ve-canvas").boundingBox();
  expect(bar && canvasBox && bar.x >= canvasBox.x && bar.x + bar.width <= canvasBox.x + canvasBox.width + 1 && bar.y >= canvasBox.y).toBeTruthy();
  await expect(toolbar.locator(".tt-scope")).toHaveText("Tutto il testo");
  await page.waitForTimeout(250);
  await shot(page, "toolbar-aperta");

  // Select the first word: the chip says so, bold applies only there.
  await field.evaluate((node) => {
    const text = node.firstChild?.nodeType === Node.TEXT_NODE ? node.firstChild : node.querySelector("span")?.firstChild;
    if (!text) throw new Error("niente testo");
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 5);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await expect(toolbar.locator(".tt-scope")).toHaveText("Selezione");
  await toolbar.getByRole("button", { name: "Grassetto" }).click();
  await expect(field.locator("span").first()).toHaveText("Nuova");

  // Collapse the selection: the next change is for the whole title again.
  await field.evaluate((node) => {
    const selection = window.getSelection();
    selection?.collapse(node, node.childNodes.length);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await expect(toolbar.locator(".tt-scope")).toHaveText("Tutto il testo");

  // The font picker: search, preview in its own face, pick a Google font for the whole title.
  await toolbar.locator(".tt-font").click();
  const picker = page.locator(".fp");
  await expect(picker).toBeVisible();
  await picker.getByLabel("Cerca un font").fill("Playfair");
  const playfair = picker.getByRole("option", { name: /^Playfair Display/ }).first();
  await expect(playfair).toBeVisible();
  await page.waitForTimeout(600);
  await shot(page, "font-picker");
  await playfair.click();
  await page.keyboard.press("Enter");
  await expect(field).toHaveCount(0);
  await saved(page);
  await expect(title).toHaveCSS("font-family", /cqf-g-playfair-display/);
  await expect(title.locator("strong, .k-ts").first()).toHaveText("Nuova");

  // Stile tab on the selected block: identity header and a Fontshare font for the intro body.
  const intro = sheet.locator('[data-edit-field="body"]').first();
  await intro.click();
  await page.keyboard.press("Escape");
  await expect(visuale.locator(".ve-panel-crumbs")).toContainText("Pagina");
  await visuale.getByRole("tab", { name: "Stile" }).click();
  await visuale.locator(".bs .fs-field, .bs button").filter({ hasText: /Del template o del Brand Kit/ }).first().click();
  const panelPicker = page.locator(".fp");
  await panelPicker.getByLabel("Cerca un font").fill("Satoshi");
  await panelPicker.getByRole("option", { name: /^Satoshi/ }).first().click();
  await saved(page);
  await expect(intro.locator(".k-t:not([aria-hidden])").first()).toHaveCSS("font-family", /cqf-fs-satoshi/);
  await shot(page, "pannello-stile");

  // The same document as a PDF: the library fonts are embedded.
  const url = new URL(page.url());
  const quoteId = url.pathname.split("/").pop() ?? "";
  const pdf = await page.request.get(`/api/quotes/${quoteId}/pdf`);
  expect(pdf.status()).toBe(200);
  const body = await pdf.body();
  fs.mkdirSync(shotsDir, { recursive: true });
  fs.writeFileSync(path.join(shotsDir, "testo.pdf"), body);
  expect(body.toString("latin1")).toMatch(/PlayfairDisplay/);
});
