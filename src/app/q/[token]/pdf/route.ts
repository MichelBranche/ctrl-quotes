import { ensureMigrated, getDb } from "@/db/client";
import { pdfFilename, renderQuotePdf } from "@/server/pdf/quote-pdf";
import { openSentVersion } from "@/server/public-quote";
import { loadSnapshotImagesFor } from "@/server/quotes";
import { clientIp } from "@/server/request-meta";

/** PDF of the version the client sees. Same rules as the page: active links only. */
export async function GET(request: Request, context: { params: Promise<{ token: string }> }): Promise<Response> {
  await ensureMigrated();
  const db = getDb();
  const { token } = await context.params;
  const sent = await openSentVersion(db, token, clientIp(request.headers));
  if (sent && "limited" in sent) return new Response("Troppe richieste, riprova tra poco.", { status: 429 });
  if (!sent) return new Response("Link non attivo", { status: 404 });
  const images = await loadSnapshotImagesFor(db, sent.workspaceId, sent.snapshot);
  const pdf = await renderQuotePdf(sent.snapshot, { images, watermark: null, versionLabel: `v${sent.versionNo}` });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${pdfFilename(sent.snapshot, sent.versionNo)}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
