import { EmptyState, PageHeader } from "@/components/ui/status";
import { greetingFor, messages } from "@/i18n/it";
import { loadShell } from "@/server/session";

export const metadata = { title: "Overview" };

export default async function OverviewPage() {
  const shell = await loadShell();
  const firstName = shell.user.name.split(" ")[0] ?? shell.user.name;
  return (
    <>
      <PageHeader
        title={`${greetingFor(new Date())}, ${firstName}.`}
        subtitle={messages.overview.subtitle}
      />
      <EmptyState title={messages.overview.emptyTitle} body={messages.overview.emptyBody} />
    </>
  );
}
