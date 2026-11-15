import { Suspense } from "react";
import { connection } from "next/server";
import { TeamView } from "@/components/settings/team-view";
import { requireContext } from "@/server/context";
import { getSeatUsage, listPendingInvites } from "@/server/invites";
import { listMembers } from "@/server/team";

export const metadata = { title: "Team e ruoli" };

export default function TeamPage() {
  return (
    <Suspense fallback={<div className="pt-wait" aria-busy="true" />}>
      <TeamContent />
    </Suspense>
  );
}

async function TeamContent() {
  await connection();
  const { db, actor } = await requireContext();
  const [members, invites, seats] = await Promise.all([
    listMembers(db, actor),
    listPendingInvites(db, actor),
    getSeatUsage(db, actor.workspaceId),
  ]);
  if (!members.ok) throw new Error(members.message);
  if (!invites.ok) throw new Error(invites.message);
  if (!seats) throw new Error("Workspace non trovato.");
  return <TeamView members={members.value.members} myRole={members.value.myRole} invites={invites.value} seats={seats} />;
}
