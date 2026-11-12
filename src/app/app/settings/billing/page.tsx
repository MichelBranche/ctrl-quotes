import { EmptyState, PageHeader } from "@/components/ui/status";
import { messages } from "@/i18n/it";

export const metadata = { title: "Fatturazione" };

export default function BillingPage() {
  return (
    <>
      <PageHeader title={messages.settings.billing} subtitle={messages.shell.billingHint} />
      <EmptyState title={messages.settings.futureTitle} body={messages.shell.managePlanHint} />
    </>
  );
}
