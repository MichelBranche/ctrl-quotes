import { Suspense } from "react";
import { connection } from "next/server";
import { TeamView } from "@/components/settings/team-view";
import { Skeleton } from "@/components/ui/status";
import { requireContext } from "@/server/context";
import { listMembers } from "@/server/team";

export const metadata = { title: "Team e ruoli" };

export default function TeamPage() {
  return (
    <Suspense fallback={<Skeleton width="40%" />}>
      <TeamContent />
    </Suspense>
  );
}

async function TeamContent() {
  await connection();
  const { db, actor } = await requireContext();
  const result = await listMembers(db, actor);
  if (!result.ok) throw new Error(result.message);
  return <TeamView members={result.value.members} myRole={result.value.myRole} />;
}
