import { connection } from "next/server";
import { BillingView, type BillingViewId } from "@/components/billing/billing-view";
import { requireContext } from "@/server/context";
import { loadBillingState } from "@/server/stripe/billing";

export async function BillingApp({
  view,
  notice = null,
}: {
  view: BillingViewId;
  notice?: "success" | "cancel" | null;
}) {
  await connection();
  const { db, actor } = await requireContext();
  const billing = await loadBillingState(db, actor);
  return <BillingView view={view} billing={billing} notice={notice} />;
}
