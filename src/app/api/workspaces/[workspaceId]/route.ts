import { NextResponse } from "next/server";
import { ensureMigrated, getDb } from "@/db/client";
import { getAuth } from "@/server/auth";
import { getWorkspaceForUser } from "@/server/workspaces";

export async function GET(
  request: Request,
  context: { params: Promise<{ workspaceId: string }> },
): Promise<Response> {
  await ensureMigrated();
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  const { workspaceId } = await context.params;
  const workspace = await getWorkspaceForUser(getDb(), session.user.id, workspaceId);
  if (!workspace) return NextResponse.json({ error: "Non trovato" }, { status: 404 });
  return NextResponse.json(workspace);
}
