import { cookies } from "next/headers";
import { ensureMigrated, getDb } from "@/db/client";
import { getAuth } from "@/server/auth";
import { readAsset } from "@/server/settings";
import { listWorkspaces } from "@/server/workspaces";

export async function GET(request: Request, context: { params: Promise<{ assetId: string }> }): Promise<Response> {
  await ensureMigrated();
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return new Response("Non autenticato", { status: 401 });
  const { assetId } = await context.params;
  const db = getDb();
  const workspaces = await listWorkspaces(db, session.user.id);
  const requested = (await cookies()).get("cq_workspace")?.value;
  const workspace = workspaces.find((item) => item.id === requested) ?? workspaces[0];
  if (!workspace) return new Response("Non trovato", { status: 404 });
  const result = await readAsset(db, { userId: session.user.id, workspaceId: workspace.id }, assetId.slice(0, 64));
  if (!result.ok) return new Response("Non trovato", { status: 404 });
  const etag = `"${result.value.sha256}"`;
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304 });
  return new Response(new Uint8Array(result.value.bytes), {
    headers: {
      "Content-Type": result.value.mime,
      "Cache-Control": "private, max-age=3600",
      ETag: etag,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "Content-Disposition": "inline",
    },
  });
}
