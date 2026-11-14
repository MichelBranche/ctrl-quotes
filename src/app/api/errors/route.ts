import { NextResponse } from "next/server";
import { clientIp } from "@/server/request-meta";
import { createRateLimiter } from "@/server/rate-limit";
import { getDb } from "@/db/client";
import { reportServerError } from "@/server/error-alert";

const inboundRule = { name: "error-report-http", limit: 20, windowSec: 60 * 60 } as const;

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!body || typeof body !== "object") return NextResponse.json({ ok: false }, { status: 400 });
  const data = body as Record<string, unknown>;
  const message = typeof data.message === "string" ? data.message : "";
  const digest = typeof data.digest === "string" ? data.digest : undefined;
  const route = typeof data.route === "string" ? data.route : undefined;
  const source = data.source === "global" ? "global" : "boundary";
  try {
    const limiter = createRateLimiter(getDb());
    const ip = clientIp(request.headers);
    const hit = await limiter.hit(inboundRule, ip);
    if (!hit.ok) return NextResponse.json({ ok: true, limited: true }, { status: 202 });
  } catch {
    // Still attempt the report with the internal limiter.
  }
  await reportServerError({ message, digest, route, source });
  return NextResponse.json({ ok: true });
}
