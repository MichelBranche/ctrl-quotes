import { beforeEach, describe, expect, it } from "vitest";
import type { AppDatabase } from "@/db/client";
import { computeTotals, documentSchema, initialDocument, lineFromCatalog, newBlock, type QuoteDocument, type QuoteLine } from "@/domain/quote-document";
import { canonicalJson, sectionNumbers, summaryGroups } from "@/domain/quote-snapshot";
import { templateKeys } from "@/domain/templates";
import { createCatalogItem, updateCatalogItem } from "@/server/catalog";
import { createClient } from "@/server/clients";
import { renderQuotePdf } from "@/server/pdf/quote-pdf";
import {
  createQuote,
  createVersion,
  deleteQuote,
  duplicateQuote,
  getDraftSnapshot,
  getQuoteEditor,
  getVersionSnapshot,
  listClientQuotes,
  listQuotes,
  restoreVersion,
  saveDraft,
  uploadQuoteImage,
} from "@/server/quotes";
import { saveBrand, saveFiscal, saveNumbering, setLogo } from "@/server/settings";
import { createTestDb } from "./helpers/db";
import { joinAs, ownerWithWorkspace } from "./helpers/actors";

function must<T>(result: { ok: true; value: T } | { ok: false; message: string }): T {
  if (!result.ok) throw new Error(result.message);
  return result.value;
}

const tinyPng = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64"));

const line = (overrides: Partial<QuoteLine> = {}): QuoteLine => ({
  id: crypto.randomUUID(),
  catalogItemId: null,
  name: "Voce",
  description: "",
  unit: "",
  quantityMilli: 1000,
  unitPriceCents: 100000,
  priceMode: "net",
  taxRateBp: 2200,
  taxNature: null,
  discountBp: 0,
  billing: "una_tantum",
  periods: null,
  ...overrides,
});

function docWith(services: QuoteLine[], options: QuoteLine[] = []): QuoteDocument {
  const document = initialDocument({ title: "Prova", clientName: "Cliente", intro: "", lines: services, terms: null });
  if (options.length) {
    const block = newBlock("options");
    if (block.type === "options") block.items = options;
    document.blocks.splice(3, 0, block);
  }
  return document;
}

describe("totali del preventivo", () => {
  it("separa una tantum, canoni e opzioni senza sommarli", () => {
    const totals = computeTotals(
      docWith(
        [line(), line({ unitPriceCents: 5000, billing: "mensile", periods: 12 }), line({ unitPriceCents: 20000, discountBp: 1000 })],
        [line({ unitPriceCents: 30000 })],
      ),
      { taxProfile: "ordinario", stampDutyNote: true },
    );
    expect(totals.main.oneTime).toMatchObject({ netCents: 118000, vatCents: 25960, totalCents: 143960 });
    expect(totals.main.monthly.totalCents).toBe(6100);
    expect(totals.options.oneTime.totalCents).toBe(36600);
    const groups = summaryGroups(totals);
    expect(groups.map((group) => group.title)).toEqual(["Una tantum", "Canone mensile"]);
  });

  it("non applica IVA in forfettario e aggiunge le note obbligatorie", () => {
    const totals = computeTotals(docWith([line({ unitPriceCents: 100000 })]), { taxProfile: "forfettario", stampDutyNote: true });
    expect(totals.main.oneTime.vatCents).toBe(0);
    expect(totals.main.notices.join(" ")).toContain("forfettario");
    expect(totals.main.notices.join(" ")).toContain("bollo");
  });

  it("ignora i blocchi nascosti e calcola la ritenuta solo in ordinario", () => {
    const document = docWith([line()]);
    document.withholdingBp = 2000;
    const services = document.blocks.find((block) => block.type === "services");
    expect(computeTotals(document, { taxProfile: "ordinario", stampDutyNote: false }).main.withholdingCents).toBe(20000);
    expect(computeTotals(document, { taxProfile: "forfettario", stampDutyNote: false }).main.withholdingCents).toBe(0);
    if (services) services.visible = false;
    expect(computeTotals(document, { taxProfile: "ordinario", stampDutyNote: false }).main.oneTime.totalCents).toBe(0);
  });

  it("valida la struttura: niente doppie copertine, id unici, testo senza caratteri di controllo", () => {
    const document = docWith([line()]);
    const twoCovers = { ...document, blocks: [...document.blocks, { ...document.blocks[0]!, id: "altro" }] };
    expect(documentSchema.safeParse(twoCovers).success).toBe(false);
    const dup = { ...document, blocks: [...document.blocks, { ...newBlock("text"), id: document.blocks[1]!.id }] };
    expect(documentSchema.safeParse(dup).success).toBe(false);
    const text = { ...newBlock("text"), body: "Ciao\u0007 <script>x</script>" };
    const parsed = documentSchema.parse({ ...document, blocks: [...document.blocks, text] });
    const stored = parsed.blocks.at(-1);
    expect(stored?.type === "text" && stored.body).toBe("Ciao <script>x</script>");
  });

  it("numera le sezioni saltando le immagini e produce JSON canonico", () => {
    expect(sectionNumbers([{ type: "intro" }, { type: "image" }, { type: "services" }])).toEqual([1, 1, 2]);
    expect(canonicalJson({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: null } })).toBe('{"a":{"c":null,"d":[2,{"y":2,"z":1}]},"b":1}');
  });
});

