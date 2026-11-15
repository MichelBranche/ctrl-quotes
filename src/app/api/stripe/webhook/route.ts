import { NextResponse } from "next/server";
import { ensureMigrated, getDb } from "@/db/client";
import { getStripe, stripeConfigured, webhookSecretConfigured } from "@/server/stripe/client";
import { applyStripeEvent } from "@/server/stripe/webhook";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  if (!stripeConfigured() || !webhookSecretConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "missing_signature" }, { status: 400 });

  const raw = await request.text();
  let event;
  try {
    event = getStripe().webhooks.constructEvent(raw, signature, process.env.STRIPE_WEBHOOK_SECRET!.trim());
  } catch {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  await ensureMigrated();
  await applyStripeEvent(getDb(), event);
  return NextResponse.json({ received: true });
}
