import { NextResponse } from "next/server";
import { ensureMigrated, getDb } from "@/db/client";
import { getAuth } from "@/server/auth";
import { recordView } from "@/server/public-quote";
import { createRateLimiter, rateRules } from "@/server/rate-limit";
import { clientIp } from "@/server/request-meta";
import { listWorkspaces } from "@/server/workspaces";

/** Same-origin JSON only: a cross-site form or image tag cannot fake an open. */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: Request, context: { params: Promise<{ token: string }> }): Promise<Response> {
  if (!sameOrigin(request) || !request.headers.get("content-type")?.startsWith("application/json")) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  await ensureMigrated();
  const db = getDb();
  const ip = clientIp(request.headers);
  if (!(await createRateLimiter(db).hit(rateRules.publicRead, ip)).ok) return NextResponse.json({ ok: false }, { status: 429 });
  const { token } = await context.params;
  const session = await getAuth().api.getSession({ headers: request.headers }).catch(() => null);
  const skipWorkspaceIds = session ? (await listWorkspaces(db, session.user.id)).map((workspace) => workspace.id) : [];
  const result = await recordView(db, token, { userAgent: request.headers.get("user-agent"), skipWorkspaceIds });
  return NextResponse.json({ ok: result.recorded });
}
