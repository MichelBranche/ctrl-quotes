import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ensureMigrated, getDb } from "@/db/client";
import { redeemErrorMessages } from "@/domain/redeem";
import { getAuth } from "@/server/auth";
import { createRateLimiter, rateRules } from "@/server/rate-limit";
import { redeemCode } from "@/server/redeem";
import { listWorkspaces } from "@/server/workspaces";

/** POST { code } → redeems it for the active workspace (the one chosen in the switcher). */
export async function POST(request: Request): Promise<Response> {
  await ensureMigrated();
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return NextResponse.json({ error: "unauthenticated", message: "Accedi per riscattare un codice." }, { status: 401 });
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json({ error: "invalid", message: redeemErrorMessages.invalid }, { status: 415 });
  }

  const db = getDb();
  const limit = await createRateLimiter(db).hit(rateRules.redeem, session.user.id);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "rate_limited", message: redeemErrorMessages.rate_limited },
      { status: 429, headers: { "retry-after": String(Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000))) } },
    );
  }

  const body = (await request.json().catch(() => null)) as { code?: unknown } | null;
  const workspaces = await listWorkspaces(db, session.user.id);
  const requested = (await cookies()).get("cq_workspace")?.value;
  const workspace = workspaces.find((item) => item.id === requested) ?? workspaces[0];
  if (!workspace) return NextResponse.json({ error: "forbidden", message: redeemErrorMessages.forbidden }, { status: 403 });

  const result = await redeemCode(db, { userId: session.user.id, workspaceId: workspace.id, code: body?.code });
  if (!result.ok) {
    const status = result.error === "forbidden" ? 403 : result.error === "invalid" ? 404 : 409;
    return NextResponse.json({ error: result.error, message: redeemErrorMessages[result.error] }, { status });
  }
  return NextResponse.json(result.value);
}
