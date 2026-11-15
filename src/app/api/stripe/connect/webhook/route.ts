import { NextResponse } from "next/server";
import { ensureMigrated, getDb } from "@/db/client";
import { getStripe, stripeConfigured } from "@/server/stripe/client";
import { applyConnectEvent } from "@/server/stripe/connect-webhook";
import { connectWebhookSecretConfigured } from "@/server/stripe/connect";

export async function POST(request: Request): Promise<Response> {
  if (!stripeConfigured() || !connectWebhookSecretConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "missing_signature" }, { status: 400 });

  const raw = await request.text();
  let event;
  try {
    event = getStripe().webhooks.constructEvent(raw, signature, process.env.STRIPE_CONNECT_WEBHOOK_SECRET!.trim());
  } catch {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  await ensureMigrated();
  await applyConnectEvent(getDb(), event);
  return NextResponse.json({ received: true });
}
