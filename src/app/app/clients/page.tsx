import { EmptyPage } from "@/components/shell/empty-page";
import { messages } from "@/i18n/it";

export const metadata = { title: "Clienti" };

export default function ClientsPage() {
  return (
    <EmptyPage
      title={messages.clients.title}
      subtitle={messages.clients.subtitle}
      emptyTitle={messages.clients.emptyTitle}
      emptyBody={messages.clients.emptyBody}
      action={messages.clients.action}
    />
  );
}
