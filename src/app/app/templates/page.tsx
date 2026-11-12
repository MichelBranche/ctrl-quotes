import { EmptyPage } from "@/components/shell/empty-page";
import { messages } from "@/i18n/it";

export const metadata = { title: "Template" };

export default function TemplatesPage() {
  return (
    <EmptyPage
      title={messages.templates.title}
      subtitle={messages.templates.subtitle}
      emptyTitle={messages.templates.emptyTitle}
      emptyBody={messages.templates.emptyBody}
    />
  );
}
