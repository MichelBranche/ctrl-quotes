import { EmptyPage } from "@/components/shell/empty-page";
import { messages } from "@/i18n/it";

export const metadata = { title: "Preventivi" };

export default function QuotesPage() {
  return (
    <EmptyPage
      title={messages.quotes.title}
      subtitle={messages.quotes.subtitle}
      emptyTitle={messages.quotes.emptyTitle}
      emptyBody={messages.quotes.emptyBody}
      action={messages.quotes.action}
    />
  );
}
