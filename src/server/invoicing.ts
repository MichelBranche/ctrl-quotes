import "server-only";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { quoteEvents, quoteInvoices, quotePaymentSettings } from "@/db/schema";
import { createId } from "@/domain/ids";
import {
  asInvoiceStatus,
  billingStatusFor,
  billingTermsLine,
  invoicePdfFilename,
  parseBillingDetails,
  parseInvoiceInput,
  paymentTermsText,
  suggestedDueDate,
  validateInvoicePdf,
  type BillingDetails,
  type BillingMode,
  type BillingStatus,
  type InvoiceStatus,
  type PaymentTermId,
} from "@/domain/invoicing";
import type { PaymentSnapshot } from "@/domain/payments";
import type { QuoteSnapshot } from "@/domain/quote-snapshot";
import { authorize, invalid, notFound, ok, type Actor, type Result } from "@/server/access";
import { writeAuditLog } from "@/server/audit";
import { effectiveBilling, getWorkspacePaymentRow, workspacePaymentsViewFromRow } from "@/server/payments";
import { findQuote } from "@/server/quotes";

export type InvoiceDetailsView = {
  number: string;
  issueDate: string;
  dueDate: string | null;
  notes: string | null;
  issuedAt: string | null;
};

export type InvoicePdfMeta = { filename: string; sizeBytes: number; uploadedAt: string };

export type StudioInvoiceView = {
  billingMode: BillingMode;
  paymentTerms: PaymentTermId | null;
  paymentTermsText: string | null;
  billingStatus: BillingStatus;
  invoiceStatus: InvoiceStatus;
  accepted: boolean;
  billing: (BillingDetails & { submittedAt: string | null }) | null;
  invoice: InvoiceDetailsView | null;
  pdf: InvoicePdfMeta | null;
  /** Due date the terms suggest for today's issue date. */
  suggestedDueDate: string | null;
  today: string;
};

export type PublicBillingView = {
  billingMode: BillingMode;
  paymentTermsText: string | null;
  billingStatus: BillingStatus;
  accepted: boolean;
  /** Details the client already sent, or a pre-fill from the client record of the quote. */
  billing: BillingDetails & { submitted: boolean };
  invoice: InvoiceDetailsView | null;
  hasPdf: boolean;
};

const metaColumns = {
  billingHolder: quoteInvoices.billingHolder,
  billingVatNumber: quoteInvoices.billingVatNumber,
  billingTaxCode: quoteInvoices.billingTaxCode,
  billingSdiCode: quoteInvoices.billingSdiCode,
  billingPec: quoteInvoices.billingPec,
  billingAddress: quoteInvoices.billingAddress,
  billingSubmittedAt: quoteInvoices.billingSubmittedAt,
  invoiceStatus: quoteInvoices.invoiceStatus,
  invoiceNumber: quoteInvoices.invoiceNumber,
  invoiceIssueDate: quoteInvoices.invoiceIssueDate,
  invoiceDueDate: quoteInvoices.invoiceDueDate,
  invoiceNotes: quoteInvoices.invoiceNotes,
  invoiceIssuedAt: quoteInvoices.invoiceIssuedAt,
  pdfFilename: quoteInvoices.pdfFilename,
  pdfSizeBytes: quoteInvoices.pdfSizeBytes,
  pdfUploadedAt: quoteInvoices.pdfUploadedAt,
};

type MetaRow = {
  [K in keyof typeof metaColumns]: (typeof metaColumns)[K]["_"]["data"] | null;
};

/** Invoice row without the PDF bytes. */
async function loadInvoiceMeta(db: AppDatabase, workspaceId: string, quoteId: string): Promise<MetaRow | null> {
  const rows = await db
    .select(metaColumns)
    .from(quoteInvoices)
    .where(and(eq(quoteInvoices.workspaceId, workspaceId), eq(quoteInvoices.quoteId, quoteId)))
    .limit(1);
  return (rows[0] as MetaRow | undefined) ?? null;
}

function billingFromRow(row: MetaRow | null): (BillingDetails & { submittedAt: string | null }) | null {
  if (!row?.billingHolder || !row.billingAddress) return null;
  return {
    holder: row.billingHolder,
    vatNumber: row.billingVatNumber ?? null,
    taxCode: row.billingTaxCode ?? null,
    sdiCode: row.billingSdiCode ?? null,
    pec: row.billingPec ?? null,
    address: row.billingAddress,
    submittedAt: row.billingSubmittedAt ? row.billingSubmittedAt.toISOString() : null,
  };
}

