import { execFileSync } from "node:child_process";
import { createClient } from "@libsql/client";
import { expect, test } from "@playwright/test";

/** Redeem flow end to end: error, success, plan label in the sidebar. Set QA_SHOTS=dir to save screenshots. */
test("riscatto di un codice dalla pagina Piani", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "un solo giro basta: il codice cambia il piano del workspace condiviso");
  const shots = process.env.QA_SHOTS;
  const env = { ...process.env, DATABASE_URL: "file:./data/e2e.db" };
  const out = execFileSync("node", ["--experimental-strip-types", "scripts/redeem-code.ts", "--plan", "pro", "--kind", "free_month", "--days", "30"], { env, encoding: "utf8" });
  const code = out.match(/CQ-[A-Z0-9]{4}-[A-Z0-9]{4}/)?.[0];
  expect(code).toBeTruthy();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app/settings/billing");
  const trigger = page.getByRole("button", { name: "Hai un codice?" });
  await expect(trigger).toBeVisible();
  await page.waitForTimeout(1200);
  if (shots) {
    await trigger.hover();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${shots}/codice-tasto-1440.png` });
  }

  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Hai un codice?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Codice")).toBeFocused();
  await page.waitForTimeout(500);
  if (shots) await page.screenshot({ path: `${shots}/codice-modale-1440.png` });

  await dialog.getByLabel("Codice").fill("NON-ESISTE");
  await dialog.getByRole("button", { name: "Riscatta" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Codice non valido");
  await page.waitForTimeout(500);
  if (shots) await page.screenshot({ path: `${shots}/codice-errore-1440.png` });

  await dialog.getByLabel("Codice").fill(code!.toLowerCase());
  await dialog.getByRole("button", { name: "Riscatta" }).click();
  const done = page.getByRole("dialog", { name: "Codice riscattato" });
  await expect(done).toContainText("Hai sbloccato il Piano Pro per 30 giorni");
  await page.waitForTimeout(600);
  if (shots) await page.screenshot({ path: `${shots}/codice-successo-1440.png` });
  await expect(page.locator(".bl-current")).toContainText("Piano Pro");

  await done.getByRole("button", { name: "Fatto" }).click();
  await expect(done).toBeHidden();
  await expect(trigger).toBeFocused();

  // Second attempt with the same code: already used.
  await trigger.click();
  await dialog.getByLabel("Codice").fill(code!);
  await dialog.getByRole("button", { name: "Riscatta" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Hai già usato questo codice");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // Back to the trial so the other specs keep seeing "Piano di prova".
  const db = createClient({ url: "file:./data/e2e.db" });
  await db.execute("update workspaces set plan_override = null, plan_override_until = null");
  db.close();
});
