import { expect, test } from "@playwright/test";

test("la landing pubblica presenta il prodotto e porta alla registrazione", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/preventivi/i);
  const cta = page.locator(".lp-hero-actions a.lp-btn-lime");
  await expect(cta).toHaveAttribute("href", "/register");

  const pricing = page.locator("#prezzi");
  await pricing.scrollIntoViewIfNeeded();
  await expect(pricing.locator(".lp-plan.is-starter .lp-plan-price strong")).toHaveText("9");
  await expect(pricing.locator(".lp-plan.is-pro .lp-plan-price strong")).toHaveText("19");
  await expect(pricing.locator(".lp-plan.is-business .lp-plan-price strong")).toHaveText("49");
  await pricing.getByRole("button", { name: /Annuale/ }).click();
  await expect(pricing.locator(".lp-plan.is-starter .lp-plan-year")).toContainText("86,40");
  await expect(pricing.locator(".lp-plan.is-pro .lp-plan-year")).toContainText("182,40");
  await expect(pricing.locator(".lp-plan.is-business .lp-plan-year")).toContainText("470,40");

  await expect(page.locator("footer a[href='mailto:hello@ctrlagency.dev']")).toBeVisible();
  await expect(page.locator(".lp-faq a[href='mailto:hello@ctrlagency.dev']")).toBeVisible();
  await expect(page.locator("footer a[href='/privacy']")).toBeVisible();
  await expect(page.locator("footer a[href='https://www.ctrlagency.dev']")).toBeVisible();
});

test("l'app resta protetta e la home non reindirizza più al login", async ({ page }) => {
  const res = await page.goto("/");
  expect(res?.status()).toBe(200);
  await page.goto("/app/overview");
  await expect(page).toHaveURL(/\/login/);
});

test("un cookie di sessione scaduto non blocca la landing", async ({ page, context, baseURL }) => {
  const url = new URL(baseURL ?? "http://127.0.0.1:3100");
  await context.addCookies([{ name: "better-auth.session_token", value: "scaduto.firma", domain: url.hostname, path: "/" }]);
  // With a cookie the home sends to the app; the app rejects it and the expired page clears it.
  await page.goto("/");
  await expect(page).toHaveURL(/\/session-expired/);
  const res = await page.goto("/");
  expect(res?.status()).toBe(200);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/preventivi/i);
  // The explicit opt-out always shows the landing.
  await context.addCookies([{ name: "better-auth.session_token", value: "scaduto.firma", domain: url.hostname, path: "/" }]);
  await page.goto("/?home=1");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/preventivi/i);
});
