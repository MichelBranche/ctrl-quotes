import { beforeEach, describe, expect, it } from "vitest";
import type { AppDatabase } from "@/db/client";
import { parseEuroToCents, parseQuantity, previewComponents, previewLine } from "@/domain/catalog";
import {
  createCatalogItem,
  createCategory,
  deleteCatalogItem,
  deleteCategory,
  duplicateCatalogItem,
  getCatalogItem,
  listCatalog,
  listCategories,
  renameCategory,
  updateCatalogItem,
} from "@/server/catalog";
import { createTestDb } from "./helpers/db";
import { joinAs, ownerWithWorkspace } from "./helpers/actors";

function must<T>(result: { ok: true; value: T } | { ok: false; message: string }): T {
  if (!result.ok) throw new Error(result.message);
  return result.value;
}

const service = (name: string, cents: number, extra: Record<string, unknown> = {}) => ({
  type: "servizio",
  name,
  unitPriceCents: cents,
  taxRateBp: 2200,
  ...extra,
});

describe("prezzi del catalogo", () => {
  it("legge importi in formato italiano senza float", () => {
    expect(parseEuroToCents("1.200,50")).toBe(120050);
    expect(parseEuroToCents("€ 90")).toBe(9000);
    expect(parseEuroToCents("1200.5")).toBe(120050);
    expect(parseEuroToCents("1.200")).toBe(120000);
    expect(parseEuroToCents("0,1")).toBe(10);
    expect(parseEuroToCents("12,345")).toBeNull();
    expect(parseEuroToCents("abc")).toBeNull();
    expect(parseEuroToCents("-5")).toBeNull();
    expect(parseQuantity("1,5")).toBe(1500);
    expect(parseQuantity("0")).toBeNull();
  });

  it("calcola netto, IVA e totale con il motore prezzi", () => {
    expect(previewLine({ unitPriceCents: 120000, priceMode: "net", taxRateBp: 2200, billing: "una_tantum" }, "ordinario")).toEqual({
      netCents: 120000,
      vatCents: 26400,
      totalCents: 146400,
    });
    expect(previewLine({ unitPriceCents: 12200, priceMode: "gross", taxRateBp: 2200, billing: "mensile" }, "ordinario")).toEqual({
      netCents: 10000,
      vatCents: 2200,
      totalCents: 12200,
    });
    expect(previewLine({ unitPriceCents: 10000, priceMode: "net", taxRateBp: 2200, billing: "una_tantum" }, "forfettario").vatCents).toBe(0);
    const sum = previewComponents(
      [
        { unitPriceCents: 100000, priceMode: "net", taxRateBp: 2200, billing: "una_tantum" },
        { unitPriceCents: 9000, priceMode: "net", taxRateBp: 2200, billing: "mensile", quantityMilli: 2000 },
      ],
      "ordinario",
    );
    expect(sum.oneTime.totalCents).toBe(122000);
    expect(sum.monthly.netCents).toBe(18000);
  });
});

