import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ensureMigrated, getDb } from "@/db/client";
import { INVOICE_PDF_MAX_BYTES } from "@/domain/invoicing";
import { getAuth } from "@/server/auth";
import { readQuoteInvoicePdf, uploadQuoteInvoicePdf } from "@/server/invoicing";
import { listWorkspaces } from "@/server/workspaces";
import { isSameOriginRequest } from "@/server/request-meta";

type Params = Promise<{ quoteId: string }>;

/** Session user and the workspace picked in the switcher. Every domain call re-checks membership. */
async function actorFor(request: Request) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return null;
  const db = getDb();
  const workspaces = await listWorkspaces(db, session.user.id);
  const requested = (await cookies()).get("cq_workspace")?.value;
  const workspace = workspaces.find((item) => item.id === requested) ?? workspaces[0];
  if (!workspace) return null;
  return { db, actor: { userId: session.user.id, workspaceId: workspace.id } };
}

/** Invoice PDF for the studio. */
export async function GET(request: Request, context: { params: Params }): Promise<Response> {
  await ensureMigrated();
  const auth = await actorFor(request);
  if (!auth) return new Response("Non autenticato", { status: 401 });
  const { quoteId } = await context.params;
  const pdf = await readQuoteInvoicePdf(auth.db, auth.actor, quoteId.slice(0, 64));
  if (!pdf) return new Response("Non trovato", { status: 404 });
  const disposition = new URL(request.url).searchParams.get("download") === "1" ? "attachment" : "inline";
  return new Response(new Uint8Array(pdf.data), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${pdf.filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}

/**
 * Upload or replace the invoice PDF. Body: the raw PDF bytes (Content-Type application/pdf),
 * file name in X-Filename. Checked server-side: same origin, %PDF- header, at most 4 MB.
 */
export async function POST(request: Request, context: { params: Params }): Promise<Response> {
  await ensureMigrated();
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Richiesta non consentita." }, { status: 403 });
  }
  const auth = await actorFor(request);
  if (!auth) return NextResponse.json({ error: "Sessione scaduta. Accedi di nuovo." }, { status: 401 });
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > INVOICE_PDF_MAX_BYTES) {
    return NextResponse.json({ error: "Il PDF della fattura può pesare al massimo 4 MB." }, { status: 413 });
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  const { quoteId } = await context.params;
  let name: string | null = null;
  try {
    name = decodeURIComponent(request.headers.get("x-filename") ?? "").slice(0, 200) || null;
  } catch {
    name = null;
  }
  const result = await uploadQuoteInvoicePdf(auth.db, auth.actor, quoteId.slice(0, 64), bytes, name);
  if (!result.ok) {
    const status = result.error === "not_found" ? 404 : result.error === "forbidden" ? 403 : 400;
    return NextResponse.json({ error: result.message }, { status });
  }
  return NextResponse.json({ value: result.value });
}