function invoiceFromRow(row: MetaRow | null): InvoiceDetailsView | null {
  if (!row || asInvoiceStatus(row.invoiceStatus) !== "issued" || !row.invoiceNumber || !row.invoiceIssueDate) return null;
  return {
    number: row.invoiceNumber,
    issueDate: row.invoiceIssueDate,
    dueDate: row.invoiceDueDate ?? null,
    notes: row.invoiceNotes ?? null,
    issuedAt: row.invoiceIssuedAt ? row.invoiceIssuedAt.toISOString() : null,
  };
}

function pdfFromRow(row: MetaRow | null): InvoicePdfMeta | null {
  if (!row?.pdfFilename || !row.pdfSizeBytes || !row.pdfUploadedAt) return null;
  return { filename: row.pdfFilename, sizeBytes: row.pdfSizeBytes, uploadedAt: row.pdfUploadedAt.toISOString() };
}

function romeToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Billing mode and terms of a quote, from its payment settings or the workspace defaults. */
export async function loadQuoteBilling(db: AppDatabase, workspaceId: string, quoteId: string) {
  const row = (
    await db
      .select()
      .from(quotePaymentSettings)
      .where(and(eq(quotePaymentSettings.workspaceId, workspaceId), eq(quotePaymentSettings.quoteId, quoteId)))
      .limit(1)
  )[0];
  let snapshot: PaymentSnapshot | null = null;
  if (row?.snapshotJson) {
    try {
      snapshot = JSON.parse(row.snapshotJson) as PaymentSnapshot;
    } catch {
      snapshot = null;
    }
  }
  const workspace = workspacePaymentsViewFromRow((await getWorkspacePaymentRow(db, workspaceId)) ?? undefined);
  return { ...effectiveBilling(row, snapshot, workspace), hasPaymentRow: Boolean(row) };
}

/** Condizioni line for the rendered quote (public page, PDFs, preview). Null keeps old quotes unchanged. */
export async function loadBillingTermsLine(db: AppDatabase, workspaceId: string, quoteId: string): Promise<string | null> {
  const billing = await loadQuoteBilling(db, workspaceId, quoteId);
  return billingTermsLine(billing.billingMode, billing.paymentTerms, billing.paymentTermsCustom);
}

async function ensureRow(db: AppDatabase, workspaceId: string, quoteId: string, now: Date): Promise<void> {
  await db.insert(quoteInvoices).values({ workspaceId, quoteId, updatedAt: now }).onConflictDoNothing();
}

export async function getQuoteInvoice(db: AppDatabase, actor: Actor, quoteId: string): Promise<Result<StudioInvoiceView>> {
  const access = await authorize(db, actor, "quotes.read");
  if (!access.ok) return access;
  const quote = await findQuote(db, access.value.id, quoteId);
  if (!quote) return notFound("Preventivo non trovato.");
  const billing = await loadQuoteBilling(db, access.value.id, quoteId);
  const row = await loadInvoiceMeta(db, access.value.id, quoteId);
  const invoiceStatus = asInvoiceStatus(row?.invoiceStatus);
  const accepted = quote.status === "accepted";
  const today = romeToday();
  return ok({
    billingMode: billing.billingMode,
    paymentTerms: billing.paymentTerms,
    paymentTermsText: paymentTermsText(billing.paymentTerms, billing.paymentTermsCustom),
    billingStatus: billingStatusFor({ mode: billing.billingMode, accepted, invoiceStatus }),
    invoiceStatus,
    accepted,
    billing: billingFromRow(row),
    invoice: invoiceFromRow(row),
    pdf: pdfFromRow(row),
    suggestedDueDate: suggestedDueDate(today, billing.paymentTerms),
    today,
  });
}

/** Records the issued invoice (number, dates, notes). Payment opens on the public page in `invoice` mode. */
export async function saveQuoteInvoice(db: AppDatabase, actor: Actor, quoteId: string, raw: unknown): Promise<Result<StudioInvoiceView>> {
  const access = await authorize(db, actor, "quotes.write");
  if (!access.ok) return access;
  const quote = await findQuote(db, access.value.id, quoteId);
  if (!quote) return notFound("Preventivo non trovato.");
  const parsed = parseInvoiceInput(raw);
  if (!parsed.ok) return invalid(parsed.message);
  const now = new Date();
  await ensureRow(db, access.value.id, quoteId, now);
  const before = await loadInvoiceMeta(db, access.value.id, quoteId);
  const firstIssue = asInvoiceStatus(before?.invoiceStatus) !== "issued";
  await db
    .update(quoteInvoices)
    .set({
      invoiceStatus: "issued",
      invoiceNumber: parsed.value.number,
      invoiceIssueDate: parsed.value.issueDate,
      invoiceDueDate: parsed.value.dueDate,
      invoiceNotes: parsed.value.notes,
      invoiceIssuedAt: firstIssue ? now : (before?.invoiceIssuedAt ?? now),
      updatedAt: now,
    })
    .where(and(eq(quoteInvoices.workspaceId, access.value.id), eq(quoteInvoices.quoteId, quoteId)));
  if (firstIssue) {
    await db.insert(quoteEvents).values({
      id: createId(),
      workspaceId: access.value.id,
      quoteId,
      type: "invoice_issued",
      actor: "user",
      actorUserId: actor.userId,
      meta: JSON.stringify({ number: parsed.value.number, issueDate: parsed.value.issueDate, dueDate: parsed.value.dueDate }),
      createdAt: now,
    });
  }
  await writeAuditLog(db, {
    workspaceId: access.value.id,
    actorUserId: actor.userId,
    action: firstIssue ? "invoices.issued" : "invoices.updated",
    entityType: "quote",
    entityId: quoteId,
    meta: { number: parsed.value.number },
  });
  return getQuoteInvoice(db, actor, quoteId);
}

