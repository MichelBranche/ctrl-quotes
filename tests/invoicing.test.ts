import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { buildModel, type Resources } from "@/components/quote-render/model";
import { quotePaymentSettings, quotes } from "@/db/schema";
import {
  DEFAULT_DEPOSIT_BP,
  INVOICE_PDF_MAX_BYTES,
  billingStatusFor,
  billingTermsLine,
  causaleWithInvoice,
  depositPatchForMode,
  invoicePdfFilename,
  isValidVatNumber,
  parseBillingDetails,
  parseInvoiceInput,
  parseSdiOrPec,
  paymentLockedByInvoice,
  suggestedDueDate,
  validateInvoicePdf,
} from "@/domain/invoicing";
import { demoSnapshot } from "@/domain/template-sample";
import {
  getQuoteInvoice,
  loadBillingTermsLine,
  loadQuoteBillingForPublic,
  readPublicInvoicePdf,
  reopenQuoteInvoice,
  saveQuoteInvoice,
  submitPublicBillingDetails,
  uploadQuoteInvoicePdf,
} from "@/server/invoicing";
import { getQuotePayments, loadQuotePaymentForPublic, saveQuotePayments, saveWorkspacePayments } from "@/server/payments";
import { createTestDb } from "./helpers/db";
import { ownerWithWorkspace } from "./helpers/actors";

const resources: Resources = { logo: null, photo: () => null, image: () => null, watermark: null, versionLabel: null };

function must<T>(result: { ok: true; value: T } | { ok: false; message: string }): T {
  if (!result.ok) throw new Error(result.message);
  return result.value;
}

async function setup(workspaceBilling: { billingMode?: "invoice" | "direct"; paymentTerms?: "net_30" | null } = {}) {
  const db = await createTestDb();
  const actor = await ownerWithWorkspace(db, "fatture@example.com", "Studio Fatture");
  const { createClient } = await import("@/server/clients");
  const { createCatalogItem } = await import("@/server/catalog");
  const { createQuote } = await import("@/server/quotes");
  must(
    await saveWorkspacePayments(db, actor, {
      ibanEnabled: true,
      ibanHolder: "Studio Fatture",
      iban: "IT60X0542811101000000123456",
      bic: "",
      paypalEnabled: false,
      paypalValue: "",
      stripeEnabled: false,
      defaultMethods: ["iban"],
      showBeforeAcceptance: false,
      ...workspaceBilling,
    }),
  );
  const clientId = must(
    await createClient(db, actor, { kind: "azienda", name: "Albergo Monte Rosa S.r.l.", email: "amministrazione@monterosa.example", vatNumber: "01234567897" }),
  ).id;
  const itemId = must(await createCatalogItem(db, actor, { type: "servizio", name: "Sito", unitPriceCents: 100000, taxRateBp: 2200 })).id;
  const quoteId = must(await createQuote(db, actor, { clientId, title: "Nuovo sito", catalogItemIds: [itemId] })).id;
  return { db, actor, quoteId };
}

describe("acconto in percentuale (bug del 30%)", () => {
  it("scegliere «Acconto in percentuale» parte da un 30% reale, senza riscriverlo", () => {
    expect(depositPatchForMode("percent", { depositBp: null, depositCents: null })).toEqual({ depositMode: "percent", depositBp: 3000, depositCents: null });
    expect(depositPatchForMode("percent", { depositBp: 0, depositCents: null }).depositBp).toBe(DEFAULT_DEPOSIT_BP);
    expect(depositPatchForMode("percent", { depositBp: 4000, depositCents: null }).depositBp).toBe(4000);
    expect(depositPatchForMode("full", { depositBp: null, depositCents: null }).depositBp).toBeNull();
  });

  it("il server salva il 30% anche se arriva la percentuale vuota, e il cliente vede l'acconto", async () => {
    const { db, actor, quoteId } = await setup();
    const saved = must(await saveQuotePayments(db, actor, quoteId, { methods: ["iban"], depositMode: "percent", depositBp: null, showBeforeAcceptance: true }));
    expect(saved.depositBp).toBe(3000);
    expect(saved.isDeposit).toBe(true);
    expect(saved.amountDueCents).toBe(Math.round(saved.totalCents * 0.3));
    const [row] = await db.select().from(quotePaymentSettings).where(eq(quotePaymentSettings.quoteId, quoteId));
    expect(row?.depositBp).toBe(3000);
    const view = await loadQuotePaymentForPublic(db, actor.workspaceId, quoteId, true);
    expect(view?.options.map((option) => option.choice)).toEqual(["deposit", "full"]);
  });
});

