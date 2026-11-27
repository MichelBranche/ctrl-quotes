import { z } from "zod";
import { formatEuro, roundHalfUp } from "@/domain/money";

export const paymentMethodIds = ["iban", "paypal", "stripe"] as const;
export type PaymentMethodId = (typeof paymentMethodIds)[number];

export const paymentStatuses = ["none", "awaiting", "deposit_paid", "paid"] as const;
export type PaymentStatus = (typeof paymentStatuses)[number];

export const depositModes = ["full", "percent", "amount"] as const;
export type DepositMode = (typeof depositModes)[number];

export const paymentChoices = ["deposit", "full", "balance"] as const;
export type PaymentChoice = (typeof paymentChoices)[number];

export const paymentChoiceLabel: Record<PaymentChoice, string> = {
  deposit: "Paga l'acconto",
  full: "Paga il totale",
  balance: "Paga il saldo",
};

export const paypalModes = ["me", "email"] as const;
export type PaypalMode = (typeof paypalModes)[number];

export const stripeConnectStatuses = ["none", "pending", "active"] as const;
export type StripeConnectStatus = (typeof stripeConnectStatuses)[number];

/** Platform fee on quote Checkout Sessions (direct charge). 0: the money stays with the connected account. */
export const CONNECT_APPLICATION_FEE_AMOUNT = 0;

export const CONNECT_ENABLE_STEPS = [
  "Apri la Dashboard Stripe in modalità test: https://dashboard.stripe.com/test/settings/connect",
  "In alto a destra verifica che l'interruttore sia su Test, non su Live.",
  "Nella pagina Connect (Impostazioni, Connect oppure Get started) avvia Connect e accetta i termini della piattaforma.",
  "Apri https://dashboard.stripe.com/test/webhooks e aggiungi un endpoint: https://quotes.ctrlagency.dev/api/stripe/connect/webhook",
  "Ascolta gli eventi degli account collegati: account.updated, checkout.session.completed, payment_intent.succeeded.",
  "Copia il signing secret (whsec_…) nella variabile di ambiente di Production STRIPE_CONNECT_WEBHOOK_SECRET, poi ridistribuisci.",
] as const;


export const DEFAULT_CAUSALE_TEMPLATE = "Preventivo {numero}";

export const paymentMethodLabel: Record<PaymentMethodId, string> = {
  iban: "Bonifico bancario",
  paypal: "PayPal",
  stripe: "Carta (Stripe)",
};

export const paymentStatusLabel: Record<PaymentStatus, string> = {
  none: "Nessun pagamento",
  awaiting: "In attesa di pagamento",
  deposit_paid: "Acconto pagato",
  paid: "Pagato",
};

export const stripeConnectStatusLabel: Record<StripeConnectStatus, string> = {
  none: "Non collegato",
  pending: "In verifica",
  active: "Attivo",
};

export function isPaymentMethodId(value: unknown): value is PaymentMethodId {
  return typeof value === "string" && (paymentMethodIds as readonly string[]).includes(value);
}

export function isPaymentStatus(value: unknown): value is PaymentStatus {
  return typeof value === "string" && (paymentStatuses as readonly string[]).includes(value);
}

export function normalizeIban(raw: string): string {
  return raw.replace(/[\s-]+/g, "").toUpperCase();
}

