import "server-only";
import { and, eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { quoteInvoices, quotePaymentEvents, quotePaymentSettings, quotes, workspacePaymentSettings } from "@/db/schema";
import { createId } from "@/domain/ids";
import {
  DEFAULT_CAUSALE_TEMPLATE,
  amountForPaymentChoice,
  availablePaymentChoices,
  dueAmountCents,
  formatIbanGroups,
  inferPaymentChoice,
  isDeposit,
  isPaymentChoice,
  isPaymentMethodId,
  paymentChoiceLabel,
  isValidIban,
  maskIban,
  normalizeIban,
  parsePaypal,
  paypalEmailMailto,
  paypalMePaymentHref,
  quotePaymentsInputSchema,
  renderCausale,
  workspacePaymentsInputSchema,
  type DepositMode,
  type PaymentChoice,
  type PaymentMethodId,
  type PaymentSnapshot,
  type PaymentStatus,
  type PublicPaymentOption,
  type PublicPaymentView,
  type QuotePaymentsInput,
  remainingBalanceCents,
  resolvePaymentCharge,
  type StripeConnectStatus,
} from "@/domain/payments";
import { formatEuro } from "@/domain/money";
import {
  DEFAULT_DEPOSIT_BP,
  asBillingMode,
  asInvoiceStatus,
  billingStatusFor,
  causaleWithInvoice,
  isBillingMode,
  isPaymentTermId,
  paymentLockedByInvoice,
  paymentTermsText,
  type BillingMode,
  type BillingStatus,
  type InvoiceStatus,
  type PaymentTermId,
} from "@/domain/invoicing";
import { can } from "@/domain/permissions";
import { headlineParts } from "@/domain/quote-snapshot";
import { authorize, invalid, notFound, ok, type Actor, type Result } from "@/server/access";
import { writeAuditLog } from "@/server/audit";
import { notifyQuoteOwner } from "@/server/notifications";
import { loadSentVersion } from "@/server/public-quote";
import { findQuote } from "@/server/quotes";

export type WorkspacePaymentsView = {
  ibanEnabled: boolean;
  ibanHolder: string;
  ibanMasked: string | null;
  ibanConfigured: boolean;
  bic: string;
  causaleTemplate: string;
  paypalEnabled: boolean;
  paypalMode: "me" | "email" | null;
  paypalValue: string;
  stripeAccountId: string | null;
  stripeStatus: StripeConnectStatus;
  stripeEnabled: boolean;
  defaultMethods: PaymentMethodId[];
  showBeforeAcceptance: boolean;
  /** Default billing mode for new quotes (`direct` when never chosen). */
  billingMode: BillingMode;
  /** Default B2B payment terms. Null: not shown on quotes. */
  paymentTerms: PaymentTermId | null;
  paymentTermsCustom: string;
  /** Full IBAN only on the settings form for owner/admin. Never sent to lists or logs. */
  iban: string;
};

export type QuotePaymentsView = {
  methods: PaymentMethodId[];
  depositMode: DepositMode;
  depositBp: number | null;
  depositCents: number | null;
  showBeforeAcceptance: boolean;
  paymentStatus: PaymentStatus;
  amountDueCents: number;
  amountPaidCents: number;
  totalCents: number;
  balanceCents: number;
  isDeposit: boolean;
  markChoices: Array<{ kind: "paid" | "deposit_paid"; choice: PaymentChoice; label: string; amountCents: number }>;
  available: Array<{ id: PaymentMethodId; ready: boolean; hint: string }>;
  canManageSettings: boolean;
  billingMode: BillingMode;
  paymentTerms: PaymentTermId | null;
  paymentTermsCustom: string;
  /** Readable terms, or null when none are set. */
  paymentTermsText: string | null;
  invoiceStatus: InvoiceStatus;
  billingStatus: BillingStatus;
  accepted: boolean;
};

const emptyWorkspace: Omit<WorkspacePaymentsView, "iban"> & { iban: string } = {
  ibanEnabled: false,
  ibanHolder: "",
  ibanMasked: null,
  ibanConfigured: false,
  bic: "",
  causaleTemplate: DEFAULT_CAUSALE_TEMPLATE,
  paypalEnabled: false,
  paypalMode: null,
  paypalValue: "",
  stripeAccountId: null,
  stripeStatus: "none",
  stripeEnabled: false,
  defaultMethods: [],
  showBeforeAcceptance: false,
  billingMode: "direct",
  paymentTerms: null,
  paymentTermsCustom: "",
  iban: "",
};

function parseMethods(raw: string | null | undefined): PaymentMethodId[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPaymentMethodId);
  } catch {
    return [];
  }
}

function asDepositMode(value: unknown): DepositMode {
  if (value === "percent" || value === "amount") return value;
  return "full";
}

function asStatus(value: unknown): PaymentStatus {
  if (value === "awaiting" || value === "deposit_paid" || value === "paid") return value;
  return "none";
}

function asStripeStatus(value: unknown): StripeConnectStatus {
  if (value === "pending" || value === "active") return value;
  return "none";
}