describe("catalogo", () => {
  let db: AppDatabase;
  let alpha: { userId: string; workspaceId: string };
  let beta: { userId: string; workspaceId: string };

  beforeEach(async () => {
    db = await createTestDb();
    alpha = await ownerWithWorkspace(db, "alpha@example.com", "Studio Alfa");
    beta = await ownerWithWorkspace(db, "beta@example.com", "Studio Beta");
  });

  it("crea, modifica, duplica ed elimina voci con categorie", async () => {
    const category = must(await createCategory(db, alpha, "Design"));
    const { id } = must(await createCatalogItem(db, alpha, service("Design UX/UI", 120000, { categoryId: category.id })));
    must(await updateCatalogItem(db, alpha, id, service("Design UX/UI", 130000, { categoryId: category.id, billing: "mensile", periods: 12 })));
    const item = must(await getCatalogItem(db, alpha, id));
    expect(item.unitPriceCents).toBe(130000);
    expect(item.categoryName).toBe("Design");
    expect(item.periods).toBe(12);
    const copy = must(await duplicateCatalogItem(db, alpha, id));
    expect(must(await getCatalogItem(db, alpha, copy.id)).name).toBe("Design UX/UI (copia)");
    expect(must(await listCategories(db, alpha))[0]?.itemCount).toBe(2);
    must(await renameCategory(db, alpha, category.id, "Progettazione"));
    must(await deleteCategory(db, alpha, category.id));
    expect(must(await getCatalogItem(db, alpha, id)).categoryId).toBeNull();
    must(await deleteCatalogItem(db, alpha, copy.id));
    expect(must(await listCatalog(db, alpha)).total).toBe(1);
  });

  it("rifiuta aliquote non ammesse, IVA 0% senza natura e categorie duplicate", async () => {
    expect((await createCatalogItem(db, alpha, service("Voce", 100, { taxRateBp: 2100 }))).ok).toBe(false);
    expect((await createCatalogItem(db, alpha, service("Voce", 100, { taxRateBp: 0 }))).ok).toBe(false);
    expect((await createCatalogItem(db, alpha, service("Voce", 100, { taxRateBp: 0, taxNature: "N4" }))).ok).toBe(true);
    expect((await createCatalogItem(db, alpha, service("Voce", 100, { periods: 3 }))).ok).toBe(false);
    must(await createCategory(db, alpha, "SEO"));
    expect((await createCategory(db, alpha, "seo")).ok).toBe(false);
  });

  it("compone pacchetti e blocca l'eliminazione di voci incluse", async () => {
    const site = must(await createCatalogItem(db, alpha, service("Sito web", 100000)));
    const hosting = must(await createCatalogItem(db, alpha, { ...service("Hosting", 12000), type: "prodotto", billing: "annuale" }));
    const pack = must(
      await createCatalogItem(db, alpha, {
        ...service("Pacchetto Web", 110000),
        type: "pacchetto",
        components: [
          { itemId: site.id, quantityMilli: 1000 },
          { itemId: hosting.id, quantityMilli: 1000 },
        ],
      }),
    );
    const detail = must(await getCatalogItem(db, alpha, pack.id));
    expect(detail.components.map((component) => component.name)).toEqual(["Hosting", "Sito web"]);
    expect((await createCatalogItem(db, alpha, { ...service("Nido", 1), type: "pacchetto", components: [{ itemId: pack.id, quantityMilli: 1000 }] })).ok).toBe(false);
    const blocked = await deleteCatalogItem(db, alpha, site.id);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error).toBe("conflict");
    const counts = must(await listCatalog(db, alpha)).counts;
    expect(counts).toEqual({ all: 3, servizio: 1, prodotto: 1, pacchetto: 1 });
    expect(must(await listCatalog(db, alpha, { type: "pacchetto" })).items).toHaveLength(1);
    expect(must(await listCatalog(db, alpha, { q: "host" })).items).toHaveLength(1);
  });

  it("isola voci, categorie e pacchetti tra workspace", async () => {
    const betaCategory = must(await createCategory(db, beta, "Segreta"));
    const betaItem = must(await createCatalogItem(db, beta, service("Voce Beta", 5000)));
    expect((await getCatalogItem(db, alpha, betaItem.id)).ok).toBe(false);
    expect((await getCatalogItem(db, { ...alpha, workspaceId: beta.workspaceId }, betaItem.id)).ok).toBe(false);
    expect((await updateCatalogItem(db, alpha, betaItem.id, service("Rubata", 1))).ok).toBe(false);
    expect((await duplicateCatalogItem(db, alpha, betaItem.id)).ok).toBe(false);
    expect((await deleteCatalogItem(db, alpha, betaItem.id)).ok).toBe(false);
    expect((await createCatalogItem(db, alpha, service("Con categoria altrui", 1, { categoryId: betaCategory.id }))).ok).toBe(false);
    expect(
      (await createCatalogItem(db, alpha, { ...service("Pacchetto", 1), type: "pacchetto", components: [{ itemId: betaItem.id, quantityMilli: 1000 }] })).ok,
    ).toBe(false);
    expect((await renameCategory(db, alpha, betaCategory.id, "Presa")).ok).toBe(false);
    expect((await deleteCategory(db, alpha, betaCategory.id)).ok).toBe(false);
    expect(must(await listCatalog(db, alpha)).total).toBe(0);
    expect(must(await listCategories(db, alpha))).toHaveLength(0);
    expect(must(await getCatalogItem(db, beta, betaItem.id)).name).toBe("Voce Beta");
  });

  it("applica i ruoli: il membro modifica ma non elimina né gestisce categorie", async () => {
    const member = await joinAs(db, alpha.workspaceId, "membro@example.com", "member");
    const item = must(await createCatalogItem(db, member, service("Voce membro", 100)));
    expect((await deleteCatalogItem(db, member, item.id)).ok).toBe(false);
    expect((await createCategory(db, member, "Nuova")).ok).toBe(false);
    expect((await deleteCatalogItem(db, alpha, item.id)).ok).toBe(true);
  });
});
