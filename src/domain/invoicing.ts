import { z } from "zod";

/**
 * B2B billing: how a quote gets invoiced and paid.
 * - `direct`: the client can pay right after accepting; the invoice follows the payment.
 * - `invoice`: after accepting, the client confirms the billing details; payment opens once the
 *   studio has issued the invoice.
 */
export const billingModes = ["direct", "invoice"] as const;
export type BillingMode = (typeof billingModes)[number];

export const billingModeLabel: Record<BillingMode, string> = {
  direct: "Pagamento diretto con fattura a seguire",
  invoice: "Pagamento su fattura",
};

export const billingModeHint: Record<BillingMode, string> = {
  direct: "Il cliente paga subito dopo l'accettazione. La fattura viene emessa a seguito del pagamento.",
  invoice: "Il cliente accetta e conferma i dati di fatturazione. Il pagamento si apre quando emetti la fattura.",
};

export const paymentTermIds = ["immediate", "net_15", "net_30", "net_60", "custom"] as const;
export type PaymentTermId = (typeof paymentTermIds)[number];

export const paymentTermLabel: Record<PaymentTermId, string> = {
  immediate: "A vista / Immediato",
  net_15: "15 giorni data fattura",
  net_30: "30 giorni data fattura",
  net_60: "60 giorni data fattura",
  custom: "Personalizzati",
};

const termDays: Record<PaymentTermId, number | null> = {
  immediate: 0,
  net_15: 15,
  net_30: 30,
  net_60: 60,
  custom: null,
};

export const invoiceStatuses = ["none", "issued"] as const;
export type InvoiceStatus = (typeof invoiceStatuses)[number];

/** Derived billing state shown to the studio and the client. */
export type BillingStatus = "none" | "awaiting_invoice" | "invoice_issued";

export const billingStatusLabel: Record<BillingStatus, string> = {
  none: "",
  awaiting_invoice: "In attesa di fattura",
  invoice_issued: "Fattura emessa",
};

/** Largest invoice PDF kept in the database. Stays under the 4.5 MB request limit of Vercel Functions. */
export const INVOICE_PDF_MAX_BYTES = 4 * 1024 * 1024;

export function isBillingMode(value: unknown): value is BillingMode {
  return typeof value === "string" && (billingModes as readonly string[]).includes(value);
}

export function isPaymentTermId(value: unknown): value is PaymentTermId {
  return typeof value === "string" && (paymentTermIds as readonly string[]).includes(value);
}

export function asBillingMode(value: unknown): BillingMode {
  return value === "invoice" ? "invoice" : "direct";
}

export function asInvoiceStatus(value: unknown): InvoiceStatus {
  return value === "issued" ? "issued" : "none";
}

/** Readable payment terms, or null when none were chosen. */
export function paymentTermsText(terms: PaymentTermId | null | undefined, custom: string | null | undefined): string | null {
  if (!terms) return null;
  if (terms === "custom") {
    const text = custom?.replace(/\s+/g, " ").trim();
    return text ? text : null;
  }
  return paymentTermLabel[terms];
}

/** Line added to the Condizioni of the rendered quote (web page and PDF). Never stored in the snapshot. */
export function billingTermsLine(mode: BillingMode | null, terms: PaymentTermId | null, custom: string | null): string | null {
  const text = paymentTermsText(terms, custom);
  if (!text && mode !== "invoice") return null;
  const parts: string[] = [];
  if (mode === "invoice") parts.push("Pagamento su fattura");
  else if (mode === "direct" && text) parts.push("Fattura emessa a seguito del pagamento");
  if (text) parts.push(`termini: ${text}`);
  const line = parts.join(", ");
  return line ? `${line.charAt(0).toUpperCase()}${line.slice(1)}.` : null;
}

/** The billing state a quote is in. Before acceptance nothing is pending. */
export function billingStatusFor(input: { mode: BillingMode; accepted: boolean; invoiceStatus: InvoiceStatus }): BillingStatus {
  if (input.invoiceStatus === "issued") return "invoice_issued";
  if (input.mode === "invoice" && input.accepted) return "awaiting_invoice";
  return "none";
}

