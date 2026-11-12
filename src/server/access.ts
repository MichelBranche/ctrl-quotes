import type { AppDatabase } from "@/db/client";
import { can, permissionDeniedMessage, type Permission } from "@/domain/permissions";
import { getWorkspaceForUser, type WorkspaceSummary } from "@/server/workspaces";

export type Actor = { userId: string; workspaceId: string };

export type Failure = { ok: false; error: "not_found" | "forbidden" | "invalid" | "conflict"; message: string };
export type Ok<T> = { ok: true; value: T };
export type Result<T> = Ok<T> | Failure;

export const notFound = (message = "Elemento non trovato in questo workspace."): Failure => ({
  ok: false,
  error: "not_found",
  message,
});

export const invalid = (message: string): Failure => ({ ok: false, error: "invalid", message });

export const conflict = (message: string): Failure => ({ ok: false, error: "conflict", message });

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

/**
 * Resolves the actor's membership and checks the permission server-side.
 * A workspace the user does not belong to reads as not found, never as forbidden,
 * so ids of other tenants are not confirmed.
 */
export async function authorize(
  db: AppDatabase,
  actor: Actor,
  permission: Permission,
): Promise<Ok<WorkspaceSummary> | Failure> {
  const workspace = await getWorkspaceForUser(db, actor.userId, actor.workspaceId);
  if (!workspace) return notFound("Workspace non trovato.");
  if (!can(workspace.role, permission)) {
    return { ok: false, error: "forbidden", message: permissionDeniedMessage[workspace.role] };
  }
  return ok(workspace);
}