/** Back to "in attesa di fattura": number, dates and PDF stay saved for a later re-issue. */
export async function reopenQuoteInvoice(db: AppDatabase, actor: Actor, quoteId: string): Promise<Result<StudioInvoiceView>> {
  const access = await authorize(db, actor, "quotes.write");
  if (!access.ok) return access;
  const quote = await findQuote(db, access.value.id, quoteId);
  if (!quote) return notFound("Preventivo non trovato.");
  await db
    .update(quoteInvoices)
    .set({ invoiceStatus: "none", updatedAt: new Date() })
    .where(and(eq(quoteInvoices.workspaceId, access.value.id), eq(quoteInvoices.quoteId, quoteId)));
  await writeAuditLog(db, { workspaceId: access.value.id, actorUserId: actor.userId, action: "invoices.reopened", entityType: "quote", entityId: quoteId });
  return getQuoteInvoice(db, actor, quoteId);
}

export async function uploadQuoteInvoicePdf(
  db: AppDatabase,
  actor: Actor,
  quoteId: string,
  bytes: Uint8Array,
  originalName: string | null,
): Promise<Result<StudioInvoiceView>> {
  const access = await authorize(db, actor, "quotes.write");
  if (!access.ok) return access;
  const quote = await findQuote(db, access.value.id, quoteId);
  if (!quote) return notFound("Preventivo non trovato.");
  const check = validateInvoicePdf(bytes);
  if (!check.ok) return invalid(check.message);
  const now = new Date();
  await ensureRow(db, access.value.id, quoteId, now);
  const data = Buffer.from(bytes);
  const sha256 = createHash("sha256").update(data).digest("hex");
  const filename = invoicePdfFilename(null, originalName);
  await db
    .update(quoteInvoices)
    .set({ pdfData: data, pdfFilename: filename, pdfSizeBytes: data.byteLength, pdfSha256: sha256, pdfUploadedAt: now, updatedAt: now })
    .where(and(eq(quoteInvoices.workspaceId, access.value.id), eq(quoteInvoices.quoteId, quoteId)));
  await writeAuditLog(db, {
    workspaceId: access.value.id,
    actorUserId: actor.userId,
    action: "invoices.pdf_uploaded",
    entityType: "quote",
    entityId: quoteId,
    meta: { sizeBytes: data.byteLength, sha256 },
  });
  return getQuoteInvoice(db, actor, quoteId);
}

export async function removeQuoteInvoicePdf(db: AppDatabase, actor: Actor, quoteId: string): Promise<Result<StudioInvoiceView>> {
  const access = await authorize(db, actor, "quotes.write");
  if (!access.ok) return access;
  const quote = await findQuote(db, access.value.id, quoteId);
  if (!quote) return notFound("Preventivo non trovato.");
  await db
    .update(quoteInvoices)
    .set({ pdfData: null, pdfFilename: null, pdfSizeBytes: null, pdfSha256: null, pdfUploadedAt: null, updatedAt: new Date() })
    .where(and(eq(quoteInvoices.workspaceId, access.value.id), eq(quoteInvoices.quoteId, quoteId)));
  await writeAuditLog(db, { workspaceId: access.value.id, actorUserId: actor.userId, action: "invoices.pdf_removed", entityType: "quote", entityId: quoteId });
  return getQuoteInvoice(db, actor, quoteId);
}

async function readPdf(db: AppDatabase, workspaceId: string, quoteId: string) {
  const rows = await db
    .select({ data: quoteInvoices.pdfData, sha256: quoteInvoices.pdfSha256, number: quoteInvoices.invoiceNumber, filename: quoteInvoices.pdfFilename, status: quoteInvoices.invoiceStatus })
    .from(quoteInvoices)
    .where(and(eq(quoteInvoices.workspaceId, workspaceId), eq(quoteInvoices.quoteId, quoteId)))
    .limit(1);
  const row = rows[0];
  if (!row?.data) return null;
  const data = Buffer.from(row.data);
  if (!validateInvoicePdf(data).ok) return null;
  return { data, sha256: row.sha256 ?? "", filename: invoicePdfFilename(row.number, row.filename), issued: asInvoiceStatus(row.status) === "issued" };
}

