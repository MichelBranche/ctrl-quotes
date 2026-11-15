import { Suspense } from "react";
import { BillingApp } from "@/components/billing/billing-app";

export const metadata = { title: "Piano Pro" };

export default function Page() {
  return (
    <Suspense fallback={<div className="pt-wait" aria-busy="true" />}>
      <BillingApp view="pro" />
    </Suspense>
  );
}