function viewFromRow(row: typeof workspacePaymentSettings.$inferSelect | undefined): WorkspacePaymentsView {
  if (!row) return { ...emptyWorkspace };
  const iban = row.iban ? normalizeIban(row.iban) : "";
  return {
    ibanEnabled: row.ibanEnabled,
    ibanHolder: row.ibanHolder ?? "",
    ibanMasked: iban ? maskIban(iban) : null,
    ibanConfigured: Boolean(iban && row.ibanHolder),
    bic: row.bic ?? "",
    causaleTemplate: row.ibanCausaleTemplate || DEFAULT_CAUSALE_TEMPLATE,
    paypalEnabled: row.paypalEnabled,
    paypalMode: row.paypalMode === "email" || row.paypalMode === "me" ? row.paypalMode : null,
    paypalValue: row.paypalValue ?? "",
    stripeAccountId: row.stripeAccountId,
    stripeStatus: asStripeStatus(row.stripeAccountStatus),
    stripeEnabled: asStripeStatus(row.stripeAccountStatus) === "active" && Boolean(row.stripeAccountId),
    defaultMethods: parseMethods(row.defaultMethods),
    showBeforeAcceptance: row.showBeforeAcceptance,
    billingMode: asBillingMode(row.billingMode),
    paymentTerms: isPaymentTermId(row.paymentTerms) ? row.paymentTerms : null,
    paymentTermsCustom: row.paymentTermsCustom ?? "",
    iban,
  };
}

/** Billing mode and terms of a quote: its own choice, else the frozen snapshot, else the workspace default. */
export function effectiveBilling(
  row: { billingMode: string | null; paymentTerms: string | null; paymentTermsCustom: string | null } | null | undefined,
  snapshot: Pick<PaymentSnapshot, "billingMode" | "paymentTerms" | "paymentTermsCustom"> | null,
  workspace: Pick<WorkspacePaymentsView, "billingMode" | "paymentTerms" | "paymentTermsCustom">,
): { billingMode: BillingMode; paymentTerms: PaymentTermId | null; paymentTermsCustom: string | null } {
  const mode = isBillingMode(row?.billingMode) ? row.billingMode : isBillingMode(snapshot?.billingMode) ? snapshot.billingMode : row ? "direct" : workspace.billingMode;
  if (row && (row.paymentTerms !== null || row.billingMode !== null)) {
    return {
      billingMode: mode,
      paymentTerms: isPaymentTermId(row.paymentTerms) ? row.paymentTerms : null,
      paymentTermsCustom: row.paymentTermsCustom ?? null,
    };
  }
  if (snapshot && snapshot.paymentTerms !== undefined) {
    return { billingMode: mode, paymentTerms: isPaymentTermId(snapshot.paymentTerms) ? snapshot.paymentTerms : null, paymentTermsCustom: snapshot.paymentTermsCustom ?? null };
  }
  if (row) return { billingMode: mode, paymentTerms: null, paymentTermsCustom: null };
  return { billingMode: mode, paymentTerms: workspace.paymentTerms, paymentTermsCustom: workspace.paymentTermsCustom || null };
}

export async function getQuoteInvoiceState(db: AppDatabase, workspaceId: string, quoteId: string) {
  const rows = await db
    .select({ invoiceStatus: quoteInvoices.invoiceStatus, invoiceNumber: quoteInvoices.invoiceNumber })
    .from(quoteInvoices)
    .where(and(eq(quoteInvoices.workspaceId, workspaceId), eq(quoteInvoices.quoteId, quoteId)))
    .limit(1);
  const row = rows[0];
  return { invoiceStatus: asInvoiceStatus(row?.invoiceStatus), invoiceNumber: row?.invoiceNumber ?? null };
}

export const workspacePaymentsViewFromRow = viewFromRow;

export async function getWorkspacePaymentRow(db: AppDatabase, workspaceId: string) {
  const rows = await db.select().from(workspacePaymentSettings).where(eq(workspacePaymentSettings.workspaceId, workspaceId)).limit(1);
  return rows[0] ?? null;
}

export async function getWorkspacePayments(db: AppDatabase, actor: Actor): Promise<Result<WorkspacePaymentsView>> {
  const access = await authorize(db, actor, "clients.read");
  if (!access.ok) return access;
  const row = await getWorkspacePaymentRow(db, access.value.id);
  const view = viewFromRow(row ?? undefined);
  if (!can(access.value.role, "settings.write")) view.iban = "";
  return ok(view);
}

