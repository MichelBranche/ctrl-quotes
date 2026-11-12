import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { Plus } from "lucide-react";
import { IllustratedEmpty } from "@/components/ui/illustrated-empty";
import { PageHeader, Skeleton } from "@/components/ui/status";
import { can } from "@/domain/permissions";
import { greetingFor, messages } from "@/i18n/it";
import { requireContext } from "@/server/context";
import { listQuotes } from "@/server/quotes";

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
  const { db, actor, workspace, userName } = await requireContext();
  const firstName = userName.split(" ")[0] ?? userName;
  const list = await listQuotes(db, actor, { pageSize: 1 });
  const total = list.ok ? list.value.workspaceTotal : 0;
  const canWrite = can(workspace.role, "quotes.write");
  return (
    <>
      <PageHeader
        title={`${greetingFor(new Date())}, ${firstName}.`}
        subtitle={total > 0 ? messages.overview.filledSubtitle : messages.overview.subtitle}
      />
      {total > 0 ? (
        <p>
          <Link className="btn btn-secondary" href="/app/quotes">
            {messages.overview.openQuotes}
          </Link>
        </p>
      ) : (
        <IllustratedEmpty
          scene="first-quote"
          title={messages.overview.emptyTitle}
          body={messages.overview.emptyBody}
          float
          action={
            canWrite ? (
              <Link className="btn btn-primary" href="/app/quotes/new">
                <Plus size={16} aria-hidden="true" /> {messages.quotes.action}
              </Link>
            ) : undefined
          }
        />
      )}
    </>
  );
}
