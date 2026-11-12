import { toNextJsHandler } from "better-auth/next-js";
import { ensureMigrated } from "@/db/client";
import { getAuth } from "@/server/auth";

async function handler(request: Request): Promise<Response> {
  await ensureMigrated();
  const auth = toNextJsHandler(getAuth());
  if (request.method === "POST") return auth.POST(request);
  return auth.GET(request);
}

export { handler as GET, handler as POST };