export async function saveWorkspacePayments(db: AppDatabase, actor: Actor, raw: unknown): Promise<Result<WorkspacePaymentsView>> {
  const access = await authorize(db, actor, "settings.write");
  if (!access.ok) return access;
  const parsed = workspacePaymentsInputSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message ?? "Dati non validi.");
  const input = parsed.data;

  let iban: string | null = null;
  let bic: string | null = null;
  let ibanHolder: string | null = input.ibanHolder?.trim() || null;
  if (input.ibanEnabled) {
    if (!ibanHolder) return invalid("Indica l'intestatario del conto.");
    if (!input.iban?.trim()) return invalid("Inserisci l'IBAN.");
    if (!isValidIban(input.iban)) return invalid("L'IBAN non è valido. Controlla le cifre e riprova.");
    iban = normalizeIban(input.iban);
    const bicRaw = input.bic?.trim().toUpperCase() ?? "";
    if (bicRaw && !/^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(bicRaw)) return invalid("Il BIC non è valido.");
    bic = bicRaw || null;
  } else if (input.iban?.trim()) {
    if (!isValidIban(input.iban)) return invalid("L'IBAN non è valido. Controlla le cifre e riprova.");
    iban = normalizeIban(input.iban);
    ibanHolder = ibanHolder;
    const bicRaw = input.bic?.trim().toUpperCase() ?? "";
    if (bicRaw && !/^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(bicRaw)) return invalid("Il BIC non è valido.");
    bic = bicRaw || null;
  }

  let paypalMode: "me" | "email" | null = null;
  let paypalValue: string | null = null;
  if (input.paypalEnabled || input.paypalValue?.trim()) {
    if (input.paypalEnabled && !input.paypalValue?.trim()) return invalid("Inserisci il link paypal.me o l'email PayPal.");
    if (input.paypalValue?.trim()) {
      const parsedPaypal = parsePaypal(input.paypalValue);
      if (!parsedPaypal.ok) return invalid(parsedPaypal.message);
      paypalMode = parsedPaypal.mode;
      paypalValue = parsedPaypal.mode === "me" ? parsedPaypal.handle : parsedPaypal.value;
    }
  }

  const existing = await getWorkspacePaymentRow(db, access.value.id);
  const stripeEnabled = asStripeStatus(existing?.stripeAccountStatus) === "active" && Boolean(existing?.stripeAccountId);
  if (input.stripeEnabled && !stripeEnabled) {
    return invalid("Collega prima l'account Stripe, poi potrai offrirlo sui preventivi.");
  }

  const allowed = new Set<PaymentMethodId>();
  if (input.ibanEnabled && iban && ibanHolder) allowed.add("iban");
  if (input.paypalEnabled && paypalValue) allowed.add("paypal");
  if (input.stripeEnabled && stripeEnabled) allowed.add("stripe");
  const defaultMethods = input.defaultMethods.filter((method) => allowed.has(method));

  const now = new Date();
  const values = {
    workspaceId: access.value.id,
    ibanEnabled: input.ibanEnabled,
    ibanHolder,
    iban,
    bic,
    ibanCausaleTemplate: input.causaleTemplate?.trim() || DEFAULT_CAUSALE_TEMPLATE,
    paypalEnabled: input.paypalEnabled,
    paypalMode,
    paypalValue,
    stripeAccountId: existing?.stripeAccountId ?? null,
    stripeAccountStatus: existing?.stripeAccountStatus ?? "none",
    defaultMethods: JSON.stringify(defaultMethods),
    showBeforeAcceptance: input.showBeforeAcceptance,
    billingMode: input.billingMode ?? existing?.billingMode ?? null,
    paymentTerms: input.paymentTerms === undefined ? (existing?.paymentTerms ?? null) : input.paymentTerms,
    paymentTermsCustom:
      input.paymentTermsCustom === undefined ? (existing?.paymentTermsCustom ?? null) : input.paymentTermsCustom?.trim() || null,
    updatedAt: now,
  };
  if (values.paymentTerms === "custom" && !values.paymentTermsCustom) {
    return invalid("Scrivi i termini di pagamento personalizzati, per esempio «30% acconto su fattura, saldo a consegna».");
  }
  if (existing) {
    await db.update(workspacePaymentSettings).set(values).where(eq(workspacePaymentSettings.workspaceId, access.value.id));
  } else {
    await db.insert(workspacePaymentSettings).values(values);
  }
  await writeAuditLog(db, {
    workspaceId: access.value.id,
    actorUserId: actor.userId,
    action: "payments.settings_saved",
    entityType: "workspace",
    entityId: access.value.id,
    meta: {
      iban: input.ibanEnabled ? (iban ? maskIban(iban) : null) : null,
      paypal: input.paypalEnabled,
      stripe: input.stripeEnabled,
    },
  });
  const row = await getWorkspacePaymentRow(db, access.value.id);
  return ok(viewFromRow(row ?? undefined));
}

export async function availableMethods(view: WorkspacePaymentsView): Promise<PaymentMethodId[]> {
  const list: PaymentMethodId[] = [];
  if (view.ibanEnabled && view.ibanConfigured) list.push("iban");
  if (view.paypalEnabled && view.paypalValue) list.push("paypal");
  if (view.stripeEnabled) list.push("stripe");
  return list;
}

async function quoteTotalCents(db: AppDatabase, workspaceId: string, quoteId: string): Promise<number> {
  const quote = await findQuote(db, workspaceId, quoteId);
  if (!quote) return 0;
  if (quote.sentVersionId) {
    const sent = await loadSentVersion(db, workspaceId, quote.sentVersionId);
    if (sent) return headlineParts(sent.snapshot.totals).cents;
  }
  return quote.totalCents ?? 0;
}

