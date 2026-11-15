import { expect, test } from "@playwright/test";

test("la landing pubblica presenta il prodotto e porta alla registrazione", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/preventivi/i);
  const cta = page.locator(".lp-hero-actions a.lp-btn-lime");
  await expect(cta).toHaveAttribute("href", "/register");

  const pricing = page.locator("#prezzi");
  await pricing.scrollIntoViewIfNeeded();
  await expect(pricing.locator(".lp-plan.is-pro .lp-plan-price strong")).toHaveText("19");
  await expect(pricing.locator(".lp-plan.is-business .lp-plan-price strong")).toHaveText("49");
  await pricing.getByRole("button", { name: /Annuale/ }).click();
  await expect(pricing.locator(".lp-plan.is-pro .lp-plan-year")).toContainText("182,40");
  await expect(pricing.locator(".lp-plan.is-business .lp-plan-year")).toContainText("470,40");

  await expect(page.locator("footer a[href='/privacy']")).toBeVisible();
  await expect(page.locator("footer a[href='https://www.ctrlagency.dev']")).toBeVisible();
});

test("l'app resta protetta e la home non reindirizza più al login", async ({ page }) => {
  const res = await page.goto("/");
  expect(res?.status()).toBe(200);
  await page.goto("/app/overview");
  await expect(page).toHaveURL(/\/login/);
});
