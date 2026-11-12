import type { AppDatabase } from "@/db/client";
import { auditLogs } from "@/db/schema";
import { createId } from "@/domain/ids";

export async function writeAuditLog(
  db: AppDatabase,
  input: {
    workspaceId?: string | null;
    actorUserId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    meta?: Record<string, string | number | boolean | null>;
  },
): Promise<void> {
  await db.insert(auditLogs).values({
    id: createId(),
    workspaceId: input.workspaceId ?? null,
    actorUserId: input.actorUserId ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    meta: input.meta ? JSON.stringify(input.meta) : null,
    createdAt: new Date(),
  });
}
