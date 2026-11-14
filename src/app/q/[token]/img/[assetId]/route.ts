import { ensureMigrated, getDb } from "@/db/client";
import { openSentVersion, readSnapshotAsset } from "@/server/public-quote";
import { clientIp } from "@/server/request-meta";

/** Uploaded images of the sent version, for the public page. Nothing else is reachable. */
export async function GET(request: Request, context: { params: Promise<{ token: string; assetId: string }> }): Promise<Response> {
  await ensureMigrated();
  const db = getDb();
  const { token, assetId } = await context.params;
  const sent = await openSentVersion(db, token, clientIp(request.headers));
  if (sent && "limited" in sent) return new Response(null, { status: 429 });
  if (!sent) return new Response(null, { status: 404 });
  const asset = await readSnapshotAsset(db, sent.workspaceId, sent.snapshot, decodeURIComponent(assetId).slice(0, 64));
  if (!asset) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(asset.data), {
    headers: {
      "Content-Type": asset.mime,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      "Content-Disposition": "inline",
    },
  });
}
