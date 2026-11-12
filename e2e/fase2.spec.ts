import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const shotsDir = process.env.QA_SHOTS_DIR ?? "qa/screenshots/fase2";

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

function tag(testInfo: TestInfo): { suffix: string; mobile: boolean; device: string } {
  const mobile = testInfo.project.name.includes("mobile");
  return { suffix: mobile ? "M" : "D", mobile, device: mobile ? "mobile" : "desktop" };
}

async function shot(page: Page, name: string, testInfo: TestInfo) {
  fs.mkdirSync(shotsDir, { recursive: true });
  await page.waitForLoadState("networkidle");
  await page.addStyleTag({ content: "[data-sonner-toaster] { display: none !important; }" });
  await page.screenshot({ path: path.join(shotsDir, `${name}-${tag(testInfo).device}.png`), fullPage: true });
}

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

async function seriousA11y(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations.filter((item) => item.impact === "serious" || item.impact === "critical").map((item) => `${item.id}: ${item.nodes.map((node) => node.html.slice(0, 160)).join(" | ")}`);
}

test("clienti: crea, cerca, referenti, note, archivia e ripristina", async ({ page }, testInfo) => {
  const { suffix, mobile } = tag(testInfo);
  const name = `Studio Forma ${suffix}`;
  await page.goto("/app/clients");
  await expect(page.getByRole("heading", { level: 1, name: "Clienti" })).toBeVisible();
  if (!mobile) await shot(page, "clienti-vuoto", testInfo);

  await page.getByRole("button", { name: "Nuovo cliente" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Nuovo cliente" });
  await dialog.getByLabel("Nome o ragione sociale").fill(name);
  await dialog.getByLabel("Settore").fill("Agenzia creativa");
  await dialog.getByLabel("Email").fill("ciao@forma.example");
  await dialog.getByLabel("Telefono").fill("+39 02 0000 0000");
  await dialog.getByLabel("Sito web").fill("forma.example");
  await dialog.getByLabel("Indirizzo").fill("Via di prova 1, Milano");
  await dialog.getByRole("button", { name: "Crea cliente" }).click();
  await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
  await expect(page).toHaveURL(/id=/);

  await page.getByRole("tab", { name: /Referenti/ }).click();
  await page.getByRole("button", { name: "Aggiungi referente" }).click();
  const contact = page.getByRole("dialog", { name: "Nuovo referente" });
  await contact.getByLabel("Nome e cognome").fill("Luca Ferri");
  await contact.getByLabel("Ruolo").fill("Direttore creativo");
  await contact.getByLabel("Referente principale").check();
  await contact.getByRole("button", { name: "Salva referente" }).click();
  await expect(page.getByText("Luca Ferri")).toBeVisible();

  await page.getByRole("tab", { name: /Note/ }).click();
  await page.getByLabel("Nuova nota interna").fill("Interessato alla manutenzione dopo il lancio.");
  await page.getByRole("button", { name: "Aggiungi nota" }).click();
  await expect(page.getByText("Interessato alla manutenzione dopo il lancio.")).toBeVisible();

  await page.getByRole("tab", { name: "Panoramica" }).click();
  await expect(page.getByRole("tabpanel").getByText("Luca Ferri")).toBeVisible();
  await shot(page, "clienti-dettaglio", testInfo);
  if (mobile) await noOverflow(page);
  expect(await seriousA11y(page)).toEqual([]);

  await page.getByRole("button", { name: `Azioni per ${name}` }).click();
  await page.getByRole("menuitem", { name: /Modifica/ }).click();
  const edit = page.getByRole("dialog", { name: "Modifica cliente" });
  await edit.getByLabel("Stato").selectOption("prospect");
  await edit.getByRole("button", { name: "Salva modifiche" }).click();
  await expect(page.locator(".detail-card .badge").getByText("Prospect")).toBeVisible();

  await page.getByRole("button", { name: `Azioni per ${name}` }).click();
  await page.getByRole("menuitem", { name: /Archivia/ }).click();
  await expect(page.locator(".detail-card .badge").getByText("Archiviato")).toBeVisible();
  await page.goto("/app/clients?filter=archived");
  await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible();
  await page.goto("/app/clients");
  await expect(page.getByRole("link", { name: new RegExp(name) })).toHaveCount(0);
  await page.goto("/app/clients?filter=archived");
  await page.getByRole("link", { name: new RegExp(name) }).click();
  await page.getByRole("button", { name: `Azioni per ${name}` }).click();
  await page.getByRole("menuitem", { name: /Ripristina/ }).click();
  await expect(page.locator(".detail-card .badge").getByText("Cliente attivo")).toBeVisible();

  await page.goto("/app/clients");
  await page.getByLabel("Cerca cliente").fill(`forma ${suffix}`);
  await expect(page).toHaveURL(/q=forma/);
  await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible();
  await page.getByLabel("Cerca cliente").fill("nessun-risultato-xyz");
  await expect(page.getByText("Nessun cliente corrisponde a ricerca e filtri.")).toBeVisible();
});

test("clienti: import CSV con mapping, anteprima, doppioni ed errori", async ({ page }, testInfo) => {
  const { suffix } = tag(testInfo);
  const csv = [
    "Ragione sociale;Email;Tipo;Stato",
    `Atelier Milano ${suffix};atelier${suffix}@example.com;azienda;attivo`,
    `Mario Rossi ${suffix};mario${suffix}@example.com;privato;prospect`,
    `Doppione ${suffix};ATELIER${suffix}@example.com;azienda;`,
    `Errore ${suffix};non-una-mail;azienda;`,
  ].join("\n");
  await page.goto("/app/clients");
  await page.getByRole("button", { name: "Importa contatti" }).click();
  const dialog = page.getByRole("dialog", { name: "Importa clienti da CSV" });
  await dialog.locator('input[type="file"]').setInputFiles({ name: "clienti.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(dialog.getByText("2 da importare")).toBeVisible();
  await expect(dialog.getByText("1 doppioni saltati")).toBeVisible();
  await expect(dialog.getByText("1 con errori")).toBeVisible();
  await expect(dialog.getByLabel("Nome o ragione sociale *")).toHaveValue("0");
  await shot(page, "clienti-import-anteprima", testInfo);
  await dialog.getByLabel("Email", { exact: true }).selectOption("-1");
  await expect(dialog.getByText("4 da importare")).toBeVisible();
  await dialog.getByLabel("Email", { exact: true }).selectOption("1");
  await expect(dialog.getByText("2 da importare")).toBeVisible();
  await dialog.getByRole("button", { name: "Importa 2 clienti" }).click();
  await expect(dialog.getByText("2 clienti importati.")).toBeVisible();
  await dialog.getByRole("button", { name: "Chiudi" }).click();
  await page.getByLabel("Cerca cliente").fill(`Atelier Milano ${suffix}`);
  await expect(page.getByRole("link", { name: new RegExp(`Atelier Milano ${suffix}`) })).toBeVisible();
});

test("catalogo: categorie, servizio, pacchetto, duplica ed elimina", async ({ page }, testInfo) => {
  const { suffix, mobile } = tag(testInfo);
  await page.goto("/app/catalog");
  await expect(page.getByRole("heading", { level: 1, name: "Catalogo" })).toBeVisible();

  await page.getByRole("button", { name: "Categorie" }).click();
  const categories = page.getByRole("dialog", { name: "Categorie del catalogo" });
  await categories.getByLabel("Nuova categoria").fill(`Design ${suffix}`);
  await categories.getByRole("button", { name: "Aggiungi" }).click();
  await expect(categories.getByText(`Design ${suffix}`)).toBeVisible();
  await categories.getByRole("button", { name: "Chiudi" }).click();

  await page.getByRole("button", { name: "Nuovo elemento" }).first().click();
  let form = page.getByRole("dialog", { name: "Nuovo elemento" });
  await form.getByLabel("Nome").fill(`Design UX/UI ${suffix}`);
  await form.getByLabel("Descrizione").fill("Progettazione di interfacce accessibili.");
  await form.getByLabel("Prezzo (€)").fill("1.200,00");
  await form.getByLabel("Categoria").selectOption({ label: `Design ${suffix}` });
  await form.getByLabel("IVA", { exact: true }).selectOption("2200");
  await expect(form.getByText("Totale 1.464,00 €")).toBeVisible();
  await form.getByRole("button", { name: "Crea elemento" }).click();
  await expect(page.getByRole("heading", { level: 2, name: `Design UX/UI ${suffix}` })).toBeVisible();
  await expect(page.locator(".totals .total")).toContainText("1.464,00");

  if (mobile) await page.getByRole("link", { name: "Torna al catalogo" }).click();
  await page.getByRole("button", { name: "Nuovo elemento" }).first().click();
  form = page.getByRole("dialog", { name: "Nuovo elemento" });
  await form.getByText("Prodotto", { exact: true }).click();
  await form.getByLabel("Nome").fill(`Hosting ${suffix}`);
  await form.getByLabel("Prezzo (€)").fill("120");
  await form.getByLabel("Ricorrenza").selectOption("annuale");
  await form.getByRole("button", { name: "Crea elemento" }).click();
  await expect(page.getByRole("heading", { level: 2, name: `Hosting ${suffix}` })).toBeVisible();

  if (mobile) await page.getByRole("link", { name: "Torna al catalogo" }).click();
  await page.getByRole("button", { name: "Nuovo elemento" }).first().click();
  form = page.getByRole("dialog", { name: "Nuovo elemento" });
  await form.getByText("Pacchetto", { exact: true }).click();
  await form.getByLabel("Nome").fill(`Pacchetto Web ${suffix}`);
  await form.getByLabel("Prezzo (€)").fill("1.290");
  await form.getByLabel("Voce da aggiungere").selectOption({ label: `Design UX/UI ${suffix}` });
  await form.getByRole("button", { name: "Aggiungi" }).click();
  await form.getByLabel("Voce da aggiungere").selectOption({ label: `Hosting ${suffix}` });
  await form.getByRole("button", { name: "Aggiungi" }).click();
  await expect(form.getByText(/Valore delle voci: 1\.200,00\s€ una tantum, 120,00\s€ all'anno/)).toBeVisible();
  await form.getByRole("button", { name: "Crea elemento" }).click();
  await expect(page.getByRole("heading", { level: 2, name: `Pacchetto Web ${suffix}` })).toBeVisible();
  await expect(page.locator(".component-list li")).toHaveCount(2);
  await shot(page, "catalogo-pacchetto", testInfo);
  if (mobile) await noOverflow(page);

  await page.getByRole("button", { name: "Duplica" }).click();
  await expect(page.getByRole("heading", { level: 2, name: `Pacchetto Web ${suffix} (copia)` })).toBeVisible();
  await page.getByRole("button", { name: `Azioni per Pacchetto Web ${suffix} (copia)` }).click();
  await page.getByRole("menuitem", { name: /Elimina/ }).click();
  await page.getByRole("dialog", { name: "Eliminare l'elemento?" }).getByRole("button", { name: "Elimina" }).click();
  await expect(page.getByRole("heading", { level: 2, name: `Pacchetto Web ${suffix} (copia)` })).toHaveCount(0);

  await page.goto(`/app/catalog?q=${encodeURIComponent(`Design UX/UI ${suffix}`)}`);
  await page.getByRole("link", { name: new RegExp(`Design UX/UI ${suffix}`) }).click();
  await page.getByRole("button", { name: `Azioni per Design UX/UI ${suffix}` }).click();
  await expect(page.getByRole("menuitem", { name: /Elimina/ })).toHaveAttribute("aria-disabled", "true");
  await page.keyboard.press("Escape");

  await page.goto("/app/catalog?type=pacchetto");
  await expect(page.getByRole("link", { name: new RegExp(`Pacchetto Web ${suffix}`) })).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(`Hosting ${suffix}`) })).toHaveCount(0);
  await page.goto("/app/catalog");
  await shot(page, "catalogo-lista", testInfo);
  expect(await seriousA11y(page)).toEqual([]);
});

test("template: preferiti e predefinito persistono", async ({ page }, testInfo) => {
  const { mobile } = tag(testInfo);
  await page.goto("/app/templates");
  await expect(page.getByRole("heading", { level: 1, name: "Libreria template" })).toBeVisible();
  for (const name of ["Minimal", "Editorial", "Corporate", "Bold"]) {
    await expect(page.getByRole("link", { name: `Dettagli del template ${name}` })).toBeVisible();
  }
  const fav = page.getByRole("button", { name: /Bold (ai|dai) preferiti/ });
  const before = await fav.getAttribute("aria-pressed");
  await fav.click();
  await expect(fav).toHaveAttribute("aria-pressed", before === "true" ? "false" : "true");
  if (before === "true") await fav.click();
  await expect(page.getByRole("button", { name: "Togli Bold dai preferiti" })).toBeVisible();
  await page.goto("/app/templates?view=favorites");
  await expect(page.getByRole("link", { name: "Dettagli del template Bold" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Dettagli del template Minimal" })).toHaveCount(0);

  const target = mobile ? "Minimal" : "Editorial";
  await page.goto(`/app/templates?t=${target.toLowerCase()}`);
  await page.waitForLoadState("networkidle");
  const useButton = page.locator(".template-detail").getByRole("button", { name: `Usa ${target} come predefinito` });
  if (await useButton.count()) await useButton.click();
  await expect(page.getByText("I nuovi preventivi useranno questo template.")).toBeVisible();
  await page.reload();
  await expect(page.locator(".template-detail .badge").getByText("Predefinito")).toBeVisible();
  await page.goto("/app/templates?t=editorial");
  await shot(page, "template", testInfo);
  if (mobile) await noOverflow(page);
  expect(await seriousA11y(page)).toEqual([]);
});

test("brand kit: logo, colori, dati aziendali salvati", async ({ page }, testInfo) => {
  const { suffix, mobile } = tag(testInfo);
  await page.goto("/app/settings/brand");
  await expect(page.getByRole("heading", { level: 1, name: "Brand Kit" })).toBeVisible();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="40" viewBox="0 0 160 40"><rect width="160" height="40" rx="8" fill="#0B0B0F"/><text x="16" y="27" font-family="Arial" font-size="20" fill="#fff">ESEMPIO</text></svg>`;
  await page.locator('input[type="file"]').setInputFiles({ name: "logo.svg", mimeType: "image/svg+xml", buffer: Buffer.from(svg) });
  await expect(page.getByRole("img", { name: /Logo di/ })).toBeVisible();
  const evil = `<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>`;
  await page.locator('input[type="file"]').setInputFiles({ name: "evil.svg", mimeType: "image/svg+xml", buffer: Buffer.from(evil) });
  await expect(page.locator(".field-error").getByText(/script o riferimenti esterni/)).toBeVisible();

  await page.getByLabel("Nome azienda").fill(`Studio Esempio ${suffix}`);
  await page.getByLabel("Secondario", { exact: true }).fill("#2563EB");
  await page.getByLabel("Titoli").selectOption("Instrument Serif");
  await expect(page.getByText("Modifiche non salvate")).toBeVisible();
  await page.getByRole("button", { name: "Salva modifiche" }).click();
  await expect(page.getByText("Modifiche salvate")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Nome azienda")).toHaveValue(`Studio Esempio ${suffix}`);
  await expect(page.getByLabel("Secondario", { exact: true })).toHaveValue("#2563EB");
  await expect(page.getByLabel("Partita IVA")).toHaveValue("");
  await shot(page, "brand-kit", testInfo);
  if (mobile) await noOverflow(page);
  expect(await seriousA11y(page)).toEqual([]);
});

test("impostazioni: fiscale, numerazione, condizioni e team", async ({ page }, testInfo) => {
  const { mobile } = tag(testInfo);
  await page.goto("/app/settings/fiscal");
  await page.getByLabel("Aliquota IVA predefinita").selectOption(mobile ? "2200" : "1000");
  await page.getByRole("button", { name: "Salva modifiche" }).click();
  await expect(page.getByText("Modifiche salvate")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Aliquota IVA predefinita")).toHaveValue(mobile ? "2200" : "1000");
  await shot(page, "impostazioni-fiscale", testInfo);

  await page.goto("/app/settings/numbering");
  await page.getByLabel("Formato").fill("PREV-{YY}");
  await expect(page.getByText("Il formato deve contenere un solo contatore")).toBeVisible();
  await expect(page.getByRole("button", { name: "Salva modifiche" })).toBeDisabled();
  const preset = mobile ? "{YYYY}/{000}" : "PREV-{YY}-{0000}";
  await page.getByRole("button", { name: preset }).click();
  await expect(page.locator(".number-preview strong")).toHaveText(mobile ? /\d{4}\/001/ : /PREV-\d{2}-0001/);
  await page.getByRole("button", { name: "Salva modifiche" }).click();
  await expect(page.getByText("Modifiche salvate")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Formato")).toHaveValue(preset);
  await shot(page, "impostazioni-numerazione", testInfo);

  await page.goto("/app/settings/terms");
  const days = mobile ? "60" : "45";
  await page.getByLabel("Validità predefinita (giorni)").fill(days);
  await page.getByLabel("Condizioni predefinite").fill(`La proposta è valida ${days} giorni. Prezzi IVA esclusa.`);
  await page.getByRole("button", { name: "Salva modifiche" }).click();
  await expect(page.getByText("Modifiche salvate")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Validità predefinita (giorni)")).toHaveValue(days);
  await shot(page, "impostazioni-condizioni", testInfo);

  await page.goto("/app/settings/team");
  await expect(page.getByRole("heading", { level: 1, name: "Team e ruoli" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Invita membro" })).toBeDisabled();
  await expect(page.getByText(/Giulia Neri/).locator("visible=true").first()).toBeVisible();
  await shot(page, "impostazioni-team", testInfo);
  if (mobile) await noOverflow(page);
  expect(await seriousA11y(page)).toEqual([]);
});

test("isolamento: un altro workspace non legge il logo né i clienti", async ({ page, browser }, testInfo) => {
  test.skip(tag(testInfo).mobile, "Verificato una volta su desktop");
  await page.goto("/app/settings/brand");
  const src = await page.getByRole("img", { name: /Logo di/ }).getAttribute("src");
  expect(src).toMatch(/^\/api\/assets\//);
  const own = await page.request.get(src!);
  expect(own.status()).toBe(200);
  expect(own.headers()["content-security-policy"]).toContain("sandbox");

  const other = await browser.newContext({ storageState: "e2e/.auth/other.json" });
  const otherPage = await other.newPage();
  const stolen = await otherPage.request.get(src!);
  expect(stolen.status()).toBe(404);
  await otherPage.goto("/app/clients?q=Studio%20Forma");
  await expect(otherPage.getByText("La rubrica è vuota. Aggiungi il primo cliente o importa un CSV.")).toBeVisible();
  await otherPage.goto("/app/catalog");
  await expect(otherPage.getByText("Il catalogo è vuoto. Crea il primo servizio o prodotto.")).toBeVisible();
  await other.close();
});
