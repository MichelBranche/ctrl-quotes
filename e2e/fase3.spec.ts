import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const shotsDir = process.env.QA_SHOTS_DIR ?? "qa/screenshots/fase3";

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

function tag(testInfo: TestInfo): { suffix: string; mobile: boolean; device: string } {
  const mobile = testInfo.project.name.includes("mobile");
  return { suffix: mobile ? "M" : "D", mobile, device: mobile ? "mobile" : "desktop" };
}

async function shot(page: Page, name: string, testInfo: TestInfo, fullPage = true) {
  fs.mkdirSync(shotsDir, { recursive: true });
  await page.waitForLoadState("networkidle");
  await page.addStyleTag({ content: "[data-sonner-toaster] { display: none !important; }" });
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    for (const element of document.querySelectorAll<HTMLElement>("*")) if (element.scrollTop > 0 && !element.classList.contains("preview-scroll")) element.scrollTop = 0;
  });
  await page.screenshot({ path: path.join(shotsDir, `${name}-${tag(testInfo).device}.png`), fullPage });
}

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

async function seriousA11y(page: Page, exclude: string[] = []) {
  let builder = new AxeBuilder({ page });
  for (const selector of exclude) builder = builder.exclude(selector);
  const results = await builder.analyze();
  return results.violations.filter((item) => item.impact === "serious" || item.impact === "critical").map((item) => `${item.id}: ${item.nodes.map((node) => node.html.slice(0, 160)).join(" | ")}`);
}

async function pngLogo(page: Page): Promise<Buffer> {
  const data = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 360;
    canvas.height = 96;
    const context = canvas.getContext("2d");
    if (!context) return "";
    context.fillStyle = "#0B0B0F";
    context.beginPath();
    context.arc(48, 48, 34, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "#FFFFFF";
    context.font = "bold 30px sans-serif";
    context.fillText("E", 38, 59);
    context.fillStyle = "#0B0B0F";
    context.font = "600 40px sans-serif";
    context.fillText("Esempio", 100, 62);
    return canvas.toDataURL("image/png").split(",")[1] ?? "";
  });
  return Buffer.from(data, "base64");
}

