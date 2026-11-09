import { EmptyState, PageHeader } from "@/components/ui/status";
import { messages } from "@/i18n/it";

export const metadata = { title: "Brand Kit" };

export default function BrandPage() {
  return (
    <>
      <PageHeader title={messages.settings.brand} subtitle={messages.settings.futureBody} />
      <EmptyState title={messages.settings.futureTitle} body={messages.settings.futureBody} />
    </>
  );
}
