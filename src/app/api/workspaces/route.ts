import { NextResponse } from "next/server";
import { z } from "zod";
import { ensureMigrated, getDb } from "@/db/client";
import { taxProfiles } from "@/domain/pricing";
import { getAuth } from "@/server/auth";
import { writeAuditLog } from "@/server/audit";
import { workspaceCookieOptions } from "@/server/session";
import { createWorkspace } from "@/server/workspaces";

const bodySchema = z.object({
  name: z.string().trim().min(2).max(80),
  taxProfile: z.enum(taxProfiles),
});

export async function POST(request: Request): Promise<Response> {
  await ensureMigrated();
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dati non validi" }, { status: 400 });
  const workspace = await createWorkspace(getDb(), {
    userId: session.user.id,
    name: parsed.data.name,
    taxProfile: parsed.data.taxProfile,
  });
  await writeAuditLog(getDb(), {
    workspaceId: workspace.id,
    actorUserId: session.user.id,
    action: "workspace.created",
    entityType: "workspace",
    entityId: workspace.id,
  });
  const response = NextResponse.json(workspace);
  response.cookies.set("cq_workspace", workspace.id, await workspaceCookieOptions());
  return response;
}
