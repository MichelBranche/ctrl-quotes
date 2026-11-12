import { EmptyPage } from "@/components/shell/empty-page";
import { messages } from "@/i18n/it";

export const metadata = { title: "Catalogo" };

export default function CatalogPage() {
  return (
    <EmptyPage
      title={messages.catalog.title}
      subtitle={messages.catalog.subtitle}
      emptyTitle={messages.catalog.emptyTitle}
      emptyBody={messages.catalog.emptyBody}
      action={messages.catalog.action}
    />
  );
}