/** ISO 13616: rearrange, expand letters, remainder 1 modulo 97. */
export function isValidIban(raw: string): boolean {
  const iban = normalizeIban(raw);
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  if (iban.length < 15 || iban.length > 34) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let expanded = "";
  for (const char of rearranged) {
    expanded += /[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char;
  }
  let remainder = 0;
  for (const digit of expanded) {
    remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

export function formatIbanGroups(raw: string): string {
  const iban = normalizeIban(raw);
  return iban.replace(/(.{4})/g, "$1 ").trim();
}

/** First 4 and last 4 characters, middle groups hidden. Safe to show in lists and logs. */
export function maskIban(raw: string): string {
  const iban = normalizeIban(raw);
  if (iban.length < 8) return "••••";
  const hidden = iban.length - 8;
  const groups = Math.ceil(hidden / 4);
  return `${iban.slice(0, 4)} ${"•••• ".repeat(groups)}${iban.slice(-4)}`.replace(/\s+/g, " ").trim();
}

const PAYPAL_ME_RE = /^(?:https?:\/\/)?(?:www\.)?paypal\.me\/([A-Za-z0-9._-]{3,128})\/?$/i;
const PAYPAL_HANDLE_RE = /^[A-Za-z0-9._-]{3,128}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

export type ParsedPaypal =
  | { ok: true; mode: "me"; handle: string; value: string }
  | { ok: true; mode: "email"; value: string }
  | { ok: false; message: string };

export function parsePaypal(raw: string): ParsedPaypal {
  const value = raw.trim();
  if (!value) return { ok: false, message: "Inserisci il link paypal.me o l'email PayPal." };
  const me = value.match(PAYPAL_ME_RE);
  if (me?.[1]) return { ok: true, mode: "me", handle: me[1], value: me[1] };
  if (EMAIL_RE.test(value)) return { ok: true, mode: "email", value: value.toLowerCase() };
  if (PAYPAL_HANDLE_RE.test(value) && !value.includes("@")) {
    return { ok: true, mode: "me", handle: value, value };
  }
  return { ok: false, message: "Usa un link paypal.me (paypal.me/nome) o un'email PayPal valida." };
}

export function paypalMePaymentHref(handle: string, amountCents: number): string {
  const amount = (Math.max(0, amountCents) / 100).toFixed(2);
  return `https://www.paypal.me/${encodeURIComponent(handle)}/${amount}EUR`;
}

export function paypalEmailMailto(email: string, amountCents: number, causale: string): string {
  const subject = encodeURIComponent(causale);
  const body = encodeURIComponent(`Importo: ${formatEuro(amountCents)}\nCausale: ${causale}`);
  return `mailto:${email}?subject=${subject}&body=${body}`;
}

export function renderCausale(
  template: string,
  values: { numero?: string | null; titolo?: string | null; importoCents?: number },
): string {
  const source = template.trim() || DEFAULT_CAUSALE_TEMPLATE;
  const filled = source.replace(/\{([a-z]+)\}/gi, (_, key: string) => {
    const token = key.toLowerCase();
    if (token === "numero") return values.numero?.trim() || "senza numero";
    if (token === "titolo") return values.titolo?.trim() || "";
    if (token === "importo") return values.importoCents != null ? formatEuro(values.importoCents) : "";
    return "";
  });
  return filled.replace(/\s+/g, " ").trim();
}

export function causaleTemplateSchema() {
  return z
    .string()
    .trim()
    .min(1, { error: "Inserisci una causale." })
    .max(140, { error: "La causale può avere al massimo 140 caratteri." })
    .refine((value) => !/[{}]/.test(value.replace(/\{(?:numero|titolo|importo)\}/gi, "")), {
      error: "Puoi usare solo {numero}, {titolo} e {importo}.",
    });
}

export function dueAmountCents(
  totalCents: number,
  mode: DepositMode,
  depositBp: number | null,
  depositCents: number | null,
): number {
  const total = Math.max(0, totalCents);
  if (mode === "percent") {
    const bp = depositBp ?? 0;
    if (bp <= 0) return total;
    if (bp >= 10_000) return total;
    return roundHalfUp(total * bp, 10_000);
  }
  if (mode === "amount") {
    const amount = depositCents ?? 0;
    if (amount <= 0) return total;
    return Math.min(amount, total);
  }
  return total;
}

export function isDeposit(mode: DepositMode, dueCents: number, totalCents: number): boolean {
  return mode !== "full" && dueCents > 0 && dueCents < totalCents;
}

export const workspacePaymentsInputSchema = z.object({
  ibanEnabled: z.boolean(),
  ibanHolder: z.string().trim().max(120).optional().nullable(),
  iban: z.string().trim().max(42).optional().nullable(),
  bic: z.string().trim().max(11).optional().nullable(),
  causaleTemplate: causaleTemplateSchema().optional(),
  paypalEnabled: z.boolean(),
  paypalValue: z.string().trim().max(200).optional().nullable(),
  stripeEnabled: z.boolean(),
  defaultMethods: z.array(z.enum(paymentMethodIds)).max(3),
  showBeforeAcceptance: z.boolean(),
});

export const quotePaymentsInputSchema = z.object({
  methods: z.array(z.enum(paymentMethodIds)).max(3),
  depositMode: z.enum(depositModes),
  depositBp: z.number().int().min(0).max(10_000).nullable().optional(),
  depositCents: z.number().int().min(0).nullable().optional(),
  showBeforeAcceptance: z.boolean(),
});

export type WorkspacePaymentsInput = z.infer<typeof workspacePaymentsInputSchema>;
export type QuotePaymentsInput = z.infer<typeof quotePaymentsInputSchema>;

export type IbanSnapshot = { holder: string; iban: string; bic: string | null; causale: string };
export type PaypalSnapshot = { mode: PaypalMode; value: string; handle: string | null };
export type StripeSnapshot = { ready: boolean };

export type PaymentSnapshot = {
  methods: PaymentMethodId[];
  depositMode: DepositMode;
  depositBp: number | null;
  depositCents: number | null;
  amountDueCents: number;
  totalCents: number;
  showBeforeAcceptance: boolean;
  iban: IbanSnapshot | null;
  paypal: PaypalSnapshot | null;
  stripe: StripeSnapshot | null;
};

export type PublicPaymentOption = {
  choice: PaymentChoice;
  amountCents: number;
  label: string;
  hint: string | null;
  causale: string;
  paypal: { mode: PaypalMode; href: string; label: string } | null;
};

export type PublicPaymentView = {
  methods: PaymentMethodId[];
  amountDueCents: number;
  totalCents: number;
  isDeposit: boolean;
  causale: string;
  iban: { holder: string; iban: string; ibanGrouped: string; bic: string | null } | null;
  paypal: { mode: PaypalMode; href: string; label: string } | null;
  stripe: { available: boolean } | null;
  status: PaymentStatus;
  amountPaidCents: number;
  options: PublicPaymentOption[];
};

export function isPaymentChoice(value: unknown): value is PaymentChoice {
  return typeof value === "string" && (paymentChoices as readonly string[]).includes(value);
}

export function remainingBalanceCents(totalCents: number, amountPaidCents: number): number {
  return Math.max(0, Math.max(0, totalCents) - Math.max(0, amountPaidCents));
}

export function depositAmountCents(
  totalCents: number,
  mode: DepositMode,
  depositBp: number | null,
  depositCents: number | null,
): number {
  return dueAmountCents(totalCents, mode, depositBp, depositCents);
}

export function availablePaymentChoices(
  snapshot: Pick<PaymentSnapshot, "depositMode" | "depositBp" | "depositCents" | "amountDueCents" | "totalCents">,
  status: PaymentStatus,
  amountPaidCents: number,
): PaymentChoice[] {
  if (status === "paid") return [];
  const remaining = remainingBalanceCents(snapshot.totalCents, amountPaidCents);
  if (remaining <= 0) return [];
  if (status === "deposit_paid") return ["balance"];
  const deposit = snapshot.amountDueCents || depositAmountCents(snapshot.totalCents, snapshot.depositMode, snapshot.depositBp, snapshot.depositCents);
  if (isDeposit(snapshot.depositMode, deposit, snapshot.totalCents)) return ["deposit", "full"];
  return ["full"];
}

export function amountForPaymentChoice(
  snapshot: Pick<PaymentSnapshot, "depositMode" | "depositBp" | "depositCents" | "amountDueCents" | "totalCents">,
  amountPaidCents: number,
  choice: PaymentChoice,
): number {
  if (choice === "deposit") {
    return snapshot.amountDueCents || depositAmountCents(snapshot.totalCents, snapshot.depositMode, snapshot.depositBp, snapshot.depositCents);
  }
  if (choice === "balance") return remainingBalanceCents(snapshot.totalCents, amountPaidCents);
  return Math.max(0, snapshot.totalCents);
}

export function resolvePaymentCharge(input: {
  snapshot: Pick<PaymentSnapshot, "depositMode" | "depositBp" | "depositCents" | "amountDueCents" | "totalCents">;
  status: PaymentStatus;
  amountPaidCents: number;
  choice: unknown;
}):
  | { ok: true; choice: PaymentChoice; amountCents: number; nextStatus: PaymentStatus }
  | { ok: false; message: string } {
  const { snapshot, status, amountPaidCents } = input;
  const remaining = remainingBalanceCents(snapshot.totalCents, amountPaidCents);
  if (status === "paid" || remaining <= 0) {
    return { ok: false, message: "Questo preventivo risulta già pagato." };
  }
  if (!isPaymentChoice(input.choice)) {
    const available = availablePaymentChoices(snapshot, status, amountPaidCents);
    if (available.length === 1) {
      return resolvePaymentCharge({ ...input, choice: available[0] });
    }
    return { ok: false, message: "Scegli se pagare l'acconto o il totale." };
  }
  const available = availablePaymentChoices(snapshot, status, amountPaidCents);
  if (!available.includes(input.choice)) {
    if (input.choice === "deposit" && status === "deposit_paid") {
      return { ok: false, message: "L'acconto è già stato pagato. Puoi pagare il saldo rimanente." };
    }
    if (input.choice === "full" && status === "deposit_paid") {
      return { ok: false, message: "L'acconto è già stato pagato. Puoi pagare il saldo rimanente." };
    }
    if (input.choice === "balance" && status !== "deposit_paid") {
      return { ok: false, message: "Il saldo si paga dopo l'acconto." };
    }
    return { ok: false, message: "Questa scelta di pagamento non è disponibile." };
  }
  const amountCents = amountForPaymentChoice(snapshot, amountPaidCents, input.choice);
  if (amountCents <= 0) return { ok: false, message: "Non c'è un importo da pagare." };
  return {
    ok: true,
    choice: input.choice,
    amountCents,
    nextStatus: input.choice === "deposit" ? "deposit_paid" : "paid",
  };
}

export function inferPaymentChoice(
  snapshot: Pick<PaymentSnapshot, "depositMode" | "depositBp" | "depositCents" | "amountDueCents" | "totalCents">,
  status: PaymentStatus,
  amountPaidCents: number,
  amountCents: number,
): PaymentChoice | null {
  if (amountCents <= 0) return null;
  for (const choice of availablePaymentChoices(snapshot, status, amountPaidCents)) {
    if (amountForPaymentChoice(snapshot, amountPaidCents, choice) === amountCents) return choice;
  }
  return null;
}

export function asStripeConnectStatus(value: unknown): StripeConnectStatus {
  if (value === "pending" || value === "active") return value;
  return "none";
}
