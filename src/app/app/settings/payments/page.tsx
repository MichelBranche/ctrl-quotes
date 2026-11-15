import { Suspense } from "react";
import { PaymentsForm } from "@/components/settings/payments-form";
import { can } from "@/domain/permissions";
import { loadSettings } from "@/app/app/settings/load";
import { getWorkspacePayments } from "@/server/payments";

export const metadata = { title: "Pagamenti" };

export default function PaymentsPage({ searchParams }: { searchParams: Promise<{ stripe?: string }> }) {
  return (
    <Suspense fallback={<div className="pt-wait" aria-busy="true" />}>
      <PaymentsContent searchParams={searchParams} />
    </Suspense>
  );
}

async function PaymentsContent({ searchParams }: { searchParams: Promise<{ stripe?: string }> }) {
  const { stripe } = await searchParams;
  const { db, actor, role } = await loadSettings();
  const payments = await getWorkspacePayments(db, actor);
  if (!payments.ok) throw new Error(payments.message);
  return <PaymentsForm initial={payments.value} canEdit={can(role, "settings.write")} stripeQuery={stripe ?? null} />;
}
