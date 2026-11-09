import { FutureButton } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/status";

export function EmptyPage({
  title,
  subtitle,
  emptyTitle,
  emptyBody,
  action,
}: {
  title: string;
  subtitle: string;
  emptyTitle: string;
  emptyBody: string;
  action?: string;
}) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} action={action ? <FutureButton>{action}</FutureButton> : undefined} />
      <EmptyState title={emptyTitle} body={emptyBody} />
    </>
  );
}