/** In `invoice` mode the client cannot pay before the studio issues the invoice. */
export function paymentLockedByInvoice(mode: BillingMode, invoiceStatus: InvoiceStatus): boolean {
  return mode === "invoice" && invoiceStatus !== "issued";
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Due date suggested by the terms: issue date plus 0/15/30/60 days. Custom terms suggest nothing. */
export function suggestedDueDate(issueDate: string, terms: PaymentTermId | null): string | null {
  if (!isIsoDate(issueDate) || !terms) return null;
  const days = termDays[terms];
  return days === null ? null : addDays(issueDate, days);
}

export function normalizeVat(raw: string): string {
  return raw.replace(/[\s.-]+/g, "").toUpperCase();
}

/**
 * Italian VAT numbers: 11 digits with the Luhn-like check digit, optionally prefixed by IT.
 * Other EU numbers (2-letter prefix + 2-13 characters) are accepted as written.
 */
export function isValidVatNumber(raw: string): boolean {
  const vat = normalizeVat(raw);
  const italian = vat.startsWith("IT") ? vat.slice(2) : vat;
  if (/^\d{11}$/.test(italian)) {
    let sum = 0;
    for (let index = 0; index < 11; index += 1) {
      let digit = Number(italian[index]);
      if (index % 2 === 1) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
    }
    return sum % 10 === 0;
  }
  return /^[A-Z]{2}[A-Z0-9]{2,13}$/.test(vat) && !vat.startsWith("IT");
}

/** Codice fiscale: 16 characters (persone fisiche) or 11 digits (società). */
export function isValidTaxCode(raw: string): boolean {
  const code = normalizeVat(raw);
  return /^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/.test(code) || /^[A-Z0-9]{16}$/.test(code) || /^\d{11}$/.test(code);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

/** Codice destinatario SDI: 7 characters (6 for public administration); or a PEC address. */
export function parseSdiOrPec(raw: string): { ok: true; sdi: string | null; pec: string | null } | { ok: false; message: string } {
  const value = raw.trim();
  if (!value) return { ok: true, sdi: null, pec: null };
  if (value.includes("@")) {
    if (!EMAIL_RE.test(value)) return { ok: false, message: "L'indirizzo PEC non è valido." };
    return { ok: true, sdi: null, pec: value.toLowerCase() };
  }
  const code = value.replace(/\s+/g, "").toUpperCase();
  if (/^[A-Z0-9]{6,7}$/.test(code)) return { ok: true, sdi: code, pec: null };
  return { ok: false, message: "Il codice destinatario SDI ha 7 caratteri (per esempio M5UXCR1). In alternativa indica una PEC." };
}

const clean = (max: number) => z.string().trim().max(max).optional().nullable();

export const billingDetailsInputSchema = z.object({
  holder: z
    .string()
    .trim()
    .min(2, { error: "Indica la ragione sociale o l'intestatario." })
    .max(160, { error: "La ragione sociale può avere al massimo 160 caratteri." }),
  vatNumber: clean(20),
  taxCode: clean(20),
  sdiOrPec: clean(160),
  address: z
    .string()
    .trim()
    .min(8, { error: "Indica l'indirizzo completo: via, numero civico, CAP, città e provincia." })
    .max(300, { error: "L'indirizzo può avere al massimo 300 caratteri." }),
});

export type BillingDetailsInput = z.infer<typeof billingDetailsInputSchema>;

export type BillingDetails = {
  holder: string;
  vatNumber: string | null;
  taxCode: string | null;
  sdiCode: string | null;
  pec: string | null;
  address: string;
};

export function parseBillingDetails(raw: unknown): { ok: true; value: BillingDetails } | { ok: false; message: string } {
  const parsed = billingDetailsInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Dati di fatturazione non validi." };
  const input = parsed.data;
  const vat = input.vatNumber?.trim() ? normalizeVat(input.vatNumber) : null;
  const tax = input.taxCode?.trim() ? normalizeVat(input.taxCode) : null;
  if (!vat && !tax) return { ok: false, message: "Indica almeno la Partita IVA o il Codice Fiscale." };
  if (vat && !isValidVatNumber(vat)) return { ok: false, message: "La Partita IVA non è valida. Controlla le cifre e riprova." };
  if (tax && !isValidTaxCode(tax)) return { ok: false, message: "Il Codice Fiscale non è valido." };
  const channel = parseSdiOrPec(input.sdiOrPec ?? "");
  if (!channel.ok) return channel;
  return {
    ok: true,
    value: {
      holder: input.holder.replace(/\s+/g, " ").trim(),
      vatNumber: vat,
      taxCode: tax,
      sdiCode: channel.sdi,
      pec: channel.pec,
      address: input.address.replace(/\s+/g, " ").trim(),
    },
  };
}

export const invoiceInputSchema = z.object({
  number: z
    .string()
    .trim()
    .min(1, { error: "Inserisci il numero della fattura." })
    .max(40, { error: "Il numero della fattura può avere al massimo 40 caratteri." }),
  issueDate: z.string().trim().refine(isIsoDate, { error: "Indica la data di emissione." }),
  dueDate: z
    .string()
    .trim()
    .optional()
    .nullable()
    .refine((value) => !value || isIsoDate(value), { error: "La data di scadenza non è valida." }),
  notes: z.string().trim().max(500, { error: "Le note possono avere al massimo 500 caratteri." }).optional().nullable(),
});

export type InvoiceInput = z.infer<typeof invoiceInputSchema>;

export function parseInvoiceInput(raw: unknown): { ok: true; value: { number: string; issueDate: string; dueDate: string | null; notes: string | null } } | { ok: false; message: string } {
  const parsed = invoiceInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Dati della fattura non validi." };
  const { number, issueDate, dueDate, notes } = parsed.data;
  if (dueDate && dueDate < issueDate) return { ok: false, message: "La scadenza non può essere prima della data di emissione." };
  return { ok: true, value: { number, issueDate, dueDate: dueDate || null, notes: notes?.trim() || null } };
}

/** Strict check of an uploaded invoice: real PDF header, not empty, within the size limit. */
export function validateInvoicePdf(bytes: Uint8Array): { ok: true } | { ok: false; message: string } {
  if (bytes.byteLength === 0) return { ok: false, message: "Il file è vuoto." };
  if (bytes.byteLength > INVOICE_PDF_MAX_BYTES) return { ok: false, message: "Il PDF della fattura può pesare al massimo 4 MB." };
  const header = Buffer.from(bytes.subarray(0, 5)).toString("latin1");
  if (header !== "%PDF-") return { ok: false, message: "Il file non è un PDF valido." };
  return { ok: true };
}

/** Safe download name: letters, digits, dots, dashes and underscores only. */
export function invoicePdfFilename(invoiceNumber: string | null, original?: string | null): string {
  const base = (invoiceNumber?.trim() ? `Fattura-${invoiceNumber.trim()}` : original?.replace(/\.pdf$/i, "") || "Fattura")
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return `${base || "Fattura"}.pdf`;
}

/** Bonifico causale once the invoice exists: it references the invoice number first. */
export function causaleWithInvoice(causale: string, invoiceNumber: string | null | undefined): string {
  const number = invoiceNumber?.trim();
  if (!number) return causale;
  if (causale.includes(number)) return causale;
  return `Fattura ${number} - ${causale}`.slice(0, 140);
}

/** Initial deposit when the studio switches to a deposit mode, so what the field shows is what gets saved. */
export const DEFAULT_DEPOSIT_BP = 3000;

export function depositPatchForMode(
  mode: "full" | "percent" | "amount",
  current: { depositBp: number | null; depositCents: number | null },
): { depositMode: "full" | "percent" | "amount"; depositBp: number | null; depositCents: number | null } {
  if (mode === "percent") {
    const bp = current.depositBp != null && current.depositBp > 0 ? current.depositBp : DEFAULT_DEPOSIT_BP;
    return { depositMode: mode, depositBp: bp, depositCents: current.depositCents };
  }
  return { depositMode: mode, depositBp: current.depositBp, depositCents: current.depositCents };
}
