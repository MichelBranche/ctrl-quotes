import { Suspense } from "react";
import { connection } from "next/server";
import { BillingNav } from "@/components/billing/billing-nav";
import { currentPlanLabel, teamSeatLimitLabelFromCap, workspaceTeamSeatLimit } from "@/domain/plans";
import { requireContext } from "@/server/context";
import { loadBillingState } from "@/server/stripe/billing";

export default function BillingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bl-page">
      <Suspense fallback={<BillingNav planLabel="…" />}>
        <CurrentPlanNav />
      </Suspense>
      {children}
    </div>
  );
}

async function CurrentPlanNav() {
  await connection();
  const { db, actor, workspace } = await requireContext();
  // Mapping free/pro/studio to Starter/Pro/Business: paid Business is stored as `studio`.
  const seatLabel = teamSeatLimitLabelFromCap(workspaceTeamSeatLimit(workspace.plan, workspace.planOverride));
  const billing = await loadBillingState(db, actor);
  const statusLabel = billing.checkoutEnabled && billing.status !== "trial" ? billing.statusLabel : undefined;
  return (
    <BillingNav
      planLabel={currentPlanLabel(workspace.plan, workspace.planOverride)}
      seatLabel={seatLabel}
      statusLabel={statusLabel}
    />
  );
}
