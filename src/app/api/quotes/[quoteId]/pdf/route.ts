import { cookies } from "next/headers";
import { ensureMigrated, getDb } from "@/db/client";
import { getAuth } from "@/server/auth";
import { loadQuoteAcceptance, toAcceptanceOverlay } from "@/server/acceptance";
import { loadBillingTermsLine } from "@/server/invoicing";
import { renderQuotePdf, pdfFilename } from "@/server/pdf/quote-pdf";
import { getDraftSnapshot, getVersionSnapshot, loadSnapshotImages } from "@/server/quotes";
import { listWorkspaces } from "@/server/workspaces";

/**
 * PDF of a frozen version (?v=N) or of the current draft, marked as such.
 * Same session and workspace checks as every other read.
 */
export async function GET(request: Request, context: { params: Promise<{ quoteId: string }> }): Promise<Response> {
  await ensureMigrated();
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) return new Response("Non autenticato", { status: 401 });
  const { quoteId } = await context.params;
  const db = getDb();
  const workspaces = await listWorkspaces(db, session.user.id);
  const requested = (await cookies()).get("cq_workspace")?.value;
  const workspace = workspaces.find((item) => item.id === requested) ?? workspaces[0];
  if (!workspace) return new Response("Non trovato", { status: 404 });
  const actor = { userId: session.user.id, workspaceId: workspace.id };
  const url = new URL(request.url);
  const versionParam = url.searchParams.get("v");
  const versionNo = versionParam && /^\d{1,6}$/.test(versionParam) ? Number(versionParam) : null;
  const id = quoteId.slice(0, 64);
  const result = versionNo ? await getVersionSnapshot(db, actor, id, versionNo) : await getDraftSnapshot(db, actor, id);
  if (!result.ok) return new Response("Non trovato", { status: 404 });
  const snapshot = "snapshot" in result.value ? result.value.snapshot : result.value;
  const images = await loadSnapshotImages(db, actor, snapshot);
  const acceptance = toAcceptanceOverlay(await loadQuoteAcceptance(db, actor.workspaceId, id), false);
  const billingTerms = await loadBillingTermsLine(db, actor.workspaceId, id);
  const pdf = await renderQuotePdf(snapshot, { images, watermark: versionNo ? null : "Bozza", versionLabel: versionNo ? `v${versionNo}` : null, acceptance, billingTerms });
  const disposition = url.searchParams.get("download") === "1" ? "attachment" : "inline";
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${disposition}; filename="${pdfFilename(snapshot, versionNo)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
