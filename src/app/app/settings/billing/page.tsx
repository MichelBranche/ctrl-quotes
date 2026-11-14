import { BillingView } from "@/components/billing/billing-view";

export const metadata = { title: "Abbonamento" };

export default function Page() {
  return <BillingView view="plans" />;
}