function methodHints(view: WorkspacePaymentsView): Array<{ id: PaymentMethodId; ready: boolean; hint: string }> {
  return [
    {
      id: "iban" as const,
      ready: view.ibanEnabled && view.ibanConfigured,
      hint: view.ibanMasked ? `Bonifico · ${view.ibanMasked}` : "Bonifico bancario",
    },
    {
      id: "paypal" as const,
      ready: view.paypalEnabled && Boolean(view.paypalValue),
      hint: view.paypalValue
        ? view.paypalMode === "email"
          ? "PayPal (email)"
          : `PayPal · paypal.me/${view.paypalValue}`
        : "PayPal",
    },
    {
      id: "stripe" as const,
      ready: view.stripeEnabled,
      hint: view.stripeEnabled ? "Carta con Stripe" : "Stripe non è ancora collegato",
    },
  ];
}


function snapshotFromRow(row: { snapshotJson: string | null }): PaymentSnapshot | null {
  if (row.snapshotJson) {
    try {
      return JSON.parse(row.snapshotJson) as PaymentSnapshot;
    } catch {
      /* fall through */
    }
  }
  return null;
}

function markChoicesFor(
  snapshot: Pick<PaymentSnapshot, "depositMode" | "depositBp" | "depositCents" | "amountDueCents" | "totalCents">,
  status: PaymentStatus,
  amountPaidCents: number,
): QuotePaymentsView["markChoices"] {
  return availablePaymentChoices(snapshot, status, amountPaidCents).map((choice) => ({
    kind: choice === "deposit" ? "deposit_paid" : "paid",
    choice,
    label: paymentChoiceLabel[choice],
    amountCents: amountForPaymentChoice(snapshot, amountPaidCents, choice),
  }));
}

export async function getQuotePayments(db: AppDatabase, actor: Actor, quoteId: string): Promise<Result<QuotePaymentsView>> {
  const access = await authorize(db, actor, "quotes.read");
  if (!access.ok) return access;
  const quote = await findQuote(db, access.value.id, quoteId);
  if (!quote) return notFound("Preventivo non trovato.");
  const workspaceRow = await getWorkspacePaymentRow(db, access.value.id);
  const workspace = viewFromRow(workspaceRow ?? undefined);
  const ready = new Set((await availableMethods(workspace)).values());
  const row = (
    await db
      .select()
      .from(quotePaymentSettings)
      .where(and(eq(quotePaymentSettings.workspaceId, access.value.id), eq(quotePaymentSettings.quoteId, quoteId)))
      .limit(1)
  )[0];
  const totalCents = await quoteTotalCents(db, access.value.id, quoteId);
  const methods = row ? parseMethods(row.methods).filter((method) => ready.has(method)) : workspace.defaultMethods.filter((method) => ready.has(method));
  const depositMode = row ? asDepositMode(row.depositMode) : "full";
  const depositBp = row?.depositBp ?? null;
  const depositCents = row?.depositCents ?? null;
  const amountDueCents = row?.amountDueCents ?? dueAmountCents(totalCents, depositMode, depositBp, depositCents);
  const amountPaidCents = row?.amountPaidCents ?? 0;
  const paymentStatus = row ? asStatus(row.paymentStatus) : "none";
  const snapshot = row
    ? snapshotFromRow(row) ?? {
        methods,
        depositMode,
        depositBp,
        depositCents,
        amountDueCents,
        totalCents,
        showBeforeAcceptance: row.showBeforeAcceptance,
        iban: null,
        paypal: null,
        stripe: null,
      }
    : {
        methods,
        depositMode,
        depositBp,
        depositCents,
        amountDueCents,
        totalCents,
        showBeforeAcceptance: workspace.showBeforeAcceptance,
        iban: null,
        paypal: null,
        stripe: null,
      };
  const billing = effectiveBilling(row, row ? snapshotFromRow(row) : null, workspace);
  const invoice = await getQuoteInvoiceState(db, access.value.id, quoteId);
  const accepted = quote.status === "accepted";
  return ok({
    methods,
    depositMode,
    depositBp,
    depositCents,
    billingMode: billing.billingMode,
    paymentTerms: billing.paymentTerms,
    paymentTermsCustom: billing.paymentTermsCustom ?? "",
    paymentTermsText: paymentTermsText(billing.paymentTerms, billing.paymentTermsCustom),
    invoiceStatus: invoice.invoiceStatus,
    billingStatus: billingStatusFor({ mode: billing.billingMode, accepted, invoiceStatus: invoice.invoiceStatus }),
    accepted,
    showBeforeAcceptance: row?.showBeforeAcceptance ?? workspace.showBeforeAcceptance,
    paymentStatus,
    amountDueCents,
    amountPaidCents,
    totalCents,
    balanceCents: remainingBalanceCents(totalCents, amountPaidCents),
    isDeposit: isDeposit(depositMode, amountDueCents, totalCents),
    markChoices: markChoicesFor(snapshot, paymentStatus, amountPaidCents),
    available: methodHints(workspace).filter((item) => item.ready || item.id === "stripe"),
    canManageSettings: access.value.role === "owner" || access.value.role === "admin",
  });
}

