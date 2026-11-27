import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { ensureMigrated, getDb } from "@/db/client";
import { submitPublicBillingDetails } from "@/server/invoicing";
import { loadPublicQuote } from "@/server/public-quote";
import { clientIp, isSameOriginRequest } from "@/server/request-meta";

type Params = Promise<{ token: string }>;

/** The client sends or corrects the billing details (P.IVA, CF, SDI/PEC, indirizzo) after accepting. */
export async function POST(request: Request, context: { params: Params }): Promise<Response> {
  await ensureMigrated();
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Richiesta non consentita." }, { status: 403 });
  }
  const { token } = await context.params;
  const db = getDb();
  const view = await loadPublicQuote(db, token.slice(0, 64), clientIp(await headers()));
  if (view.kind === "limited") return NextResponse.json({ error: "Troppe richieste, riprova tra poco." }, { status: 429 });
  if (view.kind !== "active") return NextResponse.json({ error: "Questo link non è più attivo." }, { status: 404 });
  let raw: unknown = null;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Dati non leggibili." }, { status: 400 });
  }
  const result = await submitPublicBillingDetails(db, {
    workspaceId: view.workspaceId,
    quoteId: view.quoteId,
    accepted: view.status === "accepted",
    raw,
  });
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 400 });
  return NextResponse.json({ value: result.value });
}
