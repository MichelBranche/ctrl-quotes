import type { AppDatabase } from "@/db/client";
import { user, workspaceMemberships } from "@/db/schema";
import { createId } from "@/domain/ids";
import type { Role } from "@/domain/roles";
import { createWorkspace } from "@/server/workspaces";

export async function makeUser(db: AppDatabase, email: string, name = "Utente Test") {
  const id = createId();
  const now = new Date();
  await db.insert(user).values({ id, name, email, emailVerified: true, createdAt: now, updatedAt: now });
  return id;
}

export async function ownerWithWorkspace(db: AppDatabase, email: string, workspaceName: string) {
  const userId = await makeUser(db, email, workspaceName);
  const workspace = await createWorkspace(db, { userId, name: workspaceName, taxProfile: "ordinario" });
  return { userId, workspaceId: workspace.id };
}

export async function joinAs(db: AppDatabase, workspaceId: string, email: string, role: Exclude<Role, "owner">) {
  const userId = await makeUser(db, email);
  await db.insert(workspaceMemberships).values({ workspaceId, userId, role, createdAt: new Date() });
  return { userId, workspaceId };
}