describe("dati di fatturazione B2B", () => {
  it("controlla Partita IVA, Codice Fiscale e SDI o PEC", () => {
    expect(isValidVatNumber("01234567897")).toBe(true);
    expect(isValidVatNumber("IT 01234567897")).toBe(true);
    expect(isValidVatNumber("01234567890")).toBe(false);
    expect(parseSdiOrPec("m5uxcr1")).toEqual({ ok: true, sdi: "M5UXCR1", pec: null });
    expect(parseSdiOrPec("Amministrazione@PEC.it")).toEqual({ ok: true, sdi: null, pec: "amministrazione@pec.it" });
    expect(parseSdiOrPec("12").ok).toBe(false);
    const missing = parseBillingDetails({ holder: "Monte Rosa", address: "Via Roma 1, 11020 Gressoney (AO)" });
    expect(missing.ok).toBe(false);
    const good = parseBillingDetails({ holder: " Albergo  Monte Rosa ", vatNumber: "IT01234567897", sdiOrPec: "M5UXCR1", address: "Via Roma 1, 11020 Gressoney (AO)" });
    expect(good).toMatchObject({ ok: true, value: { holder: "Albergo Monte Rosa", vatNumber: "IT01234567897", sdiCode: "M5UXCR1" } });
  });

  it("valida numero e date della fattura e suggerisce la scadenza dai termini", () => {
    expect(parseInvoiceInput({ number: "FT-2026-014", issueDate: "2026-11-27", dueDate: "2026-11-01" }).ok).toBe(false);
    expect(parseInvoiceInput({ number: "", issueDate: "2026-11-27" }).ok).toBe(false);
    expect(parseInvoiceInput({ number: "FT-2026-014", issueDate: "2026-11-27", dueDate: "2026-12-27" })).toMatchObject({ ok: true });
    expect(suggestedDueDate("2026-11-27", "net_30")).toBe("2026-12-27");
    expect(suggestedDueDate("2026-11-27", "immediate")).toBe("2026-11-27");
    expect(suggestedDueDate("2026-11-27", "custom")).toBeNull();
  });

  it("accetta solo PDF veri entro il limite", () => {
    expect(validateInvoicePdf(Buffer.from("%PDF-1.7\n%test"))).toEqual({ ok: true });
    expect(validateInvoicePdf(Buffer.from("<html>")).ok).toBe(false);
    expect(validateInvoicePdf(new Uint8Array(0)).ok).toBe(false);
    const big = Buffer.alloc(INVOICE_PDF_MAX_BYTES + 1);
    big.write("%PDF-");
    expect(validateInvoicePdf(big).ok).toBe(false);
    expect(invoicePdfFilename("FT 2026/014")).toBe("Fattura-FT-2026-014.pdf");
  });

  it("stato e causale dipendono da modalità e fattura", () => {
    expect(billingStatusFor({ mode: "invoice", accepted: false, invoiceStatus: "none" })).toBe("none");
    expect(billingStatusFor({ mode: "invoice", accepted: true, invoiceStatus: "none" })).toBe("awaiting_invoice");
    expect(billingStatusFor({ mode: "direct", accepted: true, invoiceStatus: "issued" })).toBe("invoice_issued");
    expect(paymentLockedByInvoice("invoice", "none")).toBe(true);
    expect(paymentLockedByInvoice("direct", "none")).toBe(false);
    expect(causaleWithInvoice("Preventivo Q-1", "FT-2026-014")).toBe("Fattura FT-2026-014 - Preventivo Q-1");
    expect(billingTermsLine(null, null, null)).toBeNull();
    expect(billingTermsLine("invoice", "net_30", null)).toBe("Pagamento su fattura, termini: 30 giorni data fattura.");
    expect(billingTermsLine("direct", "custom", "30% acconto su fattura, saldo a consegna")).toBe(
      "Fattura emessa a seguito del pagamento, termini: 30% acconto su fattura, saldo a consegna.",
    );
  });
});

