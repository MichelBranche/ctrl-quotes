import { EmptyState, PageHeader } from "@/components/ui/status";
import { messages } from "@/i18n/it";

export const metadata = { title: "Condizioni" };

export default function TermsSettingsPage() {
  return (
    <>
      <PageHeader title={messages.settings.terms} subtitle={messages.settings.futureBody} />
      <EmptyState title={messages.settings.futureTitle} body={messages.settings.futureBody} />
    </>
  );
}
