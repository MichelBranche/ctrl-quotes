import { EmptyState, PageHeader } from "@/components/ui/status";
import { messages } from "@/i18n/it";

export const metadata = { title: "Numerazione" };

export default function NumberingPage() {
  return (
    <>
      <PageHeader title={messages.settings.numbering} subtitle="Il formato predefinito previsto è QT-{YYYY}-{0000}." />
      <EmptyState title={messages.settings.futureTitle} body={messages.settings.futureBody} />
    </>
  );
}
