import { Suspense } from "react";
import { connection } from "next/server";
import { BillingNav } from "@/components/billing/billing-nav";
import { BillingTransitionProvider } from "@/components/billing/billing-transition";
import { currentPlanLabel } from "@/domain/plans";
import { requireContext } from "@/server/context";

export default function BillingLayout({ children }: { children: React.ReactNode }) {
  return (
    <BillingTransitionProvider>
      <div className="bl-page">
        <Suspense fallback={<BillingNav planLabel="…" />}>
          <CurrentPlanNav />
        </Suspense>
        {children}
      </div>
    </BillingTransitionProvider>
  );
}

async function CurrentPlanNav() {
  await connection();
  const { workspace } = await requireContext();
  // Only "free" exists today (shown as a trial). Mapping free/pro/studio to Starter/Pro/Business is a Fase 5 decision.
  return <BillingNav planLabel={currentPlanLabel(workspace.plan, workspace.planOverride)} />;
}
