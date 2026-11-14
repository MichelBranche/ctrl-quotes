import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const shotsDir = process.env.QA_SHOTS_DIR ?? "qa/screenshots/invio";

test.describe.configure({ mode: "serial" });

async function settle(page: Page) {
  await page.waitForTimeout(350);
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== "running"), null, { timeout: 3000 }).catch(() => undefined);
}

async function shot(page: Page, name: string, testInfo: TestInfo) {
  fs.mkdirSync(shotsDir, { recursive: true });
  const device = testInfo.project.name.includes("mobile") ? "mobile" : "desktop";
  await settle(page);
  await page.screenshot({ path: path.join(shotsDir, `${name}-${device}.png`) });
}

async function seriousA11y(page: Page) {
  await settle(page);
  const results = await new AxeBuilder({ page }).include("dialog[open]").analyze();
  return results.violations.filter((item) => item.impact === "serious" || item.impact === "critical").map((item) => `${item.id}: ${item.nodes.map((node) => node.html.slice(0, 160)).join(" | ")}`);
}

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

test("invio: modale, link, email in coda e Invia aggiornamento", async ({ page, request }, testInfo) => {
  test.setTimeout(120_000);
  const mobile = testInfo.project.name.includes("mobile");
  const suffix = mobile ? "M" : "D";
  const title = mobile ? "Invio mobile" : "Nuovo sito web";
  await newQuote(page, title, suffix);

  await page.getByRole("button", { name: "Invia", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Invia preventivo" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("A", { exact: true })).toHaveValue("progetti@atelier.example");
  await expect(dialog.getByLabel("Oggetto")).toHaveValue(`Il tuo preventivo per ${title}`);
  await expect(dialog.getByText("Il link viene creato all'invio")).toBeVisible();
  await expect(dialog.getByText("Il tuo preventivo è pronto")).toBeVisible();
  await expect(dialog.getByText(/Modalità prova/)).toBeVisible();
  expect(await seriousA11y(page)).toEqual([]);
  await shot(page, "01-invia", testInfo);

  await dialog.getByRole("radio", { name: "Solo link" }).click();
  await expect(dialog.getByRole("button", { name: "Crea link e segna come inviato" })).toBeVisible();
  await shot(page, "02-solo-link", testInfo);
  await dialog.getByRole("radio", { name: "Email con link" }).click();

  await dialog.getByRole("switch", { name: "Allega il PDF" }).check();
  await dialog.getByRole("button", { name: "Invia", exact: true }).click();
  const done = page.getByRole("dialog", { name: "Invia preventivo" });
  await expect(done.getByRole("heading", { name: "Preventivo inviato" })).toBeVisible();
  await expect(done.locator("code")).toContainText("/q/");
  await shot(page, "03-inviato", testInfo);
  await done.getByRole("button", { name: "Fatto" }).click();
  await expect(done).toBeHidden();

  await expect(page.getByRole("button", { name: "Invia aggiornamento" })).toBeVisible();
  await expect(page.locator(".editor-header, header").getByText("Inviato", { exact: true }).first()).toBeVisible();

  // The queue runs right after the response: the email lands in the dev mailbox with the PDF.
  let link = "";
  await expect
    .poll(
      async () => {
        const emails = (await (await request.get("/api/dev/emails")).json()) as Array<{ to: string; subject: string; text: string; attachments?: Array<{ filename: string }> }>;
        const email = emails.find((item) => item.to === "progetti@atelier.example" && item.subject === `Il tuo preventivo per ${title}` && item.attachments?.[0]?.filename.endsWith("-v1.pdf"));
        link = email?.text.match(/https?:\/\/\S+\/q\/[A-Za-z0-9_-]{43}/)?.[0] ?? "";
        return Boolean(link);
      },
      { timeout: 30_000 },
    )
    .toBe(true);

  // The client: no account, no cookies.
  const client = await page.context().browser()!.newContext({ viewport: page.viewportSize()!, locale: "it-IT", timezoneId: "Europe/Rome" });
  const clientPage = await client.newPage();
  const response = await clientPage.goto(link);
  expect(response?.headers()["x-robots-tag"]).toContain("noindex");
  await expect(clientPage.locator(".pq-brand")).toContainText("Studio Esempio");
  await expect(clientPage.getByText("Totale del preventivo")).toBeVisible();
  await settle(clientPage);
  await clientPage.waitForTimeout(2500);
  fs.mkdirSync(shotsDir, { recursive: true });
  await clientPage.screenshot({ path: path.join(shotsDir, `05-cliente-${mobile ? "mobile" : "desktop"}.png`) });
  const pdf = await clientPage.request.get(`${link}/pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  await clientPage.goto(link.replace(/\/q\/.+$/, `/q/${"z".repeat(43)}`));
  await expect(clientPage.getByRole("heading", { name: "Questo link non è più attivo" })).toBeVisible();
  await client.close();

  await page.getByRole("button", { name: "Invia aggiornamento" }).click();
  const update = page.getByRole("dialog", { name: "Invia aggiornamento" });
  await expect(update.locator(".send-linkbox code")).toContainText("/q/");
  await expect(update.getByText("Il preventivo è stato aggiornato")).toBeVisible();
  await shot(page, "04-aggiornamento", testInfo);
  await update.getByRole("button", { name: "Chiudi" }).click();
  await expect(update).toBeHidden();
});