export async function saveQuotePayments(
  db: AppDatabase,
  actor: Actor,
  quoteId: string,
  raw: unknown,
): Promise<Result<QuotePaymentsView>> {
  const access = await authorize(db, actor, "quotes.write");
  if (!access.ok) return access;
  const quote = await findQuote(db, access.value.id, quoteId);
  if (!quote) return notFound("Preventivo non trovato.");
  const parsed = quotePaymentsInputSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message ?? "Dati non validi.");
  const workspace = viewFromRow((await getWorkspacePaymentRow(db, access.value.id)) ?? undefined);
  const ready = new Set(await availableMethods(workspace));
  const methods = parsed.data.methods.filter((method) => ready.has(method));
  // "Acconto in percentuale" without a typed value means the 30% the field shows, never a silent full payment.
  if (parsed.data.depositMode === "percent" && !(parsed.data.depositBp && parsed.data.depositBp > 0)) {
    parsed.data.depositBp = DEFAULT_DEPOSIT_BP;
  }
  const totalCents = await quoteTotalCents(db, access.value.id, quoteId);
  const amountDueCents = dueAmountCents(totalCents, parsed.data.depositMode, parsed.data.depositBp ?? null, parsed.data.depositCents ?? null);
  const now = new Date();
  const existing = (
    await db
      .select()
      .from(quotePaymentSettings)
      .where(and(eq(quotePaymentSettings.workspaceId, access.value.id), eq(quotePaymentSettings.quoteId, quoteId)))
      .limit(1)
  )[0];
  const current = effectiveBilling(existing, existing ? snapshotFromRow(existing) : null, workspace);
  const billingMode = parsed.data.billingMode ?? current.billingMode;
  const paymentTerms = parsed.data.paymentTerms === undefined ? current.paymentTerms : parsed.data.paymentTerms;
  const paymentTermsCustom =
    parsed.data.paymentTermsCustom === undefined ? current.paymentTermsCustom : parsed.data.paymentTermsCustom?.trim() || null;
  const snapshot = buildSnapshot(
    workspace,
    { ...parsed.data, methods, billingMode, paymentTerms, paymentTermsCustom },
    totalCents,
    quote.number,
    quote.title,
  );
  const values = {
    workspaceId: access.value.id,
    quoteId,
    methods: JSON.stringify(methods),
    depositMode: parsed.data.depositMode,
    depositBp: parsed.data.depositMode === "percent" ? (parsed.data.depositBp ?? null) : null,
    depositCents: parsed.data.depositMode === "amount" ? (parsed.data.depositCents ?? null) : null,
    showBeforeAcceptance: parsed.data.showBeforeAcceptance,
    billingMode,
    paymentTerms,
    paymentTermsCustom: paymentTerms === "custom" ? paymentTermsCustom : null,
    snapshotJson: JSON.stringify(snapshot),
    paymentStatus: existing ? asStatus(existing.paymentStatus) : methods.length ? "awaiting" : "none",
    amountDueCents,
    amountPaidCents: existing?.amountPaidCents ?? 0,
    updatedAt: now,
  };
  if (existing) {
    await db
      .update(quotePaymentSettings)
      .set(values)
      .where(and(eq(quotePaymentSettings.workspaceId, access.value.id), eq(quotePaymentSettings.quoteId, quoteId)));
  } else {
    await db.insert(quotePaymentSettings).values(values);
  }
  return getQuotePayments(db, actor, quoteId);
}

export function buildSnapshot(
  workspace: WorkspacePaymentsView,
  input: QuotePaymentsInput,
  totalCents: number,
  number: string | null,
  title: string,
): PaymentSnapshot {
  const amountDueCents = dueAmountCents(totalCents, input.depositMode, input.depositBp ?? null, input.depositCents ?? null);
  const methods = input.methods;
  const causale = renderCausale(workspace.causaleTemplate, { numero: number, titolo: title, importoCents: amountDueCents });
  const iban =
    methods.includes("iban") && workspace.ibanConfigured
      ? { holder: workspace.ibanHolder, iban: workspace.iban, bic: workspace.bic || null, causale }
      : null;
  const paypal =
    methods.includes("paypal") && workspace.paypalValue && workspace.paypalMode
      ? { mode: workspace.paypalMode, value: workspace.paypalValue, handle: workspace.paypalMode === "me" ? workspace.paypalValue : null }
      : null;
  const stripe = methods.includes("stripe") && workspace.stripeEnabled ? { ready: true } : methods.includes("stripe") ? { ready: false } : null;
  return {
    methods,
    depositMode: input.depositMode,
    depositBp: input.depositBp ?? null,
    depositCents: input.depositCents ?? null,
    amountDueCents,
    totalCents,
    showBeforeAcceptance: input.showBeforeAcceptance,
    iban,
    paypal,
    stripe,
    billingMode: input.billingMode ?? workspace.billingMode,
    paymentTerms: input.paymentTerms === undefined ? workspace.paymentTerms : input.paymentTerms,
    paymentTermsCustom:
      (input.paymentTerms === undefined ? workspace.paymentTerms : input.paymentTerms) === "custom"
        ? (input.paymentTermsCustom === undefined ? workspace.paymentTermsCustom : input.paymentTermsCustom) || null
        : null,
  };
}

