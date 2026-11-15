/**
 * Headless check: at rest the sidebar pill must match the active item box (<= 1px)
 * at 1024, 1440 and with a collapsed sidebar.
 *
 *   ENABLE_COMPONENT_CATALOG=1 npx playwright test -c playwright.nav-pill.config.ts
 */
import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

const outDir = path.join(process.cwd(), "qa/screenshots/nav-pill");

const sections = [
  { slug: "overview", label: "Overview" },
  { slug: "quotes", label: "Preventivi" },
  { slug: "clients", label: "Clienti" },
  { slug: "catalog", label: "Catalogo" },
] as const;

type Delta = { left: number; top: number; width: number; height: number; max: number };

async function waitRest(page: Page): Promise<Delta> {
  await page.locator(".sidebar-desktop .nav-pill.is-ready").waitFor({ state: "visible" });
  // Let the spring settle, then snap to scale 1.
  await expect
    .poll(async () => (await deltas(page)).max, { timeout: 2500, intervals: [50, 80, 100] })
    .toBeLessThanOrEqual(1);
  return deltas(page);
}

async function deltas(page: Page): Promise<Delta> {
  return page.locator(".sidebar-desktop").evaluate((root) => {
    const item = root.querySelector<HTMLElement>("a.nav-link[aria-current='page']");
    const pill = root.querySelector<HTMLElement>(".nav-pill");
    if (!item || !pill) return { left: 99, top: 99, width: 99, height: 99, max: 99 };
    const a = item.getBoundingClientRect();
    const b = pill.getBoundingClientRect();
    const left = Math.abs(a.left - b.left);
    const top = Math.abs(a.top - b.top);
    const width = Math.abs(a.width - b.width);
    const height = Math.abs(a.height - b.height);
    return { left, top, width, height, max: Math.max(left, top, width, height) };
  });
}

async function shot(page: Page, name: string): Promise<string> {
  const file = path.join(outDir, `${name}.png`);
  await page.locator(".sidebar-desktop").screenshot({ path: file });
  return file;
}

async function assertRest(page: Page, name: string): Promise<{ file: string; delta: Delta }> {
  const delta = await waitRest(page);
  const file = await shot(page, name);
  expect(delta.max, `${name} ${JSON.stringify(delta)}`).toBeLessThanOrEqual(1);
  return { file, delta };
}

for (const width of [1024, 1440] as const) {
  test.describe(`sidebar pill at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test(`matches the active item at rest (${width})`, async ({ page }) => {
      const reports: string[] = [];
      await page.goto("/dev/nav-indicator/overview");
      const first = await assertRest(page, `${width}-overview`);
      reports.push(`${width}-overview max=${first.delta.max.toFixed(2)} ${first.file}`);

      for (const section of sections.slice(1)) {
        await page.locator(`.sidebar-desktop a.nav-link[href='/dev/nav-indicator/${section.slug}']`).click();
        await expect(page).toHaveURL(new RegExp(`/dev/nav-indicator/${section.slug}$`));
        const result = await assertRest(page, `${width}-${section.slug}`);
        reports.push(`${width}-${section.slug} max=${result.delta.max.toFixed(2)} ${result.file}`);
      }

      await page.locator("[data-collapse-toggle]").click();
      await expect(page.locator(".shell")).toHaveClass(/is-collapsed/);
      const collapsed = await assertRest(page, `${width}-catalog-collapsed`);
      reports.push(`${width}-catalog-collapsed max=${collapsed.delta.max.toFixed(2)} ${collapsed.file}`);

      await page.locator("[data-collapse-toggle]").click();
      await expect(page.locator(".shell")).not.toHaveClass(/is-collapsed/);
      const expanded = await assertRest(page, `${width}-catalog-expanded`);
      reports.push(`${width}-catalog-expanded max=${expanded.delta.max.toFixed(2)} ${expanded.file}`);

      console.log(reports.join("\n"));
    });
  });
}
