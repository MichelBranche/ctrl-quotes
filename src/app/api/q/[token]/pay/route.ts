import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { ensureMigrated, getDb } from "@/db/client";
import { quotePaymentEvents, quotePaymentSettings } from "@/db/schema";
import { createId } from "@/domain/ids";
import { resolvePaymentCharge, type PaymentSnapshot } from "@/domain/payments";
import { getWorkspacePaymentRow, loadQuotePaymentForPublic } from "@/server/payments";
import { loadPublicQuote } from "@/server/public-quote";
import { resolvePublicLink } from "@/server/public-links";
import { clientIp } from "@/server/request-meta";
import { appBaseUrl, createQuoteCheckoutSession } from "@/server/stripe/connect";
import { and, eq } from "drizzle-orm";

type Params = Promise<{ token: string }>;

export async function POST(request: Request, context: { params: Params }): Promise<Response> {
  await ensureMigrated();
  const { token } = await context.params;
  const clean = token.slice(0, 64);
  const db = getDb();
  const ip = clientIp(await headers());
  const view = await loadPublicQuote(db, clean, ip);
  if (view.kind !== "active") {
    return NextResponse.json({ error: "Questo link non è più attivo." }, { status: 404 });
  }
  const resolved = await resolvePublicLink(db, clean, new Date());
  if (resolved.state !== "active") {
    return NextResponse.json({ error: "Questo link non è più attivo." }, { status: 404 });
  }
  const { workspaceId, id: quoteId } = resolved.quote;
  const accepted = view.status === "accepted";
  const payment = await loadQuotePaymentForPublic(db, workspaceId, quoteId, accepted);
  if (!payment?.methods.includes("stripe") || !payment.stripe) {
    return NextResponse.json({ error: "Il pagamento con carta non è disponibile su questo preventivo." }, { status: 400 });
  }
  if (payment.status === "paid") {
    return NextResponse.json({ error: "Questo preventivo risulta già pagato." }, { status: 409 });
  }
  let choice: unknown = null;
  try {
    const body = (await request.json()) as { choice?: unknown };
    choice = body.choice ?? null;
  } catch {
    choice = null;
  }
  const row = (
    await db
      .select()
      .from(quotePaymentSettings)
      .where(and(eq(quotePaymentSettings.workspaceId, workspaceId), eq(quotePaymentSettings.quoteId, quoteId)))
      .limit(1)
  )[0];
  if (!row?.snapshotJson) {
    return NextResponse.json({ error: "Il pagamento con carta non è disponibile su questo preventivo." }, { status: 400 });
  }
  let snapshot: PaymentSnapshot;
  try {
    snapshot = JSON.parse(row.snapshotJson) as PaymentSnapshot;
  } catch {
    return NextResponse.json({ error: "Il pagamento con carta non è disponibile su questo preventivo." }, { status: 400 });
  }
  const charge = resolvePaymentCharge({
    snapshot,
    status: payment.status,
    amountPaidCents: payment.amountPaidCents,
    choice,
  });
  if (!charge.ok) {
    return NextResponse.json({ error: charge.message }, { status: 400 });
  }
  const workspace = await getWorkspacePaymentRow(db, workspaceId);
  if (!workspace?.stripeAccountId || workspace.stripeAccountStatus !== "active") {
    return NextResponse.json({ error: "L'account Stripe dello studio non è ancora attivo." }, { status: 409 });
  }

  const origin = request.headers.get("origin");
  const publicBase = origin && /^https?:\/\//.test(origin) ? origin.replace(/\/$/, "") : appBaseUrl();
  const result = await createQuoteCheckoutSession({
    connectedAccountId: workspace.stripeAccountId,
    workspaceId,
    quoteId,
    title: view.snapshot.quote.title,
    number: view.snapshot.quote.number,
    amountCents: charge.amountCents,
    paymentChoice: charge.choice,
    successUrl: `${publicBase}/q/${clean}?pagamento=ok`,
    cancelUrl: `${publicBase}/q/${clean}?pagamento=annullato`,
    customerEmail: view.snapshot.client?.email ?? null,
  });
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 400 });

  await db.insert(quotePaymentEvents).values({
    id: createId(),
    workspaceId,
    quoteId,
    method: "stripe",
    kind: "checkout_created",
    amountCents: charge.amountCents,
    stripeSessionId: result.value.sessionId,
    createdAt: new Date(),
  });
  return NextResponse.json({ url: result.value.url, choice: charge.choice, amountCents: charge.amountCents });
}