/** Refresh the snapshot from current workspace details at send time. */
export async function freezeQuotePaymentSnapshot(db: AppDatabase, workspaceId: string, quoteId: string): Promise<void> {
  const quote = await findQuote(db, workspaceId, quoteId);
  if (!quote) return;
  const workspace = viewFromRow((await getWorkspacePaymentRow(db, workspaceId)) ?? undefined);
  const row = (
    await db
      .select()
      .from(quotePaymentSettings)
      .where(and(eq(quotePaymentSettings.workspaceId, workspaceId), eq(quotePaymentSettings.quoteId, quoteId)))
      .limit(1)
  )[0];
  const ready = await availableMethods(workspace);
  const methods = row ? parseMethods(row.methods).filter((method) => ready.includes(method)) : workspace.defaultMethods.filter((method) => ready.includes(method));
  const billingConfigured = workspace.billingMode === "invoice" || workspace.paymentTerms !== null;
  if (methods.length === 0 && !row && !billingConfigured) return;
  const totalCents = await quoteTotalCents(db, workspaceId, quoteId);
  const depositMode = row ? asDepositMode(row.depositMode) : "full";
  const billing = effectiveBilling(row, row ? snapshotFromRow(row) : null, workspace);
  const input: QuotePaymentsInput = {
    methods,
    depositMode,
    depositBp: row?.depositBp ?? null,
    depositCents: row?.depositCents ?? null,
    showBeforeAcceptance: row?.showBeforeAcceptance ?? workspace.showBeforeAcceptance,
    billingMode: billing.billingMode,
    paymentTerms: billing.paymentTerms,
    paymentTermsCustom: billing.paymentTermsCustom,
  };
  const snapshot = buildSnapshot(workspace, input, totalCents, quote.number, quote.title);
  const values = {
    workspaceId,
    quoteId,
    methods: JSON.stringify(methods),
    depositMode,
    depositBp: input.depositBp,
    depositCents: input.depositCents,
    showBeforeAcceptance: input.showBeforeAcceptance,
    billingMode: billing.billingMode,
    paymentTerms: billing.paymentTerms,
    paymentTermsCustom: billing.paymentTerms === "custom" ? billing.paymentTermsCustom : null,
    snapshotJson: JSON.stringify(snapshot),
    paymentStatus: row && asStatus(row.paymentStatus) !== "none" ? asStatus(row.paymentStatus) : methods.length ? "awaiting" : "none",
    amountDueCents: snapshot.amountDueCents,
    amountPaidCents: row?.amountPaidCents ?? 0,
    updatedAt: new Date(),
  };
  if (row) {
    await db.update(quotePaymentSettings).set(values).where(and(eq(quotePaymentSettings.workspaceId, workspaceId), eq(quotePaymentSettings.quoteId, quoteId)));
  } else {
    await db.insert(quotePaymentSettings).values(values);
  }
}

function paypalForAmount(snapshot: PaymentSnapshot, amountCents: number, causale: string): PublicPaymentOption["paypal"] {
  if (!snapshot.paypal) return null;
  if (snapshot.paypal.mode === "me" && snapshot.paypal.handle) {
    return { mode: "me", href: paypalMePaymentHref(snapshot.paypal.handle, amountCents), label: "Paga con PayPal" };
  }
  return { mode: "email", href: paypalEmailMailto(snapshot.paypal.value, amountCents, causale), label: "Paga con PayPal" };
}

function causaleForAmount(snapshot: PaymentSnapshot, amountCents: number): string {
  const frozen = snapshot.iban?.causale ?? renderCausale(DEFAULT_CAUSALE_TEMPLATE, { importoCents: amountCents });
  if (amountCents === snapshot.amountDueCents) return frozen;
  const from = formatEuro(snapshot.amountDueCents);
  const to = formatEuro(amountCents);
  return frozen.includes(from) ? frozen.replace(from, to) : frozen;
}

function optionFor(snapshot: PaymentSnapshot, amountPaidCents: number, choice: PaymentChoice): PublicPaymentOption {
  const amountCents = amountForPaymentChoice(snapshot, amountPaidCents, choice);
  const causale = causaleForAmount(snapshot, amountCents);
  return {
    choice,
    amountCents,
    label: paymentChoiceLabel[choice],
    hint:
      choice === "deposit"
        ? `su un totale di ${formatEuro(snapshot.totalCents)}`
        : choice === "balance"
          ? `già versati ${formatEuro(amountPaidCents)} su un totale di ${formatEuro(snapshot.totalCents)}`
          : null,
    causale,
    paypal: paypalForAmount(snapshot, amountCents, causale),
  };
}