test("preventivi: wizard, editor, versione, PDF e storico cliente", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const { suffix, mobile, device } = tag(testInfo);
  const clientName = `Atelier Nord ${suffix}`;
  const itemName = `Sviluppo sito ${suffix}`;

  // Brand kit with a raster logo, so the PDF shows it.
  await page.goto("/app/settings/brand");
  await page.locator('input[type="file"]').setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: await pngLogo(page) });
  await expect(page.getByRole("img", { name: /Logo di/ })).toBeVisible();
  await page.getByLabel("Nome azienda").fill("Studio Esempio");
  const saveBrand = page.getByRole("button", { name: "Salva modifiche" });
  if (await saveBrand.isEnabled()) {
    await saveBrand.click();
    await expect(page.getByText("Modifiche salvate")).toBeVisible();
  }

  // Client and catalog item from phase 2.
  await page.goto("/app/clients");
  await page.getByRole("button", { name: "Nuovo cliente" }).first().click();
  const clientDialog = page.getByRole("dialog", { name: "Nuovo cliente" });
  await clientDialog.getByLabel("Nome o ragione sociale").fill(clientName);
  await clientDialog.getByLabel("Email").fill("progetti@atelier.example");
  await clientDialog.getByLabel("Indirizzo").fill("Via di prova 10, Torino");
  await clientDialog.getByRole("button", { name: "Crea cliente" }).click();
  await expect(page.getByRole("heading", { level: 2, name: clientName })).toBeVisible();
  const clientUrl = page.url();

  await page.goto("/app/catalog");
  await page.getByRole("button", { name: "Nuovo elemento" }).first().click();
  const itemDialog = page.getByRole("dialog", { name: "Nuovo elemento" });
  await itemDialog.getByLabel("Nome").fill(itemName);
  await itemDialog.getByLabel("Descrizione").fill("Sito in Next.js con area riservata e pannello contenuti.");
  await itemDialog.getByLabel("Prezzo (€)").fill("2.400,00");
  await itemDialog.getByLabel("IVA", { exact: true }).selectOption("2200");
  await itemDialog.getByRole("button", { name: "Crea elemento" }).click();
  await expect(page.getByRole("heading", { level: 2, name: itemName })).toBeVisible();

  // Wizard.
  await page.goto("/app/quotes");
  await expect(page.getByRole("heading", { level: 1, name: "Preventivi" })).toBeVisible();
  await page.getByRole("link", { name: "Nuovo preventivo" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Nuovo preventivo" })).toBeVisible();
  await page.getByLabel("Cerca cliente").fill(clientName);
  await page.getByRole("option", { name: new RegExp(clientName) }).click();
  await page.getByRole("button", { name: "Continua" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Scegli lo stile" })).toBeVisible();
  await page.getByRole("radio", { name: mobile ? /Bold/ : /Editorial/ }).click();
  await shot(page, "wizard-template", testInfo);
  if (mobile) await noOverflow(page);
  await page.getByRole("button", { name: "Continua" }).click();
  await page.getByLabel("Titolo del preventivo").fill(`Nuovo sito web ${suffix}`);
  await page.getByLabel("Introduzione (facoltativa)").fill("Proposta per il nuovo sito: progettazione, sviluppo e messa online.");
  await page.getByLabel("Cerca nel catalogo").fill(itemName);
  await page.getByRole("checkbox", { name: new RegExp(itemName) }).check();
  await expect(page.locator(".wizard-estimate strong")).toContainText("2.928,00");
  await shot(page, "wizard-contenuti", testInfo);
  if (mobile) await noOverflow(page);
  expect(await seriousA11y(page)).toEqual([]);
  await page.getByRole("button", { name: "Crea e apri l'editor" }).click();
  await expect(page).toHaveURL(/\/app\/quotes\/(?!new)[^/?]+$/);
  const quoteId = page.url().split("/").pop() ?? "";
  await expect(page.locator(".editor-title h1")).toContainText(`Nuovo sito web ${suffix}`);
  const number = (await page.locator(".editor-crumbs span").textContent())?.trim() ?? "";
  expect(number).not.toBe("Senza numero");

  // Editor: add a free line and wait for autosave.
  if (mobile) await page.getByRole("button", { name: "Struttura", exact: true }).click();
  await page.locator(".block-select", { hasText: "Servizi inclusi" }).click();
  await expect(page.getByRole("heading", { level: 2, name: /Servizi/ })).toBeVisible();
  await page.getByRole("button", { name: "Voce libera" }).click();
  await page.getByLabel("Nome", { exact: true }).last().fill("Manutenzione annuale");
  await page.getByLabel("Prezzo unitario").last().fill("300");
  await page.getByLabel("Prezzo unitario").last().blur();
  await expect(page.getByText(/Salvato alle/)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".preview-total strong")).toContainText("3.294,00");
  if (mobile) {
    await page.getByRole("button", { name: "Anteprima", exact: true }).click();
    await expect(page.locator(".preview-panel .qd")).toBeVisible();
    await shot(page, "editor-anteprima", testInfo, false);
    await page.getByRole("button", { name: "Contenuto", exact: true }).click();
  }
  await shot(page, "editor", testInfo, !mobile);
  if (mobile) await noOverflow(page);
  expect(await seriousA11y(page, [".qd"])).toEqual([]);

  // Autosave persisted.
  await page.reload();
  await expect(page.locator(".preview-total strong")).toContainText("3.294,00");

  // Freeze a version.
  await page.getByRole("button", { name: "Salva versione" }).click();
  await expect(page.getByRole("tab", { name: /Versioni \(1\)/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText(/Versione 1/).first()).toBeVisible();
  await shot(page, "editor-versioni", testInfo);

  // Version PDF: vector, A4, served privately.
  const pdf = await page.request.get(`/api/quotes/${quoteId}/pdf?v=1`);
  expect(pdf.status(), await pdf.text().catch(() => "")).toBe(200);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  expect(pdf.headers()["cache-control"]).toContain("no-store");
  const bytes = await pdf.body();
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  fs.mkdirSync(shotsDir, { recursive: true });
  fs.writeFileSync(path.join(shotsDir, `preventivo-v1-${device}.pdf`), bytes);
  const draft = await page.request.get(`/api/quotes/${quoteId}/pdf`);
  expect(draft.status()).toBe(200);

  // Full preview of version 1.
  await page.goto(`/app/quotes/${quoteId}/preview?v=1`);
  await expect(page.locator(".qd")).toBeVisible();
  await expect(page.getByText("3.294,00").first()).toBeVisible();
  await shot(page, "anteprima-versione", testInfo);
  if (mobile) await noOverflow(page);

  // Client history.
  await page.goto(clientUrl);
  const history = page.getByRole("region", { name: "Storico preventivi" });
  await expect(history.getByText(`Nuovo sito web ${suffix}`)).toBeVisible();
  await expect(history.getByText(number)).toBeVisible();
  await history.scrollIntoViewIfNeeded();
  await shot(page, "cliente-storico", testInfo);
  if (mobile) await noOverflow(page);

  // List with search.
  await page.goto(`/app/quotes?q=${encodeURIComponent(`Nuovo sito web ${suffix}`)}`);
  await expect(page.getByText(number).first()).toBeVisible();
  await page.goto("/app/quotes");
  await shot(page, "preventivi-lista", testInfo);
  if (mobile) await noOverflow(page);
  expect(await seriousA11y(page)).toEqual([]);
});

test("preventivi: un altro workspace non legge PDF né editor", async ({ page, browser }, testInfo) => {
  test.skip(tag(testInfo).mobile, "Verificato una volta su desktop");
  await page.goto("/app/quotes");
  const href = await page.locator("a.quote-main").first().getAttribute("href");
  expect(href).toMatch(/^\/app\/quotes\/[^/]+$/);
  const quoteId = href?.split("/").pop() ?? "";
  expect((await page.request.get(`/api/quotes/${quoteId}/pdf`)).status()).toBe(200);

  const other = await browser.newContext({ storageState: "e2e/.auth/other.json" });
  const otherPage = await other.newPage();
  expect((await otherPage.request.get(`/api/quotes/${quoteId}/pdf`)).status()).toBe(404);
  expect((await otherPage.request.get(`/api/quotes/${quoteId}/pdf?v=1`)).status()).toBe(404);
  await otherPage.goto(`/app/quotes/${quoteId}`);
  await expect(otherPage.getByText("Preventivo non disponibile").first()).toBeVisible();
  await otherPage.goto("/app/quotes");
  await expect(otherPage.locator("a.quote-main")).toHaveCount(0);
  await other.close();

  const anonymous = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  expect((await anonymous.request.get(`/api/quotes/${quoteId}/pdf`, { maxRedirects: 0 })).status()).toBe(401);
  await anonymous.close();
});
