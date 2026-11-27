import "server-only";
import { and, desc, eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { assetBlobs, assets, quoteAcceptances } from "@/db/schema";
import { formatLongDate } from "@/domain/quote-snapshot";
import { signatureDataUrl } from "@/domain/signature";
import type { AcceptanceOverlay } from "@/components/quote-render/model";

export type AcceptanceView = {
  decision: "accepted" | "rejected";
  signerName: string;
  decidedAt: Date;
  dateLabel: string;
  signatureSrc: string | null;
};

export async function loadQuoteAcceptance(
  db: AppDatabase,
  workspaceId: string,
  quoteId: string,
): Promise<AcceptanceView | null> {
  const [row] = await db
    .select({
      decision: quoteAcceptances.decision,
      signerName: quoteAcceptances.signerName,
      createdAt: quoteAcceptances.createdAt,
      signatureAssetId: quoteAcceptances.signatureAssetId,
    })
    .from(quoteAcceptances)
    .where(and(eq(quoteAcceptances.workspaceId, workspaceId), eq(quoteAcceptances.quoteId, quoteId)))
    .orderBy(desc(quoteAcceptances.createdAt))
    .limit(1);
  if (!row) return null;
  if (row.decision !== "accepted" && row.decision !== "rejected") return null;
  let signatureSrc: string | null = null;
  if (row.decision === "accepted" && row.signatureAssetId) {
    const [asset] = await db
      .select({ mime: assets.mime, data: assetBlobs.data })
      .from(assets)
      .innerJoin(assetBlobs, and(eq(assetBlobs.workspaceId, assets.workspaceId), eq(assetBlobs.assetId, assets.id)))
      .where(and(eq(assets.workspaceId, workspaceId), eq(assets.id, row.signatureAssetId)))
      .limit(1);
    if (asset?.data) signatureSrc = signatureDataUrl(Buffer.from(asset.data), asset.mime || "image/png");
  }
  return {
    decision: row.decision,
    signerName: row.signerName,
    decidedAt: row.createdAt,
    dateLabel: formatLongDate(row.createdAt.toISOString()) ?? row.createdAt.toISOString().slice(0, 10),
    signatureSrc,
  };
}

export function toAcceptanceOverlay(view: AcceptanceView | null, invite: boolean): AcceptanceOverlay | null {
  if (invite) {
    return { dateLabel: null, signerName: null, signatureSrc: null, invite: true };
  }
  if (!view || view.decision !== "accepted") return null;
  return {
    dateLabel: view.dateLabel,
    signerName: view.signerName,
    signatureSrc: view.signatureSrc,
    invite: false,
  };
}
