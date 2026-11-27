import { ensureMigrated, getDb } from "@/db/client";
import { readPublicInvoicePdf } from "@/server/invoicing";
import { openSentVersion } from "@/server/public-quote";
import { clientIp } from "@/server/request-meta";

/** Invoice PDF for the client: active quote links only, and only once the invoice is issued. */
export async function GET(request: Request, context: { params: Promise<{ token: string }> }): Promise<Response> {
  await ensureMigrated();
  const db = getDb();
  const { token } = await context.params;
  const sent = await openSentVersion(db, token.slice(0, 64), clientIp(request.headers));
  if (sent && "limited" in sent) return new Response("Troppe richieste, riprova tra poco.", { status: 429 });
  if (!sent) return new Response("Link non attivo", { status: 404 });
  const pdf = await readPublicInvoicePdf(db, sent.workspaceId, sent.quoteId);
  if (!pdf) return new Response("Fattura non disponibile", { status: 404 });
  return new Response(new Uint8Array(pdf.data), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${pdf.filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
