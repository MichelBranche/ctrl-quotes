"use server";

import { requireContext } from "@/server/context";
import { toAction, type ActionResult } from "@/server/actions/result";
import { resolvePublicBaseUrl } from "@/domain/public-url";
import { createCheckoutSession, createPortalSession } from "@/server/stripe/checkout";

function originFromRequest(): string {
  return resolvePublicBaseUrl(process.env);
}

export async function startCheckoutAction(planId: string): Promise<ActionResult<{ url: string }>> {
  const { db, actor } = await requireContext();
  const result = await createCheckoutSession(db, actor, planId, originFromRequest());
  return toAction(result);
}

export async function startPortalAction(): Promise<ActionResult<{ url: string }>> {
  const { db, actor } = await requireContext();
  const result = await createPortalSession(db, actor, originFromRequest());
  return toAction(result);
}
