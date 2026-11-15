import { Suspense } from "react";
import { connection } from "next/server";
import { BillingNav } from "@/components/billing/billing-nav";
import { currentPlanLabel, teamSeatLimitLabelFromCap, workspaceTeamSeatLimit } from "@/domain/plans";
import { requireContext } from "@/server/context";

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
  const { workspace } = await requireContext();
  // Only "free" exists today (shown as a trial). Mapping free/pro/studio to Starter/Pro/Business is a Fase 5 decision.
  const seatLabel = teamSeatLimitLabelFromCap(workspaceTeamSeatLimit(workspace.plan, workspace.planOverride));
  return <BillingNav planLabel={currentPlanLabel(workspace.plan, workspace.planOverride)} seatLabel={seatLabel} />;
}