export function publicPaymentView(
  snapshot: PaymentSnapshot,
  status: PaymentStatus,
  amountPaidCents: number,
  invoice: { billingMode: BillingMode; invoiceStatus: InvoiceStatus; invoiceNumber: string | null } = {
    billingMode: "direct",
    invoiceStatus: "none",
    invoiceNumber: null,
  },
): PublicPaymentView {
  const locked = paymentLockedByInvoice(invoice.billingMode, invoice.invoiceStatus) && status !== "paid";
  const invoiceNumber = invoice.invoiceStatus === "issued" ? invoice.invoiceNumber : null;
  const options = locked
    ? []
    : availablePaymentChoices(snapshot, status, amountPaidCents).map((choice) => {
        const option = optionFor(snapshot, amountPaidCents, choice);
        return invoiceNumber ? { ...option, causale: causaleWithInvoice(option.causale, invoiceNumber) } : option;
      });
  const current = options[0] ?? null;
  const causale = current?.causale ?? snapshot.iban?.causale ?? renderCausale(DEFAULT_CAUSALE_TEMPLATE, { importoCents: snapshot.amountDueCents });
  return {
    methods: snapshot.methods,
    amountDueCents: current?.amountCents ?? remainingBalanceCents(snapshot.totalCents, amountPaidCents),
    totalCents: snapshot.totalCents,
    isDeposit: isDeposit(snapshot.depositMode, snapshot.amountDueCents, snapshot.totalCents),
    causale,
    iban: snapshot.iban
      ? { holder: snapshot.iban.holder, iban: snapshot.iban.iban, ibanGrouped: formatIbanGroups(snapshot.iban.iban), bic: snapshot.iban.bic }
      : null,
    paypal: current?.paypal ?? null,
    stripe: snapshot.stripe ? { available: snapshot.stripe.ready } : null,
    status,
    amountPaidCents,
    options,
    lockedByInvoice: locked,
    invoiceNumber,
  };
}

export async function loadQuotePaymentForPublic(
  db: AppDatabase,
  workspaceId: string,
  quoteId: string,
  accepted: boolean,
): Promise<PublicPaymentView | null> {
  const row = (
    await db
      .select()
      .from(quotePaymentSettings)
      .where(and(eq(quotePaymentSettings.workspaceId, workspaceId), eq(quotePaymentSettings.quoteId, quoteId)))
      .limit(1)
  )[0];
  if (!row?.snapshotJson) return null;
  let snapshot: PaymentSnapshot;
  try {
    snapshot = JSON.parse(row.snapshotJson) as PaymentSnapshot;
  } catch {
    return null;
  }
  if (!snapshot.methods?.length) return null;
  if (!accepted && !snapshot.showBeforeAcceptance) return null;
  const workspace = viewFromRow((await getWorkspacePaymentRow(db, workspaceId)) ?? undefined);
  const billing = effectiveBilling(row, snapshot, workspace);
  const invoice = await getQuoteInvoiceState(db, workspaceId, quoteId);
  return publicPaymentView(snapshot, asStatus(row.paymentStatus), row.amountPaidCents, {
    billingMode: billing.billingMode,
    invoiceStatus: invoice.invoiceStatus,
    invoiceNumber: invoice.invoiceNumber,
  });
}

export async function markQuotePaid(
  db: AppDatabase,
  actor: Actor,
  quoteId: string,
  kind: "paid" | "deposit_paid",
  method: PaymentMethodId,
): Promise<Result<{ status: PaymentStatus }>> {
  const access = await authorize(db, actor, "quotes.write");
  if (!access.ok) return access;
  if (method === "stripe") return invalid("I pagamenti con carta si confermano da soli tramite Stripe.");
  const row = (
    await db
      .select()
      .from(quotePaymentSettings)
      .where(and(eq(quotePaymentSettings.workspaceId, access.value.id), eq(quotePaymentSettings.quoteId, quoteId)))
      .limit(1)
  )[0];
  if (!row) return notFound("Questo preventivo non ha un pagamento da confermare.");
  const current = asStatus(row.paymentStatus);
  if (current === "paid") return invalid("Questo preventivo risulta già pagato.");
  let snapshot: PaymentSnapshot;
  try {
    snapshot = JSON.parse(row.snapshotJson ?? "{}") as PaymentSnapshot;
  } catch {
    return invalid("I dati di pagamento di questo preventivo non sono leggibili.");
  }
  if (!snapshot.totalCents) snapshot = { ...snapshot, totalCents: row.amountDueCents ?? 0, amountDueCents: row.amountDueCents ?? 0, depositMode: asDepositMode(row.depositMode), depositBp: row.depositBp ?? null, depositCents: row.depositCents ?? null };
  const choice = kind === "deposit_paid" ? "deposit" : current === "deposit_paid" ? "balance" : "full";
  const resolved = resolvePaymentCharge({
    snapshot,
    status: current,
    amountPaidCents: row.amountPaidCents ?? 0,
    choice,
  });
  if (!resolved.ok) return invalid(resolved.message);
  const status = resolved.nextStatus;
  const paidCents = (row.amountPaidCents ?? 0) + resolved.amountCents;
  const now = new Date();
  await db
    .update(quotePaymentSettings)
    .set({ paymentStatus: status, amountPaidCents: paidCents, updatedAt: now })
    .where(and(eq(quotePaymentSettings.workspaceId, access.value.id), eq(quotePaymentSettings.quoteId, quoteId)));
  await db.insert(quotePaymentEvents).values({
    id: createId(),
    workspaceId: access.value.id,
    quoteId,
    method,
    kind: "marked_paid",
    amountCents: resolved.amountCents,
    actorUserId: actor.userId,
    createdAt: now,
  });
  const eventId = createId();
  const { quoteEvents } = await import("@/db/schema");
  await db.insert(quoteEvents).values({
    id: eventId,
    workspaceId: access.value.id,
    quoteId,
    type: status === "paid" ? "payment_paid" : "payment_deposit_paid",
    actor: "user",
    actorUserId: actor.userId,
    meta: JSON.stringify({ method, amountCents: resolved.amountCents, totalPaidCents: paidCents, choice: resolved.choice, source: "manual" }),
    createdAt: now,
  });
  await writeAuditLog(db, {
    workspaceId: access.value.id,
    actorUserId: actor.userId,
    action: status === "paid" ? "payments.marked_paid" : "payments.marked_deposit",
    entityType: "quote",
    entityId: quoteId,
    meta: { method, amountCents: resolved.amountCents, totalPaidCents: paidCents, choice: resolved.choice },
  });
  await notifyQuoteOwner(db, {
    workspaceId: access.value.id,
    quoteId,
    eventId,
    type: status === "paid" ? "quote_paid" : "quote_deposit_paid",
    studioName: access.value.name,
  });
  return ok({ status });
}

