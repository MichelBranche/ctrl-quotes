import { Suspense } from "react";
import { BillingApp } from "@/components/billing/billing-app";

export const metadata = { title: "Abbonamento" };

type Search = Promise<{ checkout?: string }>;

export default function Page({ searchParams }: { searchParams?: Search }) {
  return (
    <Suspense fallback={<div className="pt-wait" aria-busy="true" />}>
      <BillingPage searchParams={searchParams} />
    </Suspense>
  );
}

async function BillingPage({ searchParams }: { searchParams?: Search }) {
  const params = searchParams ? await searchParams : {};
  const raw = typeof params.checkout === "string" ? params.checkout : "";
  const notice = raw === "success" || raw === "cancel" ? raw : null;
  return <BillingApp view="plans" notice={notice} />;
}
