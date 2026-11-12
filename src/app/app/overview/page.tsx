import { Suspense } from "react";
import { connection } from "next/server";
import { EmptyState, PageHeader, Skeleton } from "@/components/ui/status";
import { greetingFor, messages } from "@/i18n/it";
import { loadShell } from "@/server/session";

export const metadata = { title: "Overview" };

export default function OverviewPage() {
  return (
    <Suspense fallback={<Skeleton width="40%" />}>
      <OverviewContent />
    </Suspense>
  );
}

async function OverviewContent() {
  await connection();
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