/** Studio download: any member of the workspace that owns the quote. */
export async function readQuoteInvoicePdf(db: AppDatabase, actor: Actor, quoteId: string) {
  const access = await authorize(db, actor, "quotes.read");
  if (!access.ok) return null;
  const quote = await findQuote(db, access.value.id, quoteId);
  if (!quote) return null;
  return readPdf(db, access.value.id, quoteId);
}

/** Client download from the quote link: only once the invoice is issued. The caller checks the link. */
export async function readPublicInvoicePdf(db: AppDatabase, workspaceId: string, quoteId: string) {
  const pdf = await readPdf(db, workspaceId, quoteId);
  return pdf?.issued ? pdf : null;
}

function prefillFrom(snapshot: QuoteSnapshot): BillingDetails {
  const client = snapshot.client;
  return {
    holder: client?.name ?? "",
    vatNumber: client?.vatNumber ?? null,
    taxCode: client?.taxCode ?? null,
    sdiCode: null,
    pec: null,
    address: client?.address ?? "",
  };
}

/**
 * What the client sees about billing on the public page. Null when there is nothing to show:
 * a `direct` quote with no payment methods and no invoice, or a quote not yet accepted.
 */
export async function loadQuoteBillingForPublic(
  db: AppDatabase,
  input: { workspaceId: string; quoteId: string; accepted: boolean; snapshot: QuoteSnapshot; hasPayment: boolean },
): Promise<PublicBillingView | null> {
  const billing = await loadQuoteBilling(db, input.workspaceId, input.quoteId);
  const row = await loadInvoiceMeta(db, input.workspaceId, input.quoteId);
  const invoice = invoiceFromRow(row);
  const invoiceStatus = asInvoiceStatus(row?.invoiceStatus);
  const termsText = paymentTermsText(billing.paymentTerms, billing.paymentTermsCustom);
  if (!input.accepted) return null;
  if (billing.billingMode === "direct" && !input.hasPayment && !invoice) return null;
  const submitted = billingFromRow(row);
  return {
    billingMode: billing.billingMode,
    paymentTermsText: termsText,
    billingStatus: billingStatusFor({ mode: billing.billingMode, accepted: input.accepted, invoiceStatus }),
    accepted: input.accepted,
    billing: submitted
      ? { holder: submitted.holder, vatNumber: submitted.vatNumber, taxCode: submitted.taxCode, sdiCode: submitted.sdiCode, pec: submitted.pec, address: submitted.address, submitted: true }
      : { ...prefillFrom(input.snapshot), submitted: false },
    invoice,
    hasPdf: Boolean(invoice && row?.pdfFilename),
  };
}

/** Billing details sent by the client from the quote link. Allowed after acceptance only. */
export async function submitPublicBillingDetails(
  db: AppDatabase,
  input: { workspaceId: string; quoteId: string; accepted: boolean; raw: unknown },
): Promise<Result<BillingDetails>> {
  if (!input.accepted) return invalid("Puoi inviare i dati di fatturazione dopo aver accettato il preventivo.");
  const parsed = parseBillingDetails(input.raw);
  if (!parsed.ok) return invalid(parsed.message);
  const now = new Date();
  await ensureRow(db, input.workspaceId, input.quoteId, now);
  const before = await loadInvoiceMeta(db, input.workspaceId, input.quoteId);
  await db
    .update(quoteInvoices)
    .set({
      billingHolder: parsed.value.holder,
      billingVatNumber: parsed.value.vatNumber,
      billingTaxCode: parsed.value.taxCode,
      billingSdiCode: parsed.value.sdiCode,
      billingPec: parsed.value.pec,
      billingAddress: parsed.value.address,
      billingSubmittedAt: now,
      updatedAt: now,
    })
    .where(and(eq(quoteInvoices.workspaceId, input.workspaceId), eq(quoteInvoices.quoteId, input.quoteId)));
  await db.insert(quoteEvents).values({
    id: createId(),
    workspaceId: input.workspaceId,
    quoteId: input.quoteId,
    type: before?.billingSubmittedAt ? "billing_details_updated" : "billing_details_submitted",
    actor: "recipient",
    meta: JSON.stringify({ holder: parsed.value.holder }),
    createdAt: now,
  });
  await writeAuditLog(db, {
    workspaceId: input.workspaceId,
    action: "invoices.billing_details_submitted",
    entityType: "quote",
    entityId: input.quoteId,
  });
  return ok(parsed.value);
}
