import { connection, NextResponse } from "next/server";
import { collectEcosystemMetrics } from "@/server/ecosystem-metrics";
import { bearerAuth } from "@/server/internal-auth";

/**
 * Read-only aggregates for the CTRL admin Ecosistema section. No PII.
 * Authorization: Bearer ECOSYSTEM_METRICS_SECRET.
 */
export async function GET(request: Request): Promise<Response> {
  await connection();
  const auth = bearerAuth(request.headers.get("authorization"), process.env.ECOSYSTEM_METRICS_SECRET);
  if (auth === "unconfigured") {
    return NextResponse.json({ error: "unconfigured" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  if (auth !== "ok") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const data = await collectEcosystemMetrics();
    return NextResponse.json(data, {
      status: 200,
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