export async function recordStripePayment(
  db: AppDatabase,
  input: {
    workspaceId: string;
    quoteId: string;
    amountCents: number;
    sessionId: string | null;
    paymentIntentId: string | null;
    choice?: string | null;
  },
): Promise<{ status: PaymentStatus; changed: boolean }> {
  const row = (
    await db
      .select()
      .from(quotePaymentSettings)
      .where(and(eq(quotePaymentSettings.workspaceId, input.workspaceId), eq(quotePaymentSettings.quoteId, input.quoteId)))
      .limit(1)
  )[0];
  if (!row) return { status: "none", changed: false };
  const current = asStatus(row.paymentStatus);
  if (current === "paid") return { status: "paid", changed: false };
  const alreadyRecorded = (
    await db
      .select({ kind: quotePaymentEvents.kind, sessionId: quotePaymentEvents.stripeSessionId, intentId: quotePaymentEvents.stripePaymentIntentId })
      .from(quotePaymentEvents)
      .where(and(eq(quotePaymentEvents.workspaceId, input.workspaceId), eq(quotePaymentEvents.quoteId, input.quoteId)))
  ).some(
    (event) =>
      (event.kind === "paid" || event.kind === "deposit_paid") &&
      ((input.sessionId && event.sessionId === input.sessionId) || (input.paymentIntentId && event.intentId === input.paymentIntentId)),
  );
  if (alreadyRecorded) return { status: current, changed: false };
  let snapshot: PaymentSnapshot;
  try {
    snapshot = JSON.parse(row.snapshotJson ?? "{}") as PaymentSnapshot;
  } catch {
    return { status: current, changed: false };
  }
  const paidSoFar = row.amountPaidCents ?? 0;
  const choice =
    (isPaymentChoice(input.choice) ? input.choice : null) ??
    inferPaymentChoice(snapshot, current, paidSoFar, input.amountCents);
  const resolved = resolvePaymentCharge({ snapshot, status: current, amountPaidCents: paidSoFar, choice });
  if (!resolved.ok) return { status: current, changed: false };
  if (input.amountCents > 0 && input.amountCents !== resolved.amountCents) {
    return { status: current, changed: false };
  }
  const status = resolved.nextStatus;
  const charged = resolved.amountCents;
  const paidCents = paidSoFar + charged;
  const now = new Date();
  await db
    .update(quotePaymentSettings)
    .set({ paymentStatus: status, amountPaidCents: paidCents, updatedAt: now })
    .where(and(eq(quotePaymentSettings.workspaceId, input.workspaceId), eq(quotePaymentSettings.quoteId, input.quoteId)));
  await db.insert(quotePaymentEvents).values({
    id: createId(),
    workspaceId: input.workspaceId,
    quoteId: input.quoteId,
    method: "stripe",
    kind: status === "paid" ? "paid" : "deposit_paid",
    amountCents: charged,
    stripeSessionId: input.sessionId,
    stripePaymentIntentId: input.paymentIntentId,
    createdAt: now,
  });
  const eventId = createId();
  const { quoteEvents } = await import("@/db/schema");
  await db.insert(quoteEvents).values({
    id: eventId,
    workspaceId: input.workspaceId,
    quoteId: input.quoteId,
    type: status === "paid" ? "payment_paid" : "payment_deposit_paid",
    actor: "recipient",
    meta: JSON.stringify({ method: "stripe", amountCents: charged, totalPaidCents: paidCents, choice: resolved.choice, source: "stripe" }),
    createdAt: now,
  });
  await writeAuditLog(db, {
    workspaceId: input.workspaceId,
    action: status === "paid" ? "payments.stripe_paid" : "payments.stripe_deposit",
    entityType: "quote",
    entityId: input.quoteId,
    meta: { amountCents: charged, totalPaidCents: paidCents, choice: resolved.choice },
  });
  const { workspaces } = await import("@/db/schema");
  const [ws] = await db.select({ name: workspaces.name }).from(workspaces).where(eq(workspaces.id, input.workspaceId)).limit(1);
  await notifyQuoteOwner(db, {
    workspaceId: input.workspaceId,
    quoteId: input.quoteId,
    eventId,
    type: status === "paid" ? "quote_paid" : "quote_deposit_paid",
    studioName: ws?.name ?? "CTRL Quotes",
  });
  return { status, changed: true };
}