describe("pagamento su fattura: flusso completo", () => {
  it("blocca il pagamento finché lo studio non emette la fattura, poi lo apre con la causale della fattura", async () => {
    const { db, actor, quoteId } = await setup({ billingMode: "invoice", paymentTerms: "net_30" });
    const settings = must(await saveQuotePayments(db, actor, quoteId, { methods: ["iban"], depositMode: "percent", depositBp: 3000, showBeforeAcceptance: false }));
    expect(settings.billingMode).toBe("invoice");
    expect(settings.paymentTerms).toBe("net_30");
    expect(settings.paymentTermsText).toBe("30 giorni data fattura");
    await db.update(quotes).set({ status: "accepted" }).where(and(eq(quotes.workspaceId, actor.workspaceId), eq(quotes.id, quoteId)));
    expect(must(await getQuotePayments(db, actor, quoteId)).billingStatus).toBe("awaiting_invoice");

    const locked = await loadQuotePaymentForPublic(db, actor.workspaceId, quoteId, true);
    expect(locked?.lockedByInvoice).toBe(true);
    expect(locked?.options).toEqual([]);

    const { demoSnapshot: sample } = await import("@/domain/template-sample");
    const snapshot = sample("minimal");
    const before = await loadQuoteBillingForPublic(db, { workspaceId: actor.workspaceId, quoteId, accepted: true, snapshot, hasPayment: true });
    expect(before?.billingStatus).toBe("awaiting_invoice");
    expect(before?.billing.submitted).toBe(false);
    expect(await loadQuoteBillingForPublic(db, { workspaceId: actor.workspaceId, quoteId, accepted: false, snapshot, hasPayment: true })).toBeNull();

    expect((await submitPublicBillingDetails(db, { workspaceId: actor.workspaceId, quoteId, accepted: false, raw: {} })).ok).toBe(false);
    must(
      await submitPublicBillingDetails(db, {
        workspaceId: actor.workspaceId,
        quoteId,
        accepted: true,
        raw: { holder: "Albergo Monte Rosa S.r.l.", vatNumber: "01234567897", taxCode: "01234567897", sdiOrPec: "M5UXCR1", address: "Via Roma 1, 11020 Gressoney (AO)" },
      }),
    );
    const studio = must(await getQuoteInvoice(db, actor, quoteId));
    expect(studio.billing).toMatchObject({ holder: "Albergo Monte Rosa S.r.l.", vatNumber: "01234567897", sdiCode: "M5UXCR1" });
    expect(studio.billingStatus).toBe("awaiting_invoice");

    expect((await uploadQuoteInvoicePdf(db, actor, quoteId, Buffer.from("not a pdf"), "fattura.pdf")).ok).toBe(false);
    must(await uploadQuoteInvoicePdf(db, actor, quoteId, Buffer.from("%PDF-1.4\n%fake invoice"), "fattura.pdf"));
    // Not issued yet: the client cannot download it.
    expect(await readPublicInvoicePdf(db, actor.workspaceId, quoteId)).toBeNull();

    const issued = must(await saveQuoteInvoice(db, actor, quoteId, { number: "FT-2026-014", issueDate: "2026-11-27", dueDate: "2026-12-27", notes: null }));
    expect(issued.billingStatus).toBe("invoice_issued");
    expect(issued.invoice).toMatchObject({ number: "FT-2026-014", dueDate: "2026-12-27" });
    expect(issued.pdf?.sizeBytes).toBeGreaterThan(0);

    const open = await loadQuotePaymentForPublic(db, actor.workspaceId, quoteId, true);
    expect(open?.lockedByInvoice).toBe(false);
    expect(open?.invoiceNumber).toBe("FT-2026-014");
    expect(open?.options.map((option) => option.choice)).toEqual(["deposit", "full"]);
    expect(open?.options[0]?.causale.startsWith("Fattura FT-2026-014")).toBe(true);

    const after = await loadQuoteBillingForPublic(db, { workspaceId: actor.workspaceId, quoteId, accepted: true, snapshot, hasPayment: true });
    expect(after?.invoice?.number).toBe("FT-2026-014");
    expect(after?.hasPdf).toBe(true);
    const pdf = await readPublicInvoicePdf(db, actor.workspaceId, quoteId);
    expect(pdf?.filename).toBe("Fattura-FT-2026-014.pdf");
    expect(pdf?.data.subarray(0, 5).toString("latin1")).toBe("%PDF-");

    expect(await loadBillingTermsLine(db, actor.workspaceId, quoteId)).toBe("Pagamento su fattura, termini: 30 giorni data fattura.");

    must(await reopenQuoteInvoice(db, actor, quoteId));
    expect(await readPublicInvoicePdf(db, actor.workspaceId, quoteId)).toBeNull();
    expect((await loadQuotePaymentForPublic(db, actor.workspaceId, quoteId, true))?.lockedByInvoice).toBe(true);
  });

  it("i preventivi esistenti senza le nuove colonne restano come prima", async () => {
    const { db, actor, quoteId } = await setup();
    await db.insert(quotePaymentSettings).values({
      workspaceId: actor.workspaceId,
      quoteId,
      methods: JSON.stringify(["iban"]),
      depositMode: "full",
      showBeforeAcceptance: true,
      snapshotJson: JSON.stringify({
        methods: ["iban"],
        depositMode: "full",
        depositBp: null,
        depositCents: null,
        amountDueCents: 12200,
        totalCents: 12200,
        showBeforeAcceptance: true,
        iban: { holder: "Studio", iban: "IT60X0542811101000000123456", bic: null, causale: "Preventivo 1" },
        paypal: null,
        stripe: null,
      }),
      paymentStatus: "awaiting",
      amountDueCents: 12200,
      amountPaidCents: 0,
      updatedAt: new Date(),
    });
    const view = await loadQuotePaymentForPublic(db, actor.workspaceId, quoteId, false);
    expect(view?.lockedByInvoice).toBe(false);
    expect(view?.options.map((option) => option.choice)).toEqual(["full"]);
    expect(view?.options[0]?.causale).toBe("Preventivo 1");
    expect(await loadBillingTermsLine(db, actor.workspaceId, quoteId)).toBeNull();
    expect(must(await getQuotePayments(db, actor, quoteId)).billingMode).toBe("direct");
  });
});

