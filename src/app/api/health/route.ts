import { connection, NextResponse } from "next/server";
import { checkHealth } from "@/server/health";

/** Public liveness check for Aiuto e Supporto and uptime monitors. Reveals nothing but up/down. */
export async function GET(): Promise<Response> {
  await connection();
  const status = await checkHealth();
  return NextResponse.json(status, {
    status: status.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
