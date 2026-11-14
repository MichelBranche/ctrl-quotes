"use server";

import { getDb } from "@/db/client";
import { markNotificationsRead } from "@/server/notifications";
import { requireContext } from "@/server/context";

export async function markNotificationsReadAction(ids: string[]): Promise<void> {
  const { db, actor } = await requireContext();
  await markNotificationsRead(db, actor.userId, actor.workspaceId, ids);
}
