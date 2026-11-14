import { PageHeader } from "@/components/ui/status";
import { messages } from "@/i18n/it";
import { LegalLinks } from "@/components/legal/legal-links";

export const metadata = { title: "Aiuto" };

export default function HelpPage() {
  return (
    <>
      <PageHeader title={messages.help.title} subtitle={messages.help.subtitle} />
      <section className="card" style={{ padding: 20 }}>
        <p>{messages.help.body}</p>
        <p className="muted">{messages.help.contact}</p>
      </section>
      <LegalLinks className="help-legal" />
    </>
  );
}