describe("termini nel documento", () => {
  it("aggiunge i termini alla colonna Pagamento delle Condizioni", () => {
    const snapshot = demoSnapshot("minimal");
    const line = "Pagamento su fattura, termini: 30 giorni data fattura.";
    const model = buildModel(snapshot, { ...resources, billingTerms: line }, "fromIntro");
    const terms = model.pages.flat().find((section) => section.kind === "terms");
    expect(terms && terms.kind === "terms" ? terms.columns.find((column) => column.key === "payment")?.body : "").toContain(line);
    const plain = buildModel(snapshot, resources, "fromIntro");
    const plainTerms = plain.pages.flat().find((section) => section.kind === "terms");
    expect(plainTerms && plainTerms.kind === "terms" ? plainTerms.columns.find((column) => column.key === "payment")?.body ?? "" : "").not.toContain(line);
  });

  it("crea le Condizioni se il preventivo non le ha", () => {
    const snapshot = demoSnapshot("minimal");
    const withoutTerms = { ...snapshot, document: { ...snapshot.document, blocks: snapshot.document.blocks.filter((block) => block.type !== "terms") } };
    const model = buildModel(withoutTerms, { ...resources, billingTerms: "Pagamento su fattura." }, "fromIntro");
    const terms = model.pages.flat().find((section) => section.kind === "terms");
    expect(terms && terms.kind === "terms" ? terms.columns[0]?.body : null).toBe("Pagamento su fattura.");
    expect(buildModel(withoutTerms, resources, "fromIntro").pages.flat().some((section) => section.kind === "terms")).toBe(false);
  });
});