describe("motore preventivi", () => {
  let db: AppDatabase;
  let alpha: { userId: string; workspaceId: string };
  let beta: { userId: string; workspaceId: string };
  let clientId: string;
  let itemId: string;

  beforeEach(async () => {
    db = await createTestDb();
    alpha = await ownerWithWorkspace(db, "alpha@example.com", "Studio Alpha");
    beta = await ownerWithWorkspace(db, "beta@example.com", "Studio Beta");
    clientId = must(await createClient(db, alpha, { kind: "azienda", name: "Studio Forma", email: "info@forma.example" })).id;
    itemId = must(await createCatalogItem(db, alpha, { type: "servizio", name: "Design UX/UI", unitPriceCents: 120000, taxRateBp: 2200 })).id;
  });

  async function newQuote(extra: Record<string, unknown> = {}) {
    return must(await createQuote(db, alpha, { clientId, title: "Redesign sito web", catalogItemIds: [itemId], ...extra }));
  }

  it("assegna numeri progressivi con il formato del workspace", async () => {
    const year = new Date().getFullYear();
    expect((await newQuote()).number).toBe(`QT-${year}-0001`);
    expect((await newQuote()).number).toBe(`QT-${year}-0002`);
    must(await saveNumbering(db, alpha, { format: "PREV-{YY}-{000}", numberReset: "yearly" }));
    expect((await newQuote()).number).toBe(`PREV-${String(year).slice(-2)}-003`);
    // Another workspace starts from its own counter.
    const otherClient = must(await createClient(db, beta, { kind: "privato", name: "Mario Rossi" })).id;
    expect(must(await createQuote(db, beta, { clientId: otherClient, title: "Altro lavoro" })).number).toBe(`QT-${year}-0001`);
  });

  it("salta un numero già usato dopo un cambio di formato", async () => {
    must(await saveNumbering(db, alpha, { format: "Q-{0000}", numberReset: "never" }));
    expect((await newQuote()).number).toBe("Q-0001");
    must(await saveNumbering(db, alpha, { format: "Q-{0000}", numberReset: "yearly" }));
    expect((await newQuote()).number).toBe("Q-0002");
  });

  it("copia le voci del catalogo: modifiche successive non cambiano il preventivo", async () => {
    const { id } = await newQuote();
    must(await updateCatalogItem(db, alpha, itemId, { type: "servizio", name: "Design rinominato", unitPriceCents: 999, taxRateBp: 2200 }));
    const editor = must(await getQuoteEditor(db, alpha, id));
    const services = editor.document.blocks.find((block) => block.type === "services");
    expect(services?.type === "services" && services.items[0]).toMatchObject({ name: "Design UX/UI", unitPriceCents: 120000, catalogItemId: itemId });
    expect(editor.totals.main.oneTime.totalCents).toBe(146400);
    expect(editor.quote.validUntil).not.toBeNull();
    expect(editor.snapshot.issuer.companyName).toBeNull();
    expect(editor.snapshot.issuer.vatNumber).toBeNull();
  });

  it("salva la bozza con controllo di revisione e ricalcola i totali sul server", async () => {
    const { id } = await newQuote();
    const editor = must(await getQuoteEditor(db, alpha, id));
    const document = structuredClone(editor.document);
    const services = document.blocks.find((block) => block.type === "services");
    if (services?.type === "services") services.items.push(line({ unitPriceCents: 50000 }));
    const payload = { revision: editor.revision, title: "Redesign completo", clientId, templateId: "tpl_bold", validUntil: "2026-12-31", document, totals: { fake: 1 } };
    const saved = must(await saveDraft(db, alpha, id, payload));
    expect(saved.revision).toBe(editor.revision + 1);
    expect(saved.totals.main.oneTime.totalCents).toBe(207400);
    const stale = await saveDraft(db, alpha, id, payload);
    expect(stale.ok).toBe(false);
    expect(!stale.ok && stale.error).toBe("conflict");
    const list = must(await listQuotes(db, alpha, { q: "completo" }));
    expect(list.items[0]).toMatchObject({ title: "Redesign completo", totalCents: 207400, status: "draft" });
    const after = must(await getQuoteEditor(db, alpha, id));
    expect(after.quote).toMatchObject({ templateKey: "bold", validUntil: "2026-12-31" });
  });

  it("il lucchetto vale anche sul server: un blocco bloccato non cambia contenuto", async () => {
    const { id } = await newQuote();
    const editor = must(await getQuoteEditor(db, alpha, id));
    const base = { title: "Con lucchetto", clientId, templateId: "tpl_minimal", validUntil: null };
    const locked = structuredClone(editor.document);
    const intro = locked.blocks.find((block) => block.type === "intro");
    if (!intro || intro.type !== "intro") throw new Error("manca l'introduzione");
    intro.locked = true;
    // Edit and lock in the same save: allowed, the block was not locked yet.
    intro.heading = "Titolo fissato";
    let revision = must(await saveDraft(db, alpha, id, { ...base, revision: editor.revision, document: locked })).revision;
    // Locked before and after, content changed: refused, and nothing is stored.
    const tampered = structuredClone(locked);
    const target = tampered.blocks.find((block) => block.id === intro.id);
    if (target?.type === "intro") target.heading = "Cambiato di nascosto";
    const refused = await saveDraft(db, alpha, id, { ...base, revision, document: tampered });
    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.message).toContain("è bloccato");
    expect(must(await getQuoteEditor(db, alpha, id)).document.blocks.find((block) => block.id === intro.id)).toMatchObject({ heading: "Titolo fissato", locked: true });
    // Moving, hiding and the lock itself stay free.
    const moved = structuredClone(locked);
    const at = moved.blocks.findIndex((block) => block.id === intro.id);
    const [block] = moved.blocks.splice(at, 1);
    if (!block) throw new Error("blocco perso");
    moved.blocks.push({ ...block, visible: false });
    revision = must(await saveDraft(db, alpha, id, { ...base, revision, document: moved })).revision;
    // Unlock and edit in the same save (autosave batches them): allowed.
    const unlocked = structuredClone(moved);
    const free = unlocked.blocks.find((entry) => entry.id === intro.id);
    if (free?.type === "intro") {
      delete free.locked;
      free.heading = "Di nuovo libero";
    }
    must(await saveDraft(db, alpha, id, { ...base, revision, document: unlocked }));
  });

  it("rifiuta clienti, template e immagini di altri workspace", async () => {
    const { id } = await newQuote();
    const editor = must(await getQuoteEditor(db, alpha, id));
    const foreignClient = must(await createClient(db, beta, { kind: "privato", name: "Estraneo" })).id;
    const base = { revision: editor.revision, title: "X Y", clientId, templateId: "tpl_minimal", validUntil: null, document: editor.document };
    expect((await saveDraft(db, alpha, id, { ...base, clientId: foreignClient })).ok).toBe(false);
    expect((await saveDraft(db, alpha, id, { ...base, templateId: "tpl_inesistente" })).ok).toBe(false);
    const foreignQuote = must(await createQuote(db, beta, { clientId: foreignClient, title: "Loro" }));
    const foreignImage = must(await uploadQuoteImage(db, beta, foreignQuote.id, { bytes: tinyPng, filename: "x.png" }));
    const withImage = structuredClone(editor.document);
    withImage.blocks.push({ ...newBlock("image"), assetId: foreignImage.assetId } as never);
    expect((await saveDraft(db, alpha, id, { ...base, document: withImage })).ok).toBe(false);
    expect((await createQuote(db, alpha, { clientId: foreignClient, title: "Furbo" })).ok).toBe(false);
    expect((await createQuote(db, alpha, { clientId, title: "Furbo", catalogItemIds: ["nope"] })).ok).toBe(false);
  });

  it("isola i preventivi tra workspace", async () => {
    const { id } = await newQuote();
    expect((await getQuoteEditor(db, beta, id)).ok).toBe(false);
    expect((await saveDraft(db, beta, id, {})).ok).toBe(false);
    expect((await createVersion(db, beta, id, 1)).ok).toBe(false);
    expect((await getDraftSnapshot(db, { userId: beta.userId, workspaceId: alpha.workspaceId }, id)).ok).toBe(false);
    expect(must(await listQuotes(db, beta)).items).toHaveLength(0);
    expect(must(await listClientQuotes(db, beta, clientId))).toHaveLength(0);
  });

  it("congela versioni immutabili con impronta e le ripristina nella bozza", async () => {
    must(await saveBrand(db, alpha, { companyName: "Studio Alpha Srl", vatNumber: "IT01234567890", colorPrimary: "#111111", colorSecondary: "#7C3AED", colorBackground: "#F4F2FF", fontHeading: "Inter", fontBody: "Inter" }));
    must(await setLogo(db, alpha, { bytes: tinyPng, filename: "logo.png" }));
    const { id } = await newQuote();
    const editor = must(await getQuoteEditor(db, alpha, id));
    expect((await createVersion(db, alpha, id, editor.revision + 5)).ok).toBe(false);
    const v1 = must(await createVersion(db, alpha, id, editor.revision));
    expect(v1.versionNo).toBe(1);
    expect(v1.sha256).toMatch(/^[0-9a-f]{64}$/);

    must(await saveBrand(db, alpha, { companyName: "Nome cambiato", colorPrimary: "#222222", colorSecondary: "#7C3AED", colorBackground: "#F4F2FF", fontHeading: "Inter", fontBody: "Inter" }));
    const changed = structuredClone(editor.document);
    changed.blocks = changed.blocks.filter((block) => block.type !== "services");
    must(await saveDraft(db, alpha, id, { revision: editor.revision, title: "Titolo nuovo", clientId, templateId: "tpl_corporate", validUntil: null, document: changed }));
    const v2 = must(await createVersion(db, alpha, id, editor.revision + 1));
    expect(v2.versionNo).toBe(2);

    const frozen = must(await getVersionSnapshot(db, alpha, id, 1));
    expect(frozen.snapshot.issuer.companyName).toBe("Studio Alpha Srl");
    expect(frozen.snapshot.issuer.vatNumber).toBe("IT01234567890");
    expect(frozen.snapshot.brand.logo?.mime).toBe("image/png");
    expect(frozen.snapshot.totals.main.oneTime.totalCents).toBe(146400);
    expect(frozen.snapshot.quote.title).toBe("Redesign sito web");

    const restored = must(await restoreVersion(db, alpha, id, 1, editor.revision + 1));
    const after = must(await getQuoteEditor(db, alpha, id));
    expect(after.revision).toBe(restored.revision);
    expect(after.totals.main.oneTime.totalCents).toBe(146400);
    expect(after.quote.title).toBe("Redesign sito web");
    expect(after.versions.map((version) => version.versionNo)).toEqual([2, 1]);
  });

  it("applica i ruoli: il membro elimina solo le proprie bozze senza versioni", async () => {
    const member = await joinAs(db, alpha.workspaceId, "membro@example.com", "member");
    const ownerQuote = await newQuote();
    const memberQuote = must(await createQuote(db, member, { clientId, title: "Bozza del membro" }));
    const memberDeny = await deleteQuote(db, member, ownerQuote.id);
    expect(!memberDeny.ok && memberDeny.error).toBe("forbidden");
    must(await deleteQuote(db, member, memberQuote.id));
    must(await deleteQuote(db, alpha, ownerQuote.id));
    expect(must(await listQuotes(db, alpha)).workspaceTotal).toBe(0);
  });

  it("duplica con un nuovo numero e mostra lo storico nel cliente", async () => {
    const original = await newQuote();
    const copy = must(await duplicateQuote(db, alpha, original.id));
    expect(copy.number).not.toBe(original.number);
    const history = must(await listClientQuotes(db, alpha, clientId));
    expect(history.map((row) => row.number).sort()).toEqual([original.number, copy.number].sort());
    expect(history[0]?.totalCents).toBe(146400);
  });

  it("rifiuta immagini non PNG o JPG", async () => {
    const { id } = await newQuote();
    const svg = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>");
    expect((await uploadQuoteImage(db, alpha, id, { bytes: svg, filename: "a.svg" })).ok).toBe(false);
    expect((await uploadQuoteImage(db, alpha, id, { bytes: tinyPng, filename: "a.png" })).ok).toBe(true);
  });

  it("genera un PDF vettoriale per ognuno dei cinque template", async () => {
    must(await saveFiscal(db, alpha, { taxProfile: "ordinario", defaultTaxRateBp: 2200, defaultPriceMode: "net", stampDutyNote: true }));
    must(await setLogo(db, alpha, { bytes: tinyPng, filename: "logo.png" }));
    const { id } = await newQuote();
    const snapshot = must(await getDraftSnapshot(db, alpha, id));
    for (const template of templateKeys) {
      const pdf = await renderQuotePdf({ ...snapshot, template }, { images: new Map(), watermark: "Bozza" });
      expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
      expect(pdf.length).toBeGreaterThan(3000);
    }
  }, 60_000);

  it("copia da catalogo crea righe complete", () => {
    const copied = lineFromCatalog({ id: "c1", name: "Hosting", description: null, unit: "mese", unitPriceCents: 2500, priceMode: "net", taxRateBp: 2200, taxNature: null, billing: "mensile", periods: 12 });
    expect(copied).toMatchObject({ catalogItemId: "c1", billing: "mensile", periods: 12, quantityMilli: 1000, discountBp: 0 });
  });
});
