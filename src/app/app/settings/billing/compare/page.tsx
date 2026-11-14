import { BillingView } from "@/components/billing/billing-view";

export const metadata = { title: "Confronta i piani" };

export default function Page() {
  return <BillingView view="compare" />;
}
